
/**
 * Kinematics logic has been moved to App.tsx and Mannequin.tsx 
 * for improved performance and simpler state management.
 * 
 * FK (Forward Kinematics) utilities for joint-by-joint control
 */
export const lerp = (start: number, end: number, t: number): number => start * (1 - t) + end * t;

export const easeInOutQuint = (t: number): number => {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
};

/**
 * Clamps a rotation angle to the range [-180, 180]
 */
export const clampRotation = (angle: number): number => {
  let clamped = angle % 360;
  if (clamped > 180) clamped -= 360;
  if (clamped < -180) clamped += 360;
  return clamped;
};

/**
 * Normalizes rotation angle to [0, 360) range
 */
export const normalizeRotation = (angle: number): number => {
  let normalized = angle % 360;
  if (normalized < 0) normalized += 360;
  return normalized;
};

/**
 * Linear interpolation between two rotation angles, taking the shortest path
 */
export const lerpRotation = (start: number, end: number, t: number): number => {
  let delta = end - start;
  // Find the shortest angular distance
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return start + delta * t;
};

/**
 * Converts a local joint rotation to a world rotation given parent rotation and offset
 */
export const getWorldRotation = (
  parentWorldRotation: number,
  localPivotRotation: number,
  parentOffsetAngle: number = 0
): number => {
  return parentWorldRotation + localPivotRotation + parentOffsetAngle;
};
