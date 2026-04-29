import * as THREE from "three";

export const SPRITE_DIRS = [
  { label: "Front", pos: [0, 0.85, 3.2] as const },
  { label: "Right", pos: [3.2, 0.85, 0] as const },
  { label: "Back",  pos: [0, 0.85, -3.2] as const },
  { label: "Left",  pos: [-3.2, 0.85, 0] as const },
] as const;

export const LOOK_TARGET = new THREE.Vector3(0, 0.85, 0);

function readPixelsFlipped(
  gl: WebGLRenderingContext,
  w: number,
  h: number,
): ImageData {
  const raw = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);

  // WebGL framebuffer is bottom-up; Canvas 2D is top-down — flip Y
  const pixels = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const src = (h - 1 - y) * w * 4;
    const dst = y * w * 4;
    pixels.set(raw.subarray(src, src + w * 4), dst);
  }
  return new ImageData(pixels, w, h);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportSpritesheet(
  scene: THREE.Scene,
  mixer: THREE.AnimationMixer,
  clip: THREE.AnimationClip,
  frameCount = 8,
  frameSize = 64,
): void {
  const action = mixer.clipAction(clip);
  const wasPaused = action.paused;
  const savedTime = action.time;
  action.paused = true;

  // Offscreen renderer with transparent background
  const off = new THREE.WebGLRenderer({ antialias: false, alpha: true });
  off.setSize(frameSize, frameSize);
  off.setClearColor(0x000000, 0);

  const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

  // Composite canvas: columns = frames, rows = directions
  const numDirs = SPRITE_DIRS.length;
  const composite = document.createElement("canvas");
  composite.width = frameCount * frameSize;
  composite.height = numDirs * frameSize;
  const ctx = composite.getContext("2d")!;

  // Temporarily clean up scene for transparent sprite render
  const grid = scene.children.find(c => c instanceof THREE.GridHelper);
  const prevBg = scene.background;
  if (grid) grid.visible = false;
  scene.background = null;

  const gl = off.getContext();

  for (let di = 0; di < numDirs; di++) {
    const dir = SPRITE_DIRS[di]!;
    cam.position.set(dir.pos[0], dir.pos[1], dir.pos[2]);
    cam.lookAt(LOOK_TARGET);

    for (let fi = 0; fi < frameCount; fi++) {
      // Scrub animation to this frame's time
      action.time = (fi / frameCount) * clip.duration;
      mixer.update(0);
      scene.updateMatrixWorld(true);

      off.render(scene, cam);
      ctx.putImageData(readPixelsFlipped(gl, frameSize, frameSize), fi * frameSize, di * frameSize);
    }
  }

  // Restore scene
  if (grid) grid.visible = true;
  scene.background = prevBg;
  action.time = savedTime;
  action.paused = wasPaused;
  mixer.update(0);
  off.dispose();

  composite.toBlob(blob => {
    if (blob) triggerDownload(blob, "walk-sprites.png");
  }, "image/png");
}
