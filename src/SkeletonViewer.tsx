import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

// Maps common FBX/Mixamo bone names to our custom skeleton bone names
const FBX_BONE_MAP: Record<string, string> = {
  // Mixamo with prefix
  "mixamorig:Hips": "root",
  "mixamorig:Spine": "spine",
  "mixamorig:Spine1": "chest",
  "mixamorig:Spine2": "chest",
  "mixamorig:Neck": "neck",
  "mixamorig:Head": "head",
  "mixamorig:LeftShoulder": "shoulder_L",
  "mixamorig:LeftArm": "upper_arm_L",
  "mixamorig:LeftForeArm": "forearm_L",
  "mixamorig:LeftHand": "hand_L",
  "mixamorig:RightShoulder": "shoulder_R",
  "mixamorig:RightArm": "upper_arm_R",
  "mixamorig:RightForeArm": "forearm_R",
  "mixamorig:RightHand": "hand_R",
  "mixamorig:LeftUpLeg": "hip_L",
  "mixamorig:LeftLeg": "thigh_L",
  "mixamorig:LeftFoot": "shin_L",
  "mixamorig:LeftToeBase": "foot_L",
  "mixamorig:RightUpLeg": "hip_R",
  "mixamorig:RightLeg": "thigh_R",
  "mixamorig:RightFoot": "shin_R",
  "mixamorig:RightToeBase": "foot_R",
  // Without prefix
  Hips: "root",
  Spine: "spine",
  Spine1: "chest",
  Spine2: "chest",
  Neck: "neck",
  Head: "head",
  LeftShoulder: "shoulder_L",
  LeftArm: "upper_arm_L",
  LeftForeArm: "forearm_L",
  LeftHand: "hand_L",
  RightShoulder: "shoulder_R",
  RightArm: "upper_arm_R",
  RightForeArm: "forearm_R",
  RightHand: "hand_R",
  LeftUpLeg: "hip_L",
  LeftLeg: "thigh_L",
  LeftFoot: "shin_L",
  LeftToeBase: "foot_L",
  RightUpLeg: "hip_R",
  RightLeg: "thigh_R",
  RightFoot: "shin_R",
  RightToeBase: "foot_R",
};

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
  color?: number;
}

// Colors for clothing
const SKIN_COLOR = 0xd4a574;
const SHIRT_COLOR = 0x3366aa;
const PANTS_COLOR = 0x3a3a4a;
const SHOE_COLOR = 0x2a2a2a;

// Each mesh sits on its bone and spans TOWARD its child bone.
// Offset = halfway to child. Size covers the full segment with slight overlap.
// Skeleton reference (shortened torso):
//   root(0,1.05,0) → spine(0,+0.35) → chest(0,+0.25) → neck(0,+0.25) → head(0,+0.15)
//   chest → shoulder_L(-0.18,+0.18) → upper_arm_L(-0.28,0) → forearm_L(-0.26,0) → hand_L(-0.18,0)
//   root → hip_L(-0.12,-0.08) → thigh_L(0,-0.42) → shin_L(0,-0.40) → foot_L(0,-0.12,+0.08)
const BODY_PARTS: Record<string, BodyPartConfig> = {
  // -- Torso: each box spans from bone toward child --
  // root → spine: (0, +0.35, 0)
  root: {
    type: "box", size: [0.28, 0.38, 0.15], offset: [0, 0.17, 0],
    color: PANTS_COLOR,
  },
  // spine → chest: (0, +0.25, 0)
  spine: {
    type: "box", size: [0.28, 0.28, 0.15], offset: [0, 0.12, 0],
    color: SHIRT_COLOR,
  },
  // chest → neck: (0, +0.25, 0)
  chest: {
    type: "box", size: [0.30, 0.28, 0.16], offset: [0, 0.12, 0],
    color: SHIRT_COLOR,
  },

  // -- Neck & Head (skin) --
  // neck → head: (0, +0.15, 0)
  neck: {
    type: "capsule", size: [0.045, 0.05], offset: [0, 0.075, 0],
    color: SKIN_COLOR,
  },
  // head: terminal
  head: { type: "sphere", size: [0.11], color: SKIN_COLOR },

  // -- Arms (shirt sleeves): capsules rotated to align with X axis --
  // shoulder_L → upper_arm_L: (-0.28, 0, 0)
  shoulder_L: {
    type: "capsule", size: [0.06, 0.14],
    rotation: [0, 0, Math.PI / 2], offset: [-0.14, 0, 0],
    color: SHIRT_COLOR,
  },
  shoulder_R: {
    type: "capsule", size: [0.06, 0.14],
    rotation: [0, 0, -Math.PI / 2], offset: [0.14, 0, 0],
    color: SHIRT_COLOR,
  },
  // upper_arm → forearm: (-0.26, 0, 0)
  upper_arm_L: {
    type: "capsule", size: [0.05, 0.16],
    rotation: [0, 0, Math.PI / 2], offset: [-0.13, 0, 0],
    color: SHIRT_COLOR,
  },
  upper_arm_R: {
    type: "capsule", size: [0.05, 0.16],
    rotation: [0, 0, -Math.PI / 2], offset: [0.13, 0, 0],
    color: SHIRT_COLOR,
  },
  // forearm → hand: (-0.18, 0, 0)
  forearm_L: {
    type: "capsule", size: [0.04, 0.10],
    rotation: [0, 0, Math.PI / 2], offset: [-0.09, 0, 0],
    color: SHIRT_COLOR,
  },
  forearm_R: {
    type: "capsule", size: [0.04, 0.10],
    rotation: [0, 0, -Math.PI / 2], offset: [0.09, 0, 0],
    color: SHIRT_COLOR,
  },
  // hands: terminal (skin)
  hand_L: { type: "sphere", size: [0.035], color: SKIN_COLOR },
  hand_R: { type: "sphere", size: [0.035], color: SKIN_COLOR },

  // -- Legs (pants): capsules span DOWN from bone toward child --
  // hip → thigh: (0, -0.42, 0) — upper leg
  hip_L: {
    type: "capsule", size: [0.08, 0.26], offset: [0, -0.21, 0],
    color: PANTS_COLOR,
  },
  hip_R: {
    type: "capsule", size: [0.08, 0.26], offset: [0, -0.21, 0],
    color: PANTS_COLOR,
  },
  // thigh → shin: (0, -0.40, 0) — lower leg
  thigh_L: {
    type: "capsule", size: [0.065, 0.26], offset: [0, -0.20, 0],
    color: PANTS_COLOR,
  },
  thigh_R: {
    type: "capsule", size: [0.065, 0.26], offset: [0, -0.20, 0],
    color: PANTS_COLOR,
  },
  // shin → foot: (0, -0.12, 0.08) — ankle area
  shin_L: {
    type: "capsule", size: [0.055, 0.03], offset: [0, -0.05, 0.03],
    color: PANTS_COLOR,
  },
  shin_R: {
    type: "capsule", size: [0.055, 0.03], offset: [0, -0.05, 0.03],
    color: PANTS_COLOR,
  },

  // -- Shoes --
  // foot: terminal
  foot_L: {
    type: "box", size: [0.09, 0.06, 0.18], offset: [0, -0.01, 0.04],
    color: SHOE_COLOR,
  },
  foot_R: {
    type: "box", size: [0.09, 0.06, 0.18], offset: [0, -0.01, 0.04],
    color: SHOE_COLOR,
  },
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
    color: config.color ?? 0x4488ff,
    flatShading: true,
    transparent: true,
    opacity: 0.95,
  });
  const mesh = new THREE.Mesh(geometry, material);

  if (config.offset) mesh.position.set(...config.offset);
  if (config.rotation) mesh.rotation.set(...config.rotation);

  return mesh;
}

// Sword mesh: handle + crossguard + blade + pommel, extending along +X from hand_R
// The right arm extends along +X, so the blade points in the same direction as the arm.
function createSwordMesh(): THREE.Group {
  const sword = new THREE.Group();

  // Pommel (gold, at base of grip)
  const pommel = new THREE.Mesh(
    new THREE.SphereGeometry(0.018, 8, 8),
    new THREE.MeshPhongMaterial({ color: 0xc8a000, shininess: 120 }),
  );
  pommel.position.set(-0.022, 0, 0);
  sword.add(pommel);

  // Handle / grip (brown leather)
  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.024, 0.024),
    new THREE.MeshPhongMaterial({ color: 0x6b3a1f }),
  );
  handle.position.set(0.038, 0, 0);
  sword.add(handle);

  // Crossguard (gold bar perpendicular to blade)
  const guard = new THREE.Mesh(
    new THREE.BoxGeometry(0.030, 0.16, 0.020),
    new THREE.MeshPhongMaterial({ color: 0xc8a000, shininess: 120 }),
  );
  guard.position.set(0.100, 0, 0);
  sword.add(guard);

  // Blade (steel, extends from guard toward tip)
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.022, 0.009),
    new THREE.MeshPhongMaterial({ color: 0xd4d4d8, shininess: 220 }),
  );
  blade.position.set(0.330, 0, 0);
  sword.add(blade);

  return sword;
}

// Sample skeleton data - a simple humanoid rig
// Root is positioned at y=1.05 (adjusted for shorter torso)
// Torso proportions: root→spine 0.35, spine→chest 0.25, chest→neck 0.25
const SAMPLE_SKELETON: { bones: BoneData[] } = {
  bones: [
    { name: "root", parent: null, position: [0, 1.05, 0] },
    { name: "spine", parent: "root", position: [0, 0.35, 0] },
    { name: "chest", parent: "spine", position: [0, 0.25, 0] },
    { name: "neck", parent: "chest", position: [0, 0.25, 0] },
    { name: "head", parent: "neck", position: [0, 0.15, 0] },

    { name: "shoulder_L", parent: "chest", position: [-0.18, 0.18, 0] },
    { name: "upper_arm_L", parent: "shoulder_L", position: [-0.28, 0, 0] },
    { name: "forearm_L", parent: "upper_arm_L", position: [-0.26, 0, 0] },
    { name: "hand_L", parent: "forearm_L", position: [-0.18, 0, 0] },

    { name: "shoulder_R", parent: "chest", position: [0.18, 0.18, 0] },
    { name: "upper_arm_R", parent: "shoulder_R", position: [0.28, 0, 0] },
    { name: "forearm_R", parent: "upper_arm_R", position: [0.26, 0, 0] },
    { name: "hand_R", parent: "forearm_R", position: [0.18, 0, 0] },

    { name: "hip_L", parent: "root", position: [-0.12, -0.08, 0] },
    { name: "thigh_L", parent: "hip_L", position: [0, -0.42, 0] },
    { name: "shin_L", parent: "thigh_L", position: [0, -0.40, 0] },
    { name: "foot_L", parent: "shin_L", position: [0, -0.12, 0.08] },

    { name: "hip_R", parent: "root", position: [0.12, -0.08, 0] },
    { name: "thigh_R", parent: "hip_R", position: [0, -0.42, 0] },
    { name: "shin_R", parent: "thigh_R", position: [0, -0.40, 0] },
    { name: "foot_R", parent: "shin_R", position: [0, -0.12, 0.08] },
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

// Sword swing: right-handed overhead slash in 6 keyframes, 1.0 second
//
// Verified sign conventions (child bone sits along parent's local +X):
//   shoulder_R.z  POSITIVE → arm rises (+Y)   NEGATIVE → arm drops (-Y)
//   shoulder_R.y  POSITIVE → arm sweeps BACK (-Z)   NEGATIVE → arm drives FORWARD (+Z)
//   chest.y       POSITIVE → right shoulder coils BACK   NEGATIVE → right shoulder drives FORWARD
//   (rotation.x on these bones rolls around the arm axis — no positional effect on the child)
//
// The arc: guard → arm rises + goes back (wind-up) → arm drops + drives forward (strike)
// Both z and y are on shoulder_R so the whole arm lifts, not just the elbow.
const SWORD_SWING_ANIMATION: Animation = {
  name: "Sword",
  duration: 1.0,
  frames: [
    // Frame 0: Guard — arm raised and slightly forward
    {
      shoulder_R: [0, -0.2, 0.5],
      upper_arm_L: [0, 0, 0.2],
      forearm_L: [0, 0, 0.1],
    },
    // Frame 1: Wind-up begins — arm rises and sweeps back, body starts coiling
    {
      chest: [0, 0.3, 0],
      spine: [0, 0.1, 0],
      shoulder_R: [0, 0.4, 0.9],
      upper_arm_R: [0, 0, 0.3],
      shoulder_L: [0, 0.2, 0],
      upper_arm_L: [0, 0, 0.3],
    },
    // Frame 2: Full wind-up — arm fully overhead and behind, body fully coiled
    {
      chest: [0, 0.55, 0],
      spine: [0.05, 0.2, 0],
      shoulder_R: [0, 0.7, 1.4],
      upper_arm_R: [0, 0, 0.4],
      shoulder_L: [0, 0.3, 0],
      upper_arm_L: [0, 0, 0.4],
      thigh_L: [0.05, 0, 0],
      thigh_R: [-0.05, 0, 0],
    },
    // Frame 3: Strike — arm drops and drives forward, body unwinds
    {
      chest: [0, -0.35, 0],
      spine: [-0.05, -0.15, 0],
      shoulder_R: [0, -0.6, -0.4],
      upper_arm_R: [0, 0, 0.1],
      shoulder_L: [0, -0.3, 0],
      upper_arm_L: [0, 0, -0.1],
    },
    // Frame 4: Follow-through — arm continues down and forward past impact
    {
      chest: [0, -0.25, 0],
      spine: [0, -0.1, 0],
      shoulder_R: [0, -0.5, -0.7],
      shoulder_L: [0, -0.2, 0],
    },
    // Frame 5: Recovery — arm lifts back toward guard
    {
      shoulder_R: [0, -0.2, 0.3],
      upper_arm_L: [0, 0, 0.1],
    },
  ],
};

export default function SkeletonViewer() {
  const mountRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentAnimation, setCurrentAnimation] = useState("Walk");
  const [showPixelView, setShowPixelView] = useState(false);
  const [showSkin, setShowSkin] = useState(true);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [currentVariant, setCurrentVariant] = useState(1); // 0=tall, 1=normal, 2=short

  const [pixelArtMode, setPixelArtMode] = useState(false);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const boneObjectsRef = useRef<Record<string, THREE.Object3D>>({});
  const bodyMeshesRef = useRef<THREE.Mesh[]>([]);
  const skeletonMeshesRef = useRef<THREE.Mesh[]>([]);
  const animationTimeRef = useRef(0);
  const currentVariantRef = useRef(1);
  const currentAnimationRef = useRef("Walk");
  const fbxMixerRef = useRef<THREE.AnimationMixer | null>(null);
  const fbxModelRef = useRef<THREE.Group | null>(null);
  const fbxBonesRef = useRef<Map<string, THREE.Bone>>(new Map());
  const customCharGroupRef = useRef<THREE.Group | null>(null);
  const clockRef = useRef(new THREE.Clock());
  const pixelArtModeRef = useRef(false);

  // Camera positions for 4 directions (Front, Right, Back, Left)
  const DIRECTIONS = [
    { name: "front", pos: [0, 1.5, 4] as const },
    { name: "right", pos: [4, 1.5, 0] as const },
    { name: "back", pos: [0, 1.5, -4] as const },
    { name: "left", pos: [-4, 1.5, 0] as const },
  ];

  // Body size variants: scale Y for height, slight X/Z for width
  const BODY_VARIANTS = [
    { name: "tall", scaleY: 1.12, scaleXZ: 0.95, cameraY: 1.6 },
    { name: "normal", scaleY: 0.92, scaleXZ: 1.0, cameraY: 1.4 },
    { name: "short", scaleY: 0.78, scaleXZ: 1.05, cameraY: 1.2 },
  ];

  const exportSpritesheet = () => {
    const scene = sceneRef.current;
    const boneObjects = boneObjectsRef.current;
    const skeletonMeshes = skeletonMeshesRef.current;
    const rootBone = boneObjects["root"];
    if (!scene || !rootBone) return;

    const frameSize = 64;
    const anim = WALK_ANIMATION;
    const numFrames = anim.frames.length;
    const numDirs = DIRECTIONS.length;
    const numVariants = BODY_VARIANTS.length;

    // Offscreen WebGL renderer with transparent background
    const offRenderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
    });
    offRenderer.setSize(frameSize, frameSize);
    offRenderer.setClearColor(0x000000, 0);

    // Offscreen camera (square aspect)
    const offCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);

    // Composite canvas: 8 cols x (4 directions × 3 variants) rows
    const compositeCanvas = document.createElement("canvas");
    compositeCanvas.width = numFrames * frameSize;
    compositeCanvas.height = numDirs * numVariants * frameSize;
    const ctx = compositeCanvas.getContext("2d");
    if (!ctx) return;

    // Pixel read buffer
    const pixelBuffer = new Uint8Array(frameSize * frameSize * 4);

    // Hide grid
    const gridHelper = scene.children.find(
      (c) => c instanceof THREE.GridHelper,
    );
    const prevGridVisible = gridHelper?.visible;
    if (gridHelper) gridHelper.visible = false;

    // Hide skeleton debug spheres (green nodes)
    const prevSkeletonVisible = skeletonMeshes.map((m) => m.visible);
    skeletonMeshes.forEach((m) => (m.visible = false));

    // Hide bone connection lines (green lines)
    const lines: THREE.Line[] = [];
    scene.traverse((obj) => {
      if (obj instanceof THREE.Line) {
        lines.push(obj);
      }
    });
    const prevLineVisible = lines.map((l) => l.visible);
    lines.forEach((l) => (l.visible = false));

    // Store original background and set transparent
    const prevBackground = scene.background;
    scene.background = null;

    // Store original scale
    const origScale = rootBone.scale.clone();

    // Render each variant × direction × frame
    for (let varIdx = 0; varIdx < numVariants; varIdx++) {
      const variant = BODY_VARIANTS[varIdx]!;

      // Apply variant scale to root bone (skeleton distances)
      rootBone.scale.set(variant.scaleXZ, variant.scaleY, variant.scaleXZ);

      // Counter-scale body meshes so they keep original size
      const invScaleX = 1 / variant.scaleXZ;
      const invScaleY = 1 / variant.scaleY;
      const invScaleZ = 1 / variant.scaleXZ;
      bodyMeshesRef.current.forEach((mesh) => {
        mesh.scale.set(invScaleX, invScaleY, invScaleZ);
      });

      for (let dirIdx = 0; dirIdx < numDirs; dirIdx++) {
        const dir = DIRECTIONS[dirIdx]!;
        offCamera.position.set(dir.pos[0], variant.cameraY, dir.pos[2]);
        offCamera.lookAt(0, variant.cameraY - 0.1, 0);

        for (let frameIdx = 0; frameIdx < numFrames; frameIdx++) {
          const frame = anim.frames[frameIdx]!;

          // Reset all bone rotations
          Object.values(boneObjects).forEach((bone) => {
            bone.rotation.set(0, 0, 0);
          });

          // Apply this frame's rotations
          Object.entries(frame).forEach(([boneName, rotation]) => {
            const bone = boneObjects[boneName];
            if (bone) {
              bone.rotation.set(rotation[0], rotation[1], rotation[2]);
            }
          });

          // Update matrices through hierarchy
          scene.updateMatrixWorld(true);

          // Render
          offRenderer.render(scene, offCamera);

          // Read pixels
          const gl = offRenderer.getContext();
          gl.readPixels(
            0, 0, frameSize, frameSize,
            gl.RGBA, gl.UNSIGNED_BYTE, pixelBuffer,
          );

          // Calculate row: variant * numDirs + direction
          const rowIdx = varIdx * numDirs + dirIdx;

          // Write to composite canvas (flip Y)
          const imageData = ctx.createImageData(frameSize, frameSize);
          for (let y = 0; y < frameSize; y++) {
            for (let x = 0; x < frameSize; x++) {
              const srcIdx = ((frameSize - 1 - y) * frameSize + x) * 4;
              const dstIdx = (y * frameSize + x) * 4;
              imageData.data[dstIdx] = pixelBuffer[srcIdx]!;
              imageData.data[dstIdx + 1] = pixelBuffer[srcIdx + 1]!;
              imageData.data[dstIdx + 2] = pixelBuffer[srcIdx + 2]!;
              imageData.data[dstIdx + 3] = pixelBuffer[srcIdx + 3]!;
            }
          }
          ctx.putImageData(
            imageData,
            frameIdx * frameSize,
            rowIdx * frameSize,
          );
        }
      }
    }

    // Restore root scale and body mesh scales
    rootBone.scale.copy(origScale);
    bodyMeshesRef.current.forEach((mesh) => {
      mesh.scale.set(1, 1, 1);
    });

    // Restore scene state
    if (gridHelper) gridHelper.visible = prevGridVisible ?? true;
    skeletonMeshes.forEach((m, i) => (m.visible = prevSkeletonVisible[i] ?? false));
    lines.forEach((l, i) => (l.visible = prevLineVisible[i] ?? true));
    scene.background = prevBackground;

    // Generate metadata
    const metadata = {
      spritesheet: {
        width: compositeCanvas.width,
        height: compositeCanvas.height,
        frameWidth: frameSize,
        frameHeight: frameSize,
        columns: numFrames,
        rows: numDirs * numVariants,
      },
      animations: [
        {
          name: "walk",
          frameCount: numFrames,
          frameDuration: anim.duration / numFrames,
          totalDuration: anim.duration,
          looping: true,
        },
      ],
      variants: BODY_VARIANTS.map((v, idx) => ({
        name: v.name,
        rowOffset: idx * numDirs,
        rowCount: numDirs,
      })),
      directions: DIRECTIONS.map((d, idx) => ({
        name: d.name,
        rowIndex: idx,
      })),
      layout: "Each variant has 4 consecutive rows (front, right, back, left). Rows 0-3: tall, Rows 4-7: normal, Rows 8-11: short.",
    };

    // Download spritesheet PNG
    compositeCanvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "walk-spritesheet.png";
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");

    // Download metadata JSON
    const metaBlob = new Blob([JSON.stringify(metadata, null, 2)], {
      type: "application/json",
    });
    const metaUrl = URL.createObjectURL(metaBlob);
    const metaLink = document.createElement("a");
    metaLink.href = metaUrl;
    metaLink.download = "walk-spritesheet.json";
    setTimeout(() => {
      metaLink.click();
      URL.revokeObjectURL(metaUrl);
    }, 100);

    offRenderer.dispose();
  };

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
    customCharGroupRef.current = boneMeshes;
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

    // Attach sword to right hand — blade extends along +X (same as arm direction)
    const handRBone = boneObjects["hand_R"];
    if (handRBone) {
      const sword = createSwordMesh();
      // Rotate 90° around Z so blade points upward (+Y) instead of along the arm (+X)
      sword.rotation.z = Math.PI / 2;
      handRBone.add(sword);
      sword.traverse((child) => {
        if (child instanceof THREE.Mesh) bodyMeshes.push(child);
      });
    }

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

      const delta = clockRef.current.getDelta();
      const curAnim = currentAnimationRef.current;

      if (curAnim === "FBX" && fbxMixerRef.current) {
        fbxMixerRef.current.update(delta);
        // Retarget FBX bone rotations onto the custom character skeleton
        Object.values(boneObjects).forEach((bone) => bone.rotation.set(0, 0, 0));
        fbxBonesRef.current.forEach((fbxBone, fbxBoneName) => {
          const customBoneName = FBX_BONE_MAP[fbxBoneName];
          if (customBoneName) {
            const customBone = boneObjects[customBoneName];
            if (customBone) customBone.quaternion.copy(fbxBone.quaternion);
          }
        });
      } else {
        animationTimeRef.current += delta;

        const anim =
          curAnim === "Walk"
            ? WALK_ANIMATION
            : curAnim === "Sword"
              ? SWORD_SWING_ANIMATION
              : IDLE_ANIMATION;

        const rawIndex =
          (animationTimeRef.current / anim.duration) * anim.frames.length;
        const frameIndex = Math.floor(rawIndex) % anim.frames.length;
        const nextIndex = (frameIndex + 1) % anim.frames.length;
        const t = rawIndex % 1;
        setCurrentFrame(frameIndex);

        const frame = anim.frames[frameIndex];
        const nextFrame = anim.frames[nextIndex];
        if (frame && nextFrame) {
          Object.values(boneObjects).forEach((bone) => {
            bone.rotation.set(0, 0, 0);
          });

          const boneNames = new Set([
            ...Object.keys(frame),
            ...Object.keys(nextFrame),
          ]);
          boneNames.forEach((boneName) => {
            const bone = boneObjects[boneName];
            if (bone) {
              const r0 = frame[boneName] ?? ([0, 0, 0] as BoneRotation);
              const r1 = nextFrame[boneName] ?? ([0, 0, 0] as BoneRotation);
              bone.rotation.set(
                r0[0] + (r1[0] - r0[0]) * t,
                r0[1] + (r1[1] - r0[1]) * t,
                r0[2] + (r1[2] - r0[2]) * t,
              );
            }
          });
        }

        // Apply body variant scale to skeleton, but counter-scale body meshes
        const variant = BODY_VARIANTS[currentVariantRef.current];
        const rootBone = boneObjects["root"];
        if (variant && rootBone) {
          rootBone.scale.set(variant.scaleXZ, variant.scaleY, variant.scaleXZ);
          camera.position.y = variant.cameraY;
          camera.lookAt(0, variant.cameraY - 0.5, 0);

          const invScaleX = 1 / variant.scaleXZ;
          const invScaleY = 1 / variant.scaleY;
          const invScaleZ = 1 / variant.scaleXZ;
          bodyMeshesRef.current.forEach((mesh) => {
            mesh.scale.set(invScaleX, invScaleY, invScaleZ);
          });
        }
      }

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
  }, []);

  // Sync variant ref with state (avoids rebuilding scene on variant change)
  useEffect(() => {
    currentVariantRef.current = currentVariant;
  }, [currentVariant]);

  // Sync animation ref — custom char is always visible, FBX model stays hidden
  useEffect(() => {
    currentAnimationRef.current = currentAnimation;
    animationTimeRef.current = 0;
    if (customCharGroupRef.current) customCharGroupRef.current.visible = true;
    if (fbxModelRef.current) fbxModelRef.current.visible = false;
  }, [currentAnimation]);

  // Load FBX file once the scene is ready
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const loader = new FBXLoader();
    loader.load(
      "/motion.fbx",
      (fbx) => {
        // FBX files are often in centimeters — scale to meters
        fbx.scale.setScalar(0.01);
        fbx.visible = false; // we drive the custom char, not this mesh
        scene.add(fbx);
        fbxModelRef.current = fbx;

        // Collect all named nodes for retargeting (motion FBX may use Object3D, not THREE.Bone)
        fbxBonesRef.current.clear();
        fbx.traverse((obj) => {
          if (obj.name) {
            fbxBonesRef.current.set(obj.name, obj as THREE.Bone);
          }
        });
        const boneNames = [...fbxBonesRef.current.keys()];
        console.log("FBX nodes found:", boneNames);
        const mapped = boneNames.filter((n) => FBX_BONE_MAP[n]);
        console.log("FBX nodes mapped to custom skeleton:", mapped);

        if (fbx.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(fbx);
          const clip = fbx.animations[0];
          if (clip) mixer.clipAction(clip).play();
          fbxMixerRef.current = mixer;
        }
      },
      undefined,
      (err) => console.error("FBX load error:", err),
    );

    return () => {
      fbxMixerRef.current?.stopAllAction();
      fbxMixerRef.current = null;
      if (fbxModelRef.current) {
        scene.remove(fbxModelRef.current);
        fbxModelRef.current = null;
      }
    };
  }, []);

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

  // Pixel art mode: render at low resolution, scale up with CSS pixelated
  useEffect(() => {
    pixelArtModeRef.current = pixelArtMode;
    const renderer = rendererRef.current;
    const mount = mountRef.current;
    if (!renderer || !mount) return;
    const w = mount.clientWidth;
    const h = mount.clientHeight;
    if (pixelArtMode) {
      renderer.setSize(Math.floor(w / 6), Math.floor(h / 6));
      renderer.domElement.style.imageRendering = "pixelated";
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
    } else {
      renderer.setSize(w, h);
      renderer.domElement.style.imageRendering = "";
      renderer.domElement.style.width = "";
      renderer.domElement.style.height = "";
    }
  }, [pixelArtMode]);

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
          <button
            onClick={() => {
              setCurrentAnimation("Sword");
              animationTimeRef.current = 0;
            }}
            className={`px-3 py-1 rounded text-sm ${
              currentAnimation === "Sword"
                ? "bg-blue-600"
                : "bg-gray-600 hover:bg-gray-500"
            }`}
          >
            Sword
          </button>
          <button
            onClick={() => setCurrentAnimation("FBX")}
            className={`px-3 py-1 rounded text-sm ${
              currentAnimation === "FBX"
                ? "bg-orange-600"
                : "bg-gray-600 hover:bg-gray-500"
            }`}
          >
            Motion FBX
          </button>
          <span className="text-xs text-gray-400 self-center ml-2">
            Frame: {currentFrame}
          </span>
          <button
            onClick={exportSpritesheet}
            className="px-3 py-1 rounded text-sm bg-green-700 hover:bg-green-600 ml-2"
          >
            Export Spritesheet
          </button>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-xs text-gray-400">Body:</span>
          {BODY_VARIANTS.map((variant, idx) => (
            <button
              key={variant.name}
              onClick={() => setCurrentVariant(idx)}
              className={`px-2 py-1 rounded text-xs capitalize ${
                currentVariant === idx
                  ? "bg-purple-600"
                  : "bg-gray-600 hover:bg-gray-500"
              }`}
            >
              {variant.name}
            </button>
          ))}
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
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={pixelArtMode}
              onChange={(e) => setPixelArtMode(e.target.checked)}
            />
            Pixel Art
          </label>
        </div>
      </div>
    </div>
  );
}
