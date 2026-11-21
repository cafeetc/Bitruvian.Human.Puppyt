import type { JointId } from './motionFormat';

export interface AngleLimit {
  min: number;
  max: number;
  /** 0..1 biomechanical resistance weighting during FABRIK & soft IK passes */
  stiffness?: number;
}

/**
 * Unified anatomical rotation bounds & biomechanical stiffness weights across the 43-joint rig.
 * Angles are in degrees in parent-local space, tuned to the 2500x8742 puppet geometry.
 */
export const JOINT_LIMITS: Partial<Record<JointId, AngleLimit>> = {
  pelvis: { min: -180, max: 180, stiffness: 0.1 },
  hipR: { min: -145, max: 145, stiffness: 0.2 },
  hipL: { min: -145, max: 145, stiffness: 0.2 },
  lumbar: { min: -48, max: 48, stiffness: 0.45 },
  thorax: { min: -42, max: 42, stiffness: 0.55 },
  ribR: { min: -28, max: 28, stiffness: 0.35 },
  ribL: { min: -28, max: 28, stiffness: 0.35 },
  neck: { min: -45, max: 45, stiffness: 0.32 },
  head: { min: -65, max: 65, stiffness: 0.2 },
  lip: { min: -35, max: 18, stiffness: 0.25 },
  braceL: { min: -18, max: 18, stiffness: 0.65 },
  braceR: { min: -18, max: 18, stiffness: 0.65 },
  swivelL: { min: -42, max: 42, stiffness: 0.45 },
  swivelR: { min: -42, max: 42, stiffness: 0.45 },
  acromionL: { min: -45, max: 60, stiffness: 0.3 },
  acromionR: { min: -60, max: 45, stiffness: 0.3 },
  humerusL: { min: -175, max: 165, stiffness: 0.1 },
  humerusR: { min: -165, max: 175, stiffness: 0.1 },
  forearmL: { min: -155, max: 15, stiffness: 0.08 },
  forearmR: { min: -15, max: 155, stiffness: 0.08 },
  handL: { min: -85, max: 85, stiffness: 0.15 },
  handR: { min: -85, max: 85, stiffness: 0.15 },
  thumbL: { min: -75, max: 75, stiffness: 0.15 },
  thumbR: { min: -75, max: 75, stiffness: 0.15 },
  fingerL: { min: -95, max: 45, stiffness: 0.15 },
  fingerR: { min: -45, max: 95, stiffness: 0.15 },
  femurL: { min: -135, max: 120, stiffness: 0.12 },
  femurR: { min: -120, max: 135, stiffness: 0.12 },
  shinL: { min: -15, max: 150, stiffness: 0.08 },
  shinR: { min: -150, max: 15, stiffness: 0.08 },
  footL: { min: -65, max: 75, stiffness: 0.2 },
  footR: { min: -75, max: 65, stiffness: 0.2 },
};

export function clampJointAngle(joint: JointId | string, angleDeg: number, enforce: boolean): number {
  const safe = Number.isFinite(angleDeg) ? angleDeg : 0;
  const norm = ((((safe + 180) % 360) + 360) % 360) - 180;
  if (!enforce) return norm;
  const limit = JOINT_LIMITS[joint as JointId];
  if (!limit) return norm;
  return Math.max(limit.min, Math.min(limit.max, norm));
}

export function getJointStiffness(joint: JointId | string): number {
  return JOINT_LIMITS[joint as JointId]?.stiffness ?? 0.15;
}

/**
 * Soft biomechanical damping during iterative solvers: blends target angle against
 * prior angle proportionally to joint stiffness, avoiding brittle limit snapping.
 */
export function dampAngleWithStiffness(
  joint: JointId | string,
  prevDeg: number,
  targetDeg: number,
  enforce: boolean,
  strength = 1,
): number {
  const safePrev = Number.isFinite(prevDeg) ? prevDeg : 0;
  const safeTgt = Number.isFinite(targetDeg) ? targetDeg : safePrev;
  const delta = ((((safeTgt - safePrev + 180) % 360) + 360) % 360) - 180;
  const stiff = Math.max(0, Math.min(0.85, getJointStiffness(joint) * strength));
  const blended = safePrev + delta * (1 - stiff * 0.45);
  return clampJointAngle(joint, blended, enforce);
}
