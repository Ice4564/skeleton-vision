// MediaPipe hand landmarks use 21 points: wrist, then four joints along each finger.
export const HAND_CONNECTION_GROUPS = [
  { color: '#ff78a8', connections: [[0, 1], [1, 2], [2, 3], [3, 4]] as const },
  { color: '#ff78a8', connections: [[0, 5], [5, 6], [6, 7], [7, 8]] as const },
  { color: '#ff78a8', connections: [[5, 9], [9, 10], [10, 11], [11, 12]] as const },
  { color: '#ff78a8', connections: [[9, 13], [13, 14], [14, 15], [15, 16]] as const },
  { color: '#ff78a8', connections: [[13, 17], [17, 18], [18, 19], [19, 20], [0, 17]] as const },
];

export const HAND_LANDMARK_NAMES: Record<number, string> = {
  0: 'ข้อมือ',
  1: 'โคนนิ้วโป้ง', 2: 'ข้อ 1 นิ้วโป้ง', 3: 'ข้อ 2 นิ้วโป้ง', 4: 'ปลายนิ้วโป้ง',
  5: 'โคนนิ้วชี้', 6: 'ข้อ 1 นิ้วชี้', 7: 'ข้อ 2 นิ้วชี้', 8: 'ปลายนิ้วชี้',
  9: 'โคนนิ้วกลาง', 10: 'ข้อ 1 นิ้วกลาง', 11: 'ข้อ 2 นิ้วกลาง', 12: 'ปลายนิ้วกลาง',
  13: 'โคนนิ้วนาง', 14: 'ข้อ 1 นิ้วนาง', 15: 'ข้อ 2 นิ้วนาง', 16: 'ปลายนิ้วนาง',
  17: 'โคนนิ้วก้อย', 18: 'ข้อ 1 นิ้วก้อย', 19: 'ข้อ 2 นิ้วก้อย', 20: 'ปลายนิ้วก้อย',
};
