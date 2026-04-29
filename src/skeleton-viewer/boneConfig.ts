// Neon color palette per bone — color represents the segment FROM that bone toward its child
export const COLORS: Record<string, number> = {
  Hips: 0x00d4ff,
  Spine: 0x00d4ff, Spine1: 0x00d4ff, Spine2: 0x00d4ff,
  Neck: 0x00d4ff,
  LeftShoulder: 0x22aaff, LeftArm: 0x22aaff, LeftForeArm: 0x22aaff,
  RightShoulder: 0x22aaff, RightArm: 0x22aaff, RightForeArm: 0x22aaff,
  LeftUpLeg: 0x9955ff, LeftLeg: 0x9955ff, LeftFoot: 0x6633cc,
  RightUpLeg: 0x9955ff, RightLeg: 0x9955ff, RightFoot: 0x6633cc,
};

export const JOINT_COLOR = 0xff8800;
export const JOINT_RADIUS = 0.028;

// Capsule radius for each segment — intentionally thicker than anatomical for visibility
export const RADII: Record<string, number> = {
  Hips: 0.092,
  Spine: 0.082, Spine1: 0.082, Spine2: 0.090,
  Neck: 0.052,
  LeftShoulder: 0.046, LeftArm: 0.056, LeftForeArm: 0.048,
  RightShoulder: 0.046, RightArm: 0.056, RightForeArm: 0.048,
  LeftUpLeg: 0.084, LeftLeg: 0.070, LeftFoot: 0.052,
  RightUpLeg: 0.084, RightLeg: 0.070, RightFoot: 0.052,
};

// Bones from which we draw NO child segments (terminal visual nodes)
export const NO_CHILD_SEGMENTS = new Set([
  "LeftHand", "RightHand",
  "LeftToeBase", "RightToeBase",
]);

// Bones skipped entirely — no joint, no segment (fingers, toe ends, head end)
export const SKIP = new Set([
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
