import * as THREE from "three";

const PURPLE = new THREE.MeshPhongMaterial({ color: 0x3a1570, flatShading: true, shininess: 30 });
const GOLD   = new THREE.MeshPhongMaterial({ color: 0xd4a017, flatShading: true, shininess: 100 });

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, y: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.y = y;
  return m;
}

// Build a wizard hat sized relative to `headR` (FBX local space = cm).
// Add directly to the Head bone — rides with every head rotation.
export function createWizardHat(headR: number): THREE.Group {
  const hat = new THREE.Group();

  const brimY     = headR * 1.55;
  const brimOuter = headR * 1.65;
  const brimInner = headR * 1.50;
  const brimH     = headR * 0.14;

  // Wide flat brim
  hat.add(mesh(new THREE.CylinderGeometry(brimInner, brimOuter, brimH, 20), PURPLE, brimY));

  // Gold band where cone meets brim
  const bandY = brimY + brimH;
  const bandR = headR * 0.91;
  const bandH = headR * 0.18;
  hat.add(mesh(new THREE.CylinderGeometry(bandR, bandR, bandH, 20), GOLD, bandY + bandH / 2));

  // Tall cone
  const coneBaseY = bandY + bandH;
  const coneH     = headR * 3.2;
  hat.add(mesh(new THREE.CylinderGeometry(0, headR * 0.90, coneH, 20), PURPLE, coneBaseY + coneH / 2));

  // Slight forward tilt
  hat.rotation.x = -0.10;

  return hat;
}
