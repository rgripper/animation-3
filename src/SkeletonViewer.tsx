import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

// Strip "mixamorig:" prefix Mixamo adds to all bone names
function strip(name: string): string {
  return name.replace("mixamorig:", "");
}

function isBone(obj: THREE.Object3D): boolean {
  return obj instanceof THREE.Bone || obj.name.startsWith("mixamorig:");
}

// Body-region colors
const COLORS: Record<string, number> = {
  Hips: 0x3a3a4a,
  Spine: 0x3366aa, Spine1: 0x3366aa, Spine2: 0x3366aa,
  Neck: 0xd4a574,
  LeftShoulder: 0x3366aa, LeftArm: 0x3366aa, LeftForeArm: 0x3366aa,
  RightShoulder: 0x3366aa, RightArm: 0x3366aa, RightForeArm: 0x3366aa,
  LeftUpLeg: 0x3a3a4a, LeftLeg: 0x3a3a4a, LeftFoot: 0x1c1c1c,
  RightUpLeg: 0x3a3a4a, RightLeg: 0x3a3a4a, RightFoot: 0x1c1c1c,
};

// Capsule radius per bone (segment going FROM that bone toward its child)
const RADII: Record<string, number> = {
  Hips: 0.07,
  Spine: 0.062, Spine1: 0.062, Spine2: 0.068,
  Neck: 0.038,
  LeftShoulder: 0.032, LeftArm: 0.040, LeftForeArm: 0.034,
  RightShoulder: 0.032, RightArm: 0.040, RightForeArm: 0.034,
  LeftUpLeg: 0.065, LeftLeg: 0.054, LeftFoot: 0.038,
  RightUpLeg: 0.065, RightLeg: 0.054, RightFoot: 0.038,
};

// Bones whose CHILDREN we skip drawing segments to (fingers, toes, end nodes)
const NO_CHILD_SEGMENTS = new Set([
  "LeftHand", "RightHand",
  "LeftToeBase", "RightToeBase",
]);

// Bones we skip entirely (no joint sphere, no segments)
const SKIP = new Set([
  "LeftHandThumb1", "LeftHandThumb2", "LeftHandThumb3", "LeftHandThumb4",
  "LeftHandIndex1", "LeftHandIndex2", "LeftHandIndex3", "LeftHandIndex4",
  "LeftHandMiddle1", "LeftHandMiddle2", "LeftHandMiddle3", "LeftHandMiddle4",
  "LeftHandRing1", "LeftHandRing2", "LeftHandRing3", "LeftHandRing4",
  "LeftHandPinky1", "LeftHandPinky2", "LeftHandPinky3", "LeftHandPinky4",
  "RightHandThumb1", "RightHandThumb2", "RightHandThumb3", "RightHandThumb4",
  "RightHandIndex1", "RightHandIndex2", "RightHandIndex3", "RightHandIndex4",
  "RightHandMiddle1", "RightHandMiddle2", "RightHandMiddle3", "RightHandMiddle4",
  "RightHandRing1", "RightHandRing2", "RightHandRing3", "RightHandRing4",
  "RightHandPinky1", "RightHandPinky2", "RightHandPinky3", "RightHandPinky4",
  "LeftToe_End", "RightToe_End", "HeadTop_End",
]);

const JOINT_MAT = new THREE.MeshPhongMaterial({ color: 0xff7700 });
const SKIN_MAT = new THREE.MeshPhongMaterial({ color: 0xd4a574, flatShading: true });

// Add visual geometry to a bone so it renders its segment toward each child bone.
// Geometry is added as a child of the bone so it animates automatically.
function addVisuals(bone: THREE.Object3D): void {
  const name = strip(bone.name);
  if (SKIP.has(name)) return;

  // Joint dot
  bone.add(new THREE.Mesh(new THREE.SphereGeometry(0.020, 8, 8), JOINT_MAT));

  // Head: large skin sphere above the bone joint
  if (name === "Head") {
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 14), SKIN_MAT);
    head.position.set(0, 0.115, 0.01);
    bone.add(head);
    return;
  }

  // Hands: small skin sphere
  if (name === "LeftHand" || name === "RightHand") {
    bone.add(new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 8), SKIN_MAT));
    return;
  }

  // Toes: small sphere, no segments needed
  if (name === "LeftToeBase" || name === "RightToeBase") {
    return;
  }

  if (NO_CHILD_SEGMENTS.has(name)) return;

  const color = COLORS[name] ?? 0x777788;
  const radius = RADII[name] ?? 0.030;
  const mat = new THREE.MeshPhongMaterial({ color, flatShading: true });

  // Draw one capsule per child bone that's part of the rig
  const childBones = bone.children.filter(c => isBone(c));
  childBones.forEach(child => {
    if (SKIP.has(strip(child.name))) return;

    const localVec = child.position.clone(); // child's local pos = direction + length
    const length = localVec.length();
    if (length < 0.005) return;

    const dir = localVec.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    let q: THREE.Quaternion;
    const dot = up.dot(dir);
    if (dot > 0.9999) {
      q = new THREE.Quaternion(); // identity
    } else if (dot < -0.9999) {
      q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
    } else {
      q = new THREE.Quaternion().setFromUnitVectors(up, dir);
    }

    // CapsuleGeometry(radius, cylinderHeight) — total height = cylinderHeight + 2*radius
    const cylHeight = Math.max(0, length - 2 * radius);
    const cap = new THREE.Mesh(new THREE.CapsuleGeometry(radius, cylHeight, 4, 8), mat);
    cap.quaternion.copy(q);
    cap.position.copy(localVec).multiplyScalar(0.5);
    bone.add(cap);
  });
}

export default function SkeletonViewer() {
  const mountRef = useRef<HTMLDivElement>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const clockRef = useRef(new THREE.Clock());
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ── Scene ──────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x16161e);

    const camera = new THREE.PerspectiveCamera(
      45,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100,
    );
    camera.position.set(0, 1.1, 3.0);
    camera.lookAt(0, 0.9, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(3, 6, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8899ff, 0.35);
    fill.position.set(-3, 2, -3);
    scene.add(fill);

    // Ground grid
    scene.add(new THREE.GridHelper(6, 12, 0x2a2a3a, 0x1e1e2a));

    // ── Load FBX ──────────────────────────────────────────────────────────
    new FBXLoader().load(
      "/walking.fbx",
      (fbx) => {
        fbx.scale.setScalar(0.01); // Mixamo exports in centimetres
        scene.add(fbx);
        fbx.updateMatrixWorld(true);

        // Collect all skeleton bones in traversal order (parents before children)
        const bones: THREE.Object3D[] = [];
        fbx.traverse((obj) => {
          if (isBone(obj)) bones.push(obj);
        });

        // Attach visual geometry; do this after collecting so no newly-added
        // meshes are mistaken for bones when we inspect children.
        bones.forEach(addVisuals);

        // Play animation — strip Hips position track to keep walk in-place
        if (fbx.animations.length > 0) {
          const clip = fbx.animations[0]!;
          clip.tracks = clip.tracks.filter(
            (t) => !(t.name.toLowerCase().includes("hips") && t.name.endsWith(".position")),
          );
          const mixer = new THREE.AnimationMixer(fbx);
          mixer.clipAction(clip).play();
          mixerRef.current = mixer;
        }

        setStatus("ready");
      },
      undefined,
      () => setStatus("error"),
    );

    // ── Render loop ────────────────────────────────────────────────────────
    let rafId: number;
    const loop = () => {
      rafId = requestAnimationFrame(loop);
      mixerRef.current?.update(clockRef.current.getDelta());
      renderer.render(scene, camera);
    };
    loop();

    // ── Resize ────────────────────────────────────────────────────────────
    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative", background: "#16161e" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />

      {status === "loading" && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#aaaacc", fontSize: "1.1rem",
        }}>
          Loading skeleton…
        </div>
      )}

      {status === "error" && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#ff6666", fontSize: "1.1rem",
        }}>
          Failed to load Walking.fbx
        </div>
      )}
    </div>
  );
}
