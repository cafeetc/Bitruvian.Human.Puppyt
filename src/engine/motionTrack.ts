import { evalCubicBezier } from './motionEngine';
import { createZeroPoseRecord, RIG_JOINTS, type JointId, type Keyframe, type TrackEasing } from './motionFormat';

function normDeg(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

export function evalTrackEasing(uRaw: number, easing: TrackEasing): number {
  const u = Math.max(0, Math.min(1, uRaw));
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
}

/**
 * Deterministically samples a sorted keyframe track at any fractional frame,
 * using shortest-path angular wrapping and sub-millimeter precision stabilization.
 */
export function sampleTrackAtFrame(keys: Keyframe[], frame: number): SampledTrackPose | null {
  if (!keys.length) return null;
  const sorted = keys.slice().sort((a, b) => a.frame - b.frame);
  if (frame <= sorted[0].frame) {
    return {
      frame: sorted[0].frame,
      pose: { ...sorted[0].pose },
      root: [sorted[0].root[0], sorted[0].root[1]],
    };
  }
  const last = sorted[sorted.length - 1];
  if (frame >= last.frame) {
    return {
      frame: last.frame,
      pose: { ...last.pose },
      root: [last.root[0], last.root[1]],
    };
  }

  let prev = sorted[0];
  let next = last;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (frame >= sorted[i].frame && frame <= sorted[i + 1].frame) {
      prev = sorted[i];
      next = sorted[i + 1];
      break;
    }
  }

  const span = Math.max(1e-6, next.frame - prev.frame);
  const rawU = (frame - prev.frame) / span;
  const s = evalTrackEasing(rawU, prev.easing);

  const pose = createZeroPoseRecord();
  for (const id of RIG_JOINTS) {
    const a = prev.pose[id] ?? 0;
    const b = next.pose[id] ?? a;
    const da = normDeg(b - a);
    const val = normDeg(a + da * s);
    pose[id] = Math.abs(val) < 0.001 ? 0 : Math.round(val * 1000) / 1000;
  }

  const rx = prev.root[0] + (next.root[0] - prev.root[0]) * s;
  const ry = prev.root[1] + (next.root[1] - prev.root[1]) * s;

  return {
    frame,
    pose,
    root: [Math.round(rx * 100) / 100, Math.round(ry * 100) / 100],
  };
}
