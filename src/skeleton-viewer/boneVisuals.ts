import * as THREE from "three";
import { COLORS, RADII, JOINT_COLOR, JOINT_RADIUS, NO_CHILD_SEGMENTS, SKIP } from "./boneConfig";

export function strip(name: string): string {
  return name.replace("mixamorig:", "");
}

export function isBone(obj: THREE.Object3D): boolean {
  return obj instanceof THREE.Bone || obj.name.startsWith("mixamorig:");
}

// Shared materials — created once, reused across all bone visuals
const JOINT_MAT = new THREE.MeshPhongMaterial({ color: JOINT_COLOR, shininess: 80 });
const SKIN_MAT = new THREE.MeshPhongMaterial({ color: 0xffcca0, flatShading: true });

function segmentMat(color: number): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({ color, flatShading: true, shininess: 50 });
}

// Rotate a capsule (Y-aligned by default) to point from origin toward `localVec`.
function orientToward(localVec: THREE.Vector3): THREE.Quaternion {
  const dir = localVec.clone().normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const dot = up.dot(dir);
  if (dot > 0.9999) return new THREE.Quaternion();
  if (dot < -0.9999) return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
  return new THREE.Quaternion().setFromUnitVectors(up, dir);
}

// Attach visual geometry to a single bone as child objects so they animate with it.
// Call this AFTER collecting all bones so newly added meshes aren't mistaken for bones.
export function addVisuals(bone: THREE.Object3D): void {
  const name = strip(bone.name);
  if (SKIP.has(name)) return;

  // Joint indicator at every bone origin
  bone.add(new THREE.Mesh(new THREE.SphereGeometry(JOINT_RADIUS, 8, 8), JOINT_MAT));

  if (name === "Head") {
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.120, 14, 14), SKIN_MAT);
    head.position.set(0, 0.120, 0);
    bone.add(head);
    return;
  }

  if (name === "LeftHand" || name === "RightHand") {
    bone.add(new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 8), SKIN_MAT));
    return;
  }

  if (NO_CHILD_SEGMENTS.has(name)) return;

  const color = COLORS[name] ?? 0x44aaff;
  const radius = RADII[name] ?? 0.042;
  const mat = segmentMat(color);

  // One capsule per bone child — spans from this bone toward each direct child bone
  bone.children
    .filter(c => isBone(c) && !SKIP.has(strip(c.name)))
    .forEach(child => {
      const vec = child.position.clone(); // local offset = direction + length
      const length = vec.length();
      if (length < 0.005) return;

      // CapsuleGeometry height = cylinder section only; total = height + 2*radius
      const cylH = Math.max(0, length - 2 * radius);
      const cap = new THREE.Mesh(new THREE.CapsuleGeometry(radius, cylH, 4, 8), mat);
      cap.quaternion.copy(orientToward(vec));
      cap.position.copy(vec).multiplyScalar(0.5);
      bone.add(cap);
    });
}
