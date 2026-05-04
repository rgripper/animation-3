import * as THREE from "three";

export interface PositionMapBounds {
  min: [number, number, number]; // world-space XYZ minimum (metres)
  max: [number, number, number]; // world-space XYZ maximum (metres)
}

export interface PositionMapResult {
  /**
   * Float32Array[width * height * 4]: [worldX, worldY, worldZ, limbId+1] per pixel,
   * top-left origin, row-major. limbId+1 == 0 means background (no limb).
   * limbId is an index into limbNames[].
   */
  front: Float32Array;
  back: Float32Array;
  limbNames: string[];
  bounds: PositionMapBounds;
  width: number;
  height: number;
}

const VERT = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform float uLimbId;
  varying vec3 vWorldPos;
  void main() {
    gl_FragColor = vec4(vWorldPos, uLimbId + 1.0);
  }
`;

/**
 * Generates front and back orthographic position maps for a set of limb meshes.
 *
 * Each pixel stores the world-space 3D position of the nearest surface point
 * visible from that direction:
 *   front = surfaces facing the front camera (max-Z side)
 *   back  = surfaces facing the back camera (min-Z side)
 *
 * Uses a proxy scene so the original scene is untouched.
 */
export function generatePositionMaps(
  renderer: THREE.WebGLRenderer,
  limbMeshes: Map<string, THREE.Mesh[]>,
  resolution = 64,
): PositionMapResult {
  const limbNames: string[] = [];
  const limbIdMap = new Map<string, number>();
  limbMeshes.forEach((_, name) => {
    limbIdMap.set(name, limbNames.length);
    limbNames.push(name);
  });

  // Build a proxy scene: each limb mesh shares geometry but gets a
  // position-encoding ShaderMaterial with its world matrix baked in.
  const proxyScene = new THREE.Scene();
  const tempMats: THREE.ShaderMaterial[] = [];

  limbMeshes.forEach((meshes, name) => {
    const id = limbIdMap.get(name)!;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uLimbId: { value: id } },
    });
    tempMats.push(mat);

    meshes.forEach(mesh => {
      mesh.updateWorldMatrix(true, false);
      const proxy = new THREE.Mesh(mesh.geometry, mat);
      // matrixAutoUpdate=false means Three.js uses proxy.matrix directly.
      // As a root-level object, matrixWorld = matrix = mesh.matrixWorld.
      proxy.matrixAutoUpdate = false;
      proxy.matrix.copy(mesh.matrixWorld);
      proxy.matrixWorldNeedsUpdate = true;
      proxyScene.add(proxy);
    });
  });

  // Compute world-space bounding box from proxy matrices + geometry bounds
  const box = new THREE.Box3();
  proxyScene.children.forEach(obj => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.geometry.computeBoundingBox();
    const gb = obj.geometry.boundingBox!.clone().applyMatrix4(obj.matrix);
    box.union(gb);
  });

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const pad = 0.05;

  const hw = size.x / 2 + pad;
  const hh = size.y / 2 + pad;
  const dz = size.z / 2 + pad;
  const camDist = dz + 1;

  const cam = new THREE.OrthographicCamera(
    center.x - hw, center.x + hw,
    center.y + hh, center.y - hh,
    camDist - dz - 0.01,
    camDist + dz + 0.01,
  );

  const rt = new THREE.WebGLRenderTarget(resolution, resolution, {
    type: THREE.FloatType,
    format: THREE.RGBAFormat,
    depthBuffer: true,
  });

  const prevTarget = renderer.getRenderTarget();
  const prevClearColor = new THREE.Color();
  const prevClearAlpha = renderer.getClearAlpha();
  renderer.getClearColor(prevClearColor);
  renderer.setClearColor(0x000000, 0);

  const rawFront = new Float32Array(resolution * resolution * 4);
  const rawBack = new Float32Array(resolution * resolution * 4);

  // Front: camera at +Z looking toward -Z; depth keeps max-Z (front-facing) surface
  cam.position.set(center.x, center.y, center.z + camDist);
  cam.lookAt(center);
  renderer.setRenderTarget(rt);
  renderer.clear();
  renderer.render(proxyScene, cam);
  renderer.readRenderTargetPixels(rt, 0, 0, resolution, resolution, rawFront);

  // Back: camera at -Z looking toward +Z; depth keeps min-Z (back-facing) surface
  cam.position.set(center.x, center.y, center.z - camDist);
  cam.lookAt(center);
  renderer.setRenderTarget(rt);
  renderer.clear();
  renderer.render(proxyScene, cam);
  renderer.readRenderTargetPixels(rt, 0, 0, resolution, resolution, rawBack);

  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClearColor, prevClearAlpha);
  rt.dispose();
  tempMats.forEach(m => m.dispose());

  // WebGL readback is bottom-left origin; flip Y to match top-left (canvas) convention
  const bounds: PositionMapBounds = {
    min: [box.min.x, box.min.y, box.min.z],
    max: [box.max.x, box.max.y, box.max.z],
  };

  return {
    front: flipY(rawFront, resolution, resolution),
    back: flipY(rawBack, resolution, resolution),
    limbNames,
    bounds,
    width: resolution,
    height: resolution,
  };
}

function flipY(data: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(data.length);
  const row = w * 4;
  for (let y = 0; y < h; y++) {
    out.set(data.subarray((h - 1 - y) * row, (h - y) * row), y * row);
  }
  return out;
}

/**
 * Downloads two PNGs (front + back) and a metadata JSON.
 *
 * PNG channel layout (rgba8unorm, as used in WebGPU):
 *   R = worldX normalized to [0,1] within bounds
 *   G = worldY normalized to [0,1] within bounds
 *   B = worldZ normalized to [0,1] within bounds
 *   A = limbId + 1  (0 = background, 1..N = limbId 0..N-1)
 *
 * Reconstruct in WGSL:
 *   let s = textureSample(posMap, samp, uv);
 *   let limbId = i32(s.a * 255.0 + 0.5) - 1;          // -1 = background
 *   let worldPos = s.rgb * (boundsMax - boundsMin) + boundsMin;
 */
export function downloadPositionMapsAsPNG(result: PositionMapResult): void {
  const { front, back, bounds, width, height, limbNames } = result;
  const [xMin, yMin, zMin] = bounds.min;
  const [xMax, yMax, zMax] = bounds.max;
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;
  const zRange = zMax - zMin || 1;

  function toCanvas(data: Float32Array): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    const img = ctx.createImageData(width, height);
    const { data: px } = img;
    for (let i = 0; i < width * height; i++) {
      const i4 = i * 4;
      px[i4 + 0] = norm(data[i4 + 0], xMin, xRange);
      px[i4 + 1] = norm(data[i4 + 1], yMin, yRange);
      px[i4 + 2] = norm(data[i4 + 2], zMin, zRange);
      // data[i4+3] is limbId+1 as a float; round to nearest integer for alpha byte
      px[i4 + 3] = Math.round(data[i4 + 3]);
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  function triggerDownload(href: string, filename: string, delay: number): void {
    setTimeout(() => {
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      a.click();
    }, delay);
  }

  triggerDownload(toCanvas(front).toDataURL("image/png"), "position-map-front.png", 0);
  triggerDownload(toCanvas(back).toDataURL("image/png"), "position-map-back.png", 150);

  const meta = {
    limbNames,
    bounds,
    // Channel layout: R=worldX, G=worldY, B=worldZ (normalized to bounds), A=limbId+1 (0=bg)
  };
  const metaUrl = URL.createObjectURL(
    new Blob([JSON.stringify(meta, null, 2)], { type: "application/json" }),
  );
  triggerDownload(metaUrl, "position-map-meta.json", 300);
  setTimeout(() => URL.revokeObjectURL(metaUrl), 1000);
}

function norm(v: number, min: number, range: number): number {
  return Math.max(0, Math.min(255, Math.round(((v - min) / range) * 255)));
}
