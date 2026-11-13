// MediaPipe Pose & Hand landmark connections
// Source: official MediaPipe documentation

// PoseLandmarker has 33 landmarks.
// Connections define which pairs of landmarks should be connected by a line.
export const POSE_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  // Left arm
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  // Right arm
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  // Torso
  [11, 23], [12, 24], [23, 24],
  // Left leg
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31],
  // Right leg
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32],
  // Face (simplified)
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10],
];

// HandLandmarker has 21 landmarks per hand.
export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index finger
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle finger
  [5, 9], [9, 10], [10, 11], [11, 12],
  // Ring finger
  [9, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

// Names for pose landmarks (subset for UI display)
export const POSE_LANDMARK_NAMES: Record<number, string> = {
  0: "Nose",
  1: "Left Eye Inner",
  2: "Left Eye",
  3: "Left Eye Outer",
  4: "Right Eye Inner",
  5: "Right Eye",
  6: "Right Eye Outer",
  7: "Left Ear",
  8: "Right Ear",
  9: "Mouth Left",
  10: "Mouth Right",
  11: "Left Shoulder",
  12: "Right Shoulder",
  13: "Left Elbow",
  14: "Right Elbow",
  15: "Left Wrist",
  16: "Right Wrist",
  17: "Left Pinky",
  18: "Right Pinky",
  19: "Left Index",
  20: "Right Index",
  21: "Left Thumb",
  22: "Right Thumb",
  23: "Left Hip",
  24: "Right Hip",
  25: "Left Knee",
  26: "Right Knee",
  27: "Left Ankle",
  28: "Right Ankle",
  29: "Left Heel",
  30: "Right Heel",
  31: "Left Foot Index",
  32: "Right Foot Index",
};

export const HAND_LANDMARK_NAMES: Record<number, string> = {
  0: "Wrist",
  1: "Thumb CMC",
  2: "Thumb MCP",
  3: "Thumb IP",
  4: "Thumb Tip",
  5: "Index MCP",
  6: "Index PIP",
  7: "Index DIP",
  8: "Index Tip",
  9: "Middle MCP",
  10: "Middle PIP",
  11: "Middle DIP",
  12: "Middle Tip",
  13: "Ring MCP",
  14: "Ring PIP",
  15: "Ring DIP",
  16: "Ring Tip",
  17: "Pinky MCP",
  18: "Pinky PIP",
  19: "Pinky DIP",
  20: "Pinky Tip",
};
