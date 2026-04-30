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
// All radii below are in METRES (world space). boneVisuals.ts converts them
// to FBX local space (centimetres) before creating Three.js geometry.
export const JOINT_RADIUS = 0.040;

export const RADII: Record<string, number> = {
  Hips: 0.095,
  Spine: 0.082, Spine1: 0.082, Spine2: 0.090,
  Neck: 0.052,
  LeftShoulder: 0.050, LeftArm: 0.062, LeftForeArm: 0.052,
  RightShoulder: 0.050, RightArm: 0.062, RightForeArm: 0.052,
  LeftUpLeg: 0.090, LeftLeg: 0.074, LeftFoot: 0.055,
  RightUpLeg: 0.090, RightLeg: 0.074, RightFoot: 0.055,
};

// Bones from which we draw NO child segments (terminal visual nodes)
export const NO_CHILD_SEGMENTS = new Set([
  "LeftHand", "RightHand",
  "LeftToeBase", "RightToeBase",
]);

// Finger segment radius (metres) — thin regardless of which exact bones the FBX uses
export const FINGER_RADIUS = 0.012;

// Bones skipped entirely — only true end-nodes with no meaningful segment
export const SKIP = new Set([
  "LeftToe_End", "RightToe_End", "HeadTop_End",
]);

// Pattern that matches any finger / thumb bone by name (Mixamo naming convention)
export const FINGER_PATTERN = /thumb|index|middle|ring|pinky/i;
