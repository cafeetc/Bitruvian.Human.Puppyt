import { CANONICAL_PROPORTIONS, safeFinite, snapAngularEpsilon } from './jointLimits';
import type { PostureRegime } from './groundSystem';
import { evalCubicBezier } from './motionEngine';
import { createZeroPoseRecord, RIG_JOINTS, type JointId, type Keyframe, type TrackEasing } from './motionFormat';

function normDeg(deg: number): number {
  const safe = safeFinite(deg, 0);
  return snapAngularEpsilon(((((safe + 180) % 360) + 360) % 360) - 180);
}

export function evalTrackEasing(uRaw: number, easing: TrackEasing): number {
  const u = Math.max(0, Math.min(1, safeFinite(uRaw, 0)));
  if (easing === 'step') return u >= 1 ? 1 : 0;
  if (easing === 'linear') return u;
  if (easing === 'cubicBezier') return evalCubicBezier(u, 0.25, 0.1, 0.25, 1.0);
  // Default smooth easeInOut
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

export interface SampledTrackPose {
  frame: number;
  pose: Record<JointId, number>;
  root: [number, number];
  rootVelocity: [number, number];
  stridePhase: number;
  postureRegime: PostureRegime;
}

/**
 * Deterministically samples a sorted keyframe track at any fractional frame,
 * computing instantaneous root velocity, Muybridge stride phase, and Standing vs. Moving regime.
 */
export function sampleTrackAtFrame(keys: Keyframe[], frame: number): SampledTrackPose | null {
  if (!keys.length) return null;
  const safeFrame = safeFinite(frame, 0);
  const sorted = keys.slice().sort((a, b) => a.frame - b.frame);
  if (safeFrame <= sorted[0].frame) {
    return {
      frame: sorted[0].frame,
      pose: { ...sorted[0].pose },
      root: [safeFinite(sorted[0].root[0]), safeFinite(sorted[0].root[1])],
      rootVelocity: [0, 0],
      stridePhase: 0,
      postureRegime: 'standing',
    };
  }
  const last = sorted[sorted.length - 1];
  if (safeFrame >= last.frame) {
    return {
      frame: last.frame,
      pose: { ...last.pose },
      root: [safeFinite(last.root[0]), safeFinite(last.root[1])],
      rootVelocity: [0, 0],
      stridePhase: 0,
      postureRegime: 'standing',
    };
  }

  let prev = sorted[0];
  let next = last;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (safeFrame >= sorted[i].frame && safeFrame <= sorted[i + 1].frame) {
      prev = sorted[i];
      next = sorted[i + 1];
      break;
    }
  }

  const span = Math.max(1e-6, next.frame - prev.frame);
  const rawU = (safeFrame - prev.frame) / span;
  const s = evalTrackEasing(rawU, prev.easing);

  const pose = createZeroPoseRecord();
  for (const id of RIG_JOINTS) {
    const a = safeFinite(prev.pose[id] ?? 0);
    const b = safeFinite(next.pose[id] ?? a, a);
    const da = normDeg(b - a);
    const val = normDeg(a + da * s);
    pose[id] = Math.abs(val) < 0.001 ? 0 : Math.round(val * 1000) / 1000;
  }

  const px0 = safeFinite(prev.root[0]);
  const py0 = safeFinite(prev.root[1]);
  const px1 = safeFinite(next.root[0]);
  const py1 = safeFinite(next.root[1]);
  const rx = px0 + (px1 - px0) * s;
  const ry = py0 + (py1 - py0) * s;

  const vx = (px1 - px0) / span;
  const vy = (py1 - py0) / span;
  const speed = Math.hypot(vx, vy);
  const strideSpread = Math.abs(normDeg((pose.femurR ?? 0) - (pose.femurL ?? 0)));
  const isMoving =
    prev.easing !== 'step' &&
    (speed >= CANONICAL_PROPORTIONS.muybridge.movingVelocityThresholdPx ||
      strideSpread >= CANONICAL_PROPORTIONS.muybridge.movingStrideAngleThresholdDeg);
  const stanceSplit = CANONICAL_PROPORTIONS.muybridge.stancePhaseRatio;
  const stridePhase = isMoving
    ? rawU <= stanceSplit
      ? rawU / stanceSplit
      : 1 - (rawU - stanceSplit) / Math.max(1e-4, 1 - stanceSplit)
    : 0;

  return {
    frame: safeFrame,
    pose,
    root: [Math.round(rx * 100) / 100, Math.round(ry * 100) / 100],
    rootVelocity: [Math.round(vx * 100) / 100, Math.round(vy * 100) / 100],
    stridePhase: Math.round(stridePhase * 1000) / 1000,
    postureRegime: isMoving ? 'moving' : 'standing',
  };
}
