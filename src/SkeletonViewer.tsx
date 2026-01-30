import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type BoneRotation = [number, number, number];
type AnimationFrame = Record<string, BoneRotation>;

interface BoneData {
  name: string;
  parent: string | null;
  position: BoneRotation;
}

interface Animation {
  name: string;
  duration: number;
  frames: AnimationFrame[];
}

interface BodyPartConfig {
  type: "sphere" | "capsule" | "box";
  size: [number] | [number, number] | [number, number, number];
  offset?: [number, number, number];
  rotation?: [number, number, number];
}

const BODY_PARTS: Record<string, BodyPartConfig> = {
  head: { type: "sphere", size: [0.12] },
  neck: { type: "capsule", size: [0.04, 0.15], rotation: [Math.PI / 2, 0, 0] },
  chest: { type: "box", size: [0.25, 0.3, 0.12] },
  spine: { type: "box", size: [0.2, 0.25, 0.1] },
  // Arms - oriented along bone direction (horizontal)
  upper_arm_L: {
    type: "capsule",
    size: [0.05, 0.2],
    rotation: [0, 0, Math.PI / 2],
    offset: [-0.15, 0, 0],
  },
  upper_arm_R: {
    type: "capsule",
    size: [0.05, 0.2],
    rotation: [0, 0, -Math.PI / 2],
    offset: [0.15, 0, 0],
  },
  forearm_L: {
    type: "capsule",
    size: [0.04, 0.2],
    rotation: [0, 0, Math.PI / 2],
    offset: [-0.1, 0, 0],
  },
  forearm_R: {
    type: "capsule",
    size: [0.04, 0.2],
    rotation: [0, 0, -Math.PI / 2],
    offset: [0.1, 0, 0],
  },
  hand_L: { type: "sphere", size: [0.05] },
  hand_R: { type: "sphere", size: [0.05] },
  // Legs - meshes extend UPWARD from bone position toward parent
  // thigh_L bone is at knee (0.4 below hip), mesh fills hip-to-knee
  // shin_L bone is at ankle (0.4 below knee), mesh fills knee-to-ankle
  thigh_L: { type: "capsule", size: [0.07, 0.25], offset: [0, 0.2, 0] },
  thigh_R: { type: "capsule", size: [0.07, 0.25], offset: [0, 0.2, 0] },
  shin_L: { type: "capsule", size: [0.06, 0.25], offset: [0, 0.2, 0] },
  shin_R: { type: "capsule", size: [0.06, 0.25], offset: [0, 0.2, 0] },
  foot_L: { type: "box", size: [0.08, 0.04, 0.12], offset: [0, 0, 0.03] },
  foot_R: { type: "box", size: [0.08, 0.04, 0.12], offset: [0, 0, 0.03] },
};

function createBodyPartMesh(boneName: string): THREE.Mesh | null {
  const config = BODY_PARTS[boneName];
  if (!config) return null;

  let geometry: THREE.BufferGeometry;
  switch (config.type) {
    case "sphere":
      geometry = new THREE.SphereGeometry(config.size[0], 8, 8);
      break;
    case "capsule":
      geometry = new THREE.CapsuleGeometry(
        config.size[0],
        config.size[1] as number,
        4,
        8,
      );
      break;
    case "box":
      geometry = new THREE.BoxGeometry(
        config.size[0],
        config.size[1] as number,
        config.size[2] as number,
      );
      break;
  }

  const material = new THREE.MeshPhongMaterial({
    color: 0x4488ff,
    transparent: true,
    opacity: 0.9,
  });
  const mesh = new THREE.Mesh(geometry, material);

  if (config.offset) mesh.position.set(...config.offset);
  if (config.rotation) mesh.rotation.set(...config.rotation);

  return mesh;
}

// Sample skeleton data - a simple humanoid rig
// Root is positioned at y=1.2 to lift the skeleton above ground
const SAMPLE_SKELETON: { bones: BoneData[] } = {
  bones: [
    { name: "root", parent: null, position: [0, 1.2, 0] },
    { name: "spine", parent: "root", position: [0, 0.5, 0] },
    { name: "chest", parent: "spine", position: [0, 0.3, 0] },
    { name: "neck", parent: "chest", position: [0, 0.3, 0] },
    { name: "head", parent: "neck", position: [0, 0.2, 0] },

    { name: "shoulder_L", parent: "chest", position: [-0.2, 0.2, 0] },
    { name: "upper_arm_L", parent: "shoulder_L", position: [-0.3, 0, 0] },
    { name: "forearm_L", parent: "upper_arm_L", position: [-0.3, 0, 0] },
    { name: "hand_L", parent: "forearm_L", position: [-0.2, 0, 0] },

    { name: "shoulder_R", parent: "chest", position: [0.2, 0.2, 0] },
    { name: "upper_arm_R", parent: "shoulder_R", position: [0.3, 0, 0] },
    { name: "forearm_R", parent: "upper_arm_R", position: [0.3, 0, 0] },
    { name: "hand_R", parent: "forearm_R", position: [0.2, 0, 0] },

    { name: "hip_L", parent: "root", position: [-0.15, -0.1, 0] },
    { name: "thigh_L", parent: "hip_L", position: [0, -0.4, 0] },
    { name: "shin_L", parent: "thigh_L", position: [0, -0.4, 0] },
    { name: "foot_L", parent: "shin_L", position: [0, -0.15, 0.1] },

    { name: "hip_R", parent: "root", position: [0.15, -0.1, 0] },
    { name: "thigh_R", parent: "hip_R", position: [0, -0.4, 0] },
    { name: "shin_R", parent: "thigh_R", position: [0, -0.4, 0] },
    { name: "foot_R", parent: "shin_R", position: [0, -0.15, 0.1] },
  ],
};

// Motion capture walk cycle from CMU Mocap Database (BVH-Examples/walk-cycle.bvh)
// 42 frames at 120fps subsampled to 8 keyframes, converted deg→rad
// Leg rotations from mocap, arm swing derived from contralateral hip motion
const WALK_ANIMATION: Animation = {
  name: "Walk",
  duration: 1.75,
  frames: [
    // Frame 0 (BVH 0) - Left knee high, right stance
    {
      hip_L: [-0.24, 0, 0], thigh_L: [1.02, 0, 0], shin_L: [0, 0, 0],
      hip_R: [-0.26, 0, 0], thigh_R: [0.21, 0, 0], shin_R: [-0.09, 0, 0],
      shoulder_L: [-0.16, 0, 0], forearm_L: [-0.25, 0, 0],
      shoulder_R: [-0.14, 0, 0], forearm_R: [-0.24, 0, 0],
      spine: [0, 0.01, 0],
    },
    // Frame 1 (BVH 5) - Left swing forward, right loading
    {
      hip_L: [-0.53, 0, 0], thigh_L: [0.99, 0, 0], shin_L: [-0.17, 0, 0],
      hip_R: [-0.11, 0, 0], thigh_R: [0.13, 0, 0], shin_R: [-0.13, 0, 0],
      shoulder_L: [-0.07, 0, 0], forearm_L: [-0.22, 0, 0],
      shoulder_R: [-0.32, 0, 0], forearm_R: [-0.30, 0, 0],
      spine: [0, -0.02, 0],
    },
    // Frame 2 (BVH 10) - Left extending, right mid stance
    {
      hip_L: [-0.53, 0, 0], thigh_L: [0.24, 0, 0], shin_L: [-0.20, 0, 0],
      hip_R: [0.01, 0, 0], thigh_R: [0.14, 0, 0], shin_R: [-0.19, 0, 0],
      shoulder_L: [0.01, 0, 0], forearm_L: [-0.20, 0, 0],
      shoulder_R: [-0.32, 0, 0], forearm_R: [-0.30, 0, 0],
      spine: [0, -0.03, 0],
    },
    // Frame 3 (BVH 16) - Left planted, right lifting
    {
      hip_L: [-0.49, 0, 0], thigh_L: [0.33, 0, 0], shin_L: [-0.05, 0, 0],
      hip_R: [0.07, 0, 0], thigh_R: [0.42, 0, 0], shin_R: [-0.21, 0, 0],
      shoulder_L: [0.04, 0, 0], forearm_L: [-0.21, 0, 0],
      shoulder_R: [-0.29, 0, 0], forearm_R: [-0.29, 0, 0],
      spine: [0, -0.02, 0],
    },
    // Frame 4 (BVH 21) - Right knee high, left stance
    {
      hip_L: [-0.32, 0, 0], thigh_L: [0.39, 0, 0], shin_L: [-0.11, 0, 0],
      hip_R: [-0.23, 0, 0], thigh_R: [0.98, 0, 0], shin_R: [0.05, 0, 0],
      shoulder_L: [-0.14, 0, 0], forearm_L: [-0.24, 0, 0],
      shoulder_R: [-0.19, 0, 0], forearm_R: [-0.26, 0, 0],
      spine: [0, 0.01, 0],
    },
    // Frame 5 (BVH 26) - Right swing forward, left loading
    {
      hip_L: [-0.12, 0, 0], thigh_L: [0.27, 0, 0], shin_L: [-0.15, 0, 0],
      hip_R: [-0.48, 0, 0], thigh_R: [0.73, 0, 0], shin_R: [-0.10, 0, 0],
      shoulder_L: [-0.29, 0, 0], forearm_L: [-0.29, 0, 0],
      shoulder_R: [-0.07, 0, 0], forearm_R: [-0.22, 0, 0],
      spine: [0, 0.02, 0],
    },
    // Frame 6 (BVH 31) - Right extending, left mid stance
    {
      hip_L: [0.02, 0, 0], thigh_L: [0.29, 0, 0], shin_L: [-0.23, 0, 0],
      hip_R: [-0.41, 0, 0], thigh_R: [0.01, 0, 0], shin_R: [-0.19, 0, 0],
      shoulder_L: [-0.25, 0, 0], forearm_L: [-0.27, 0, 0],
      shoulder_R: [0.01, 0, 0], forearm_R: [-0.20, 0, 0],
      spine: [0, 0.03, 0],
    },
    // Frame 7 (BVH 37) - Right planted, left lifting
    {
      hip_L: [0.04, 0, 0], thigh_L: [0.54, 0, 0], shin_L: [-0.25, 0, 0],
      hip_R: [-0.41, 0, 0], thigh_R: [0.24, 0, 0], shin_R: [-0.03, 0, 0],
      shoulder_L: [-0.25, 0, 0], forearm_L: [-0.27, 0, 0],
      shoulder_R: [0.02, 0, 0], forearm_R: [-0.20, 0, 0],
      spine: [0, 0.02, 0],
    },
  ],
};

const IDLE_ANIMATION: Animation = {
  name: "Idle",
  duration: 2.0,
  frames: [
    {
      chest: [0, 0.05, 0],
      upper_arm_L: [0, 0, 0.1],
      upper_arm_R: [0, 0, -0.1],
    },
    { chest: [0, 0, 0], upper_arm_L: [0, 0, 0], upper_arm_R: [0, 0, 0] },
    {
      chest: [0, -0.05, 0],
      upper_arm_L: [0, 0, -0.1],
      upper_arm_R: [0, 0, 0.1],
    },
    { chest: [0, 0, 0], upper_arm_L: [0, 0, 0], upper_arm_R: [0, 0, 0] },
  ],
};

export default function SkeletonViewer() {
  const mountRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentAnimation, setCurrentAnimation] = useState("Walk");
  const [showPixelView, setShowPixelView] = useState(false);
  const [showSkin, setShowSkin] = useState(true);
  const [currentFrame, setCurrentFrame] = useState(0);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const boneObjectsRef = useRef<Record<string, THREE.Object3D>>({});
  const bodyMeshesRef = useRef<THREE.Mesh[]>([]);
  const skeletonMeshesRef = useRef<THREE.Mesh[]>([]);
  const animationTimeRef = useRef(0);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      45,
      mount.clientWidth / mount.clientHeight,
      0.1,
      1000,
    );
    camera.position.set(3, 1.5, 4);
    camera.lookAt(0, 1.0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);

    // Grid
    const gridHelper = new THREE.GridHelper(5, 10, 0x444444, 0x222222);
    scene.add(gridHelper);

    // Build skeleton
    const boneObjects: Record<string, THREE.Object3D> = {};
    const boneMeshes = new THREE.Group();
    const skeletonMeshes: THREE.Mesh[] = [];
    const bodyMeshes: THREE.Mesh[] = [];
    scene.add(boneMeshes);

    SAMPLE_SKELETON.bones.forEach((boneData) => {
      const bone = new THREE.Object3D();
      bone.name = boneData.name;
      bone.position.set(
        boneData.position[0],
        boneData.position[1],
        boneData.position[2],
      );

      // Create skeleton debug sphere (orange)
      const sphereGeometry = new THREE.SphereGeometry(0.05, 8, 8);
      const sphereMaterial = new THREE.MeshPhongMaterial({ color: 0xff6600 });
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
      bone.add(sphere);
      skeletonMeshes.push(sphere);

      // Create body part mesh (blue)
      const bodyMesh = createBodyPartMesh(boneData.name);
      if (bodyMesh) {
        bone.add(bodyMesh);
        bodyMeshes.push(bodyMesh);
      }

      boneObjects[boneData.name] = bone;

      const parentBone = boneData.parent ? boneObjects[boneData.parent] : null;
      if (parentBone) {
        parentBone.add(bone);
      } else {
        boneMeshes.add(bone);
      }
    });

    // Store mesh refs for visibility toggling
    bodyMeshesRef.current = bodyMeshes;
    skeletonMeshesRef.current = skeletonMeshes;

    // Create lines between bones
    SAMPLE_SKELETON.bones.forEach((boneData) => {
      const parentBone = boneData.parent ? boneObjects[boneData.parent] : null;
      if (parentBone) {
        const lineGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array([
          0,
          0,
          0,
          boneData.position[0],
          boneData.position[1],
          boneData.position[2],
        ]);
        lineGeometry.setAttribute(
          "position",
          new THREE.BufferAttribute(positions, 3),
        );
        const lineMaterial = new THREE.LineBasicMaterial({
          color: 0x00ff88,
          linewidth: 2,
        });
        const line = new THREE.Line(lineGeometry, lineMaterial);
        parentBone.add(line);
      }
    });

    boneObjectsRef.current = boneObjects;

    // Animation loop
    let animationId: number;
    function animate() {
      animationId = requestAnimationFrame(animate);

      animationTimeRef.current += 0.016; // ~60fps

      const anim =
        currentAnimation === "Walk" ? WALK_ANIMATION : IDLE_ANIMATION;
      const frameIndex =
        Math.floor(
          (animationTimeRef.current / anim.duration) * anim.frames.length,
        ) % anim.frames.length;
      setCurrentFrame(frameIndex);

      const frame = anim.frames[frameIndex];
      if (!frame) return;

      // Reset all rotations
      Object.values(boneObjects).forEach((bone) => {
        bone.rotation.set(0, 0, 0);
      });

      // Apply frame rotations
      Object.entries(frame).forEach(([boneName, rotation]) => {
        const bone = boneObjects[boneName];
        if (bone) {
          bone.rotation.set(rotation[0], rotation[1], rotation[2]);
        }
      });

      renderer.render(scene, camera);
    }
    animate();

    // Handle resize
    const handleResize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener("resize", handleResize);

    // Also observe container size changes
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mount);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
      mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [currentAnimation]);

  // Separate effect to handle pixel view updates using offscreen renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    const mainCamera = cameraRef.current;
    const scene = sceneRef.current;
    if (!showPixelView || !canvas || !mainCamera || !scene) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = 64;
    const height = 64;

    // Create offscreen renderer for pixel view
    const pixelRenderer = new THREE.WebGLRenderer({ antialias: false });
    pixelRenderer.setSize(width, height);

    // Create a camera that matches the main camera but with square aspect
    const pixelCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    pixelCamera.position.copy(mainCamera.position);
    pixelCamera.quaternion.copy(mainCamera.quaternion);

    // Buffer to read pixels
    const pixelBuffer = new Uint8Array(width * height * 4);

    const updatePixelView = () => {
      // Sync camera position/rotation with main camera
      pixelCamera.position.copy(mainCamera.position);
      pixelCamera.quaternion.copy(mainCamera.quaternion);

      // Render the scene
      pixelRenderer.render(scene, pixelCamera);

      // Read pixels from WebGL context
      const gl = pixelRenderer.getContext();
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuffer);

      // Create ImageData and copy pixels (flip Y since WebGL is bottom-up)
      const imageData = ctx.createImageData(width, height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const srcIdx = ((height - 1 - y) * width + x) * 4;
          const dstIdx = (y * width + x) * 4;
          imageData.data[dstIdx] = pixelBuffer[srcIdx] ?? 0;
          imageData.data[dstIdx + 1] = pixelBuffer[srcIdx + 1] ?? 0;
          imageData.data[dstIdx + 2] = pixelBuffer[srcIdx + 2] ?? 0;
          imageData.data[dstIdx + 3] = pixelBuffer[srcIdx + 3] ?? 255;
        }
      }
      ctx.putImageData(imageData, 0, 0);
    };

    // Run update loop for pixel view
    let pixelAnimId: number;
    const pixelAnimate = () => {
      pixelAnimId = requestAnimationFrame(pixelAnimate);
      updatePixelView();
    };
    pixelAnimate();

    return () => {
      cancelAnimationFrame(pixelAnimId);
      pixelRenderer.dispose();
    };
  }, [showPixelView, currentAnimation]);

  // Toggle visibility between skeleton and skin
  useEffect(() => {
    bodyMeshesRef.current.forEach((m) => (m.visible = showSkin));
    skeletonMeshesRef.current.forEach((m) => (m.visible = !showSkin));
  }, [showSkin]);

  return (
    <div className="w-full h-screen relative bg-gray-900 text-white overflow-hidden">
      {/* Main 3D canvas - takes full screen */}
      <div ref={mountRef} style={{ width: "100vw", height: "100vh" }} />

      {/* Pixel view - top right overlay */}
      {showPixelView && (
        <div className="absolute top-4 right-4 z-10 bg-gray-950/90 p-2 rounded border border-gray-700">
          <h3 className="text-xs font-bold mb-1 text-center">2D Pixel</h3>
          <canvas
            ref={canvasRef}
            width={64}
            height={64}
            className="border border-gray-600"
            style={{
              imageRendering: "pixelated",
              width: "128px",
              height: "128px",
            }}
          />
        </div>
      )}

      {/* Controls - bottom left overlay */}
      <div className="absolute bottom-4 left-4 z-10 bg-gray-800/90 p-3 rounded border border-gray-700 space-y-2">
        <div className="flex gap-2">
          <button
            onClick={() => {
              setCurrentAnimation("Walk");
              animationTimeRef.current = 0;
            }}
            className={`px-3 py-1 rounded text-sm ${
              currentAnimation === "Walk"
                ? "bg-blue-600"
                : "bg-gray-600 hover:bg-gray-500"
            }`}
          >
            Walk
          </button>
          <button
            onClick={() => {
              setCurrentAnimation("Idle");
              animationTimeRef.current = 0;
            }}
            className={`px-3 py-1 rounded text-sm ${
              currentAnimation === "Idle"
                ? "bg-blue-600"
                : "bg-gray-600 hover:bg-gray-500"
            }`}
          >
            Idle
          </button>
          <span className="text-xs text-gray-400 self-center ml-2">
            Frame: {currentFrame}
          </span>
        </div>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={showSkin}
              onChange={(e) => setShowSkin(e.target.checked)}
            />
            Skin
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={showPixelView}
              onChange={(e) => setShowPixelView(e.target.checked)}
            />
            Pixel View
          </label>
        </div>
      </div>
    </div>
  );
}
