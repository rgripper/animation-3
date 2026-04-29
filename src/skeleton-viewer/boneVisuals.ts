import * as THREE from "three";
import { COLORS, RADII, JOINT_COLOR, JOINT_RADIUS, NO_CHILD_SEGMENTS, SKIP } from "./boneConfig";

// Mixamo FBX is authored in centimetres; the FBX root group is scaled by 0.01
// to convert to metres in the scene. That scale sits on the root, so every bone's
// LOCAL position (child.position) is still in centimetres. Geometry dimensions
// (sphere radius, capsule radius) live in the same local space — so we must
// convert metre-based config values into centimetres before creating geometry.
const FBX_TO_LOCAL = 100; // 1 / 0.01

export function strip(name: string): string {
  return name.replace("mixamorig:", "");
}

export function isBone(obj: THREE.Object3D): boolean {
  return obj instanceof THREE.Bone || obj.name.startsWith("mixamorig:");
}

const JOINT_MAT = new THREE.MeshPhongMaterial({ color: JOINT_COLOR, shininess: 80 });
const SKIN_MAT  = new THREE.MeshPhongMaterial({ color: 0xffcca0, flatShading: true });

function segmentMat(color: number): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({ color, flatShading: true, shininess: 50 });
}

function orientToward(localVec: THREE.Vector3): THREE.Quaternion {
  const dir = localVec.clone().normalize();
  const up  = new THREE.Vector3(0, 1, 0);
  const dot = up.dot(dir);
  if (dot >  0.9999) return new THREE.Quaternion();
  if (dot < -0.9999) return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
  return new THREE.Quaternion().setFromUnitVectors(up, dir);
}

// Attach visual geometry to a single bone as child objects so they animate with it.
// Must be called AFTER collecting all bones so newly added meshes are never
// mistaken for bone children when filtering bone.children.
export function addVisuals(bone: THREE.Object3D): void {
  const name = strip(bone.name);
  if (SKIP.has(name)) return;

  // Joint dot — radius in metres, converted to FBX local space (cm)
  const jointR = JOINT_RADIUS * FBX_TO_LOCAL;
  bone.add(new THREE.Mesh(new THREE.SphereGeometry(jointR, 8, 8), JOINT_MAT));

  if (name === "Head") {
    const r = 0.130 * FBX_TO_LOCAL;
    const head = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 14), SKIN_MAT);
    head.position.set(0, r, 0);
    bone.add(head);
    return;
  }

  if (name === "LeftHand" || name === "RightHand") {
    const r = 0.048 * FBX_TO_LOCAL;
    bone.add(new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), SKIN_MAT));
    return;
  }

  if (NO_CHILD_SEGMENTS.has(name)) return;

  const color  = COLORS[name] ?? 0x44aaff;
  const radius = (RADII[name] ?? 0.065) * FBX_TO_LOCAL; // metres → cm
  const mat    = segmentMat(color);

  bone.children
    .filter(c => isBone(c) && !SKIP.has(strip(c.name)))
    .forEach(child => {
      const vec    = child.position.clone(); // already in cm
      const length = vec.length();
      if (length < 0.5) return; // skip degenerate tiny bones (< 0.5 cm)

      // CapsuleGeometry(radius, cylinderHeight) — total = cylinderHeight + 2*radius
      const cylH = Math.max(0, length - 2 * radius);
      const cap  = new THREE.Mesh(new THREE.CapsuleGeometry(radius, cylH, 4, 8), mat);
      cap.quaternion.copy(orientToward(vec));
      cap.position.copy(vec).multiplyScalar(0.5);
      bone.add(cap);
    });
}
