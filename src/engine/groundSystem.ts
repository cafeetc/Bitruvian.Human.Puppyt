import type { JointId } from './motionFormat';
import type { IKMode, IKPinEntry, PerspectiveState, RigNode } from './types';

export type SolverMode = IKMode;

export interface SpatialEnvironment {
  groundY: number;
  horizonY: number;
  vpX: number;
  floorScale: number;
}

export const DEFAULT_GROUND_Y = 7013.5;
export const GROUND_TOL = 32;

export const DEFAULT_SPATIAL_ENV: PerspectiveState = {
  enabled: true,
  groundY: DEFAULT_GROUND_Y,
  horizonY: 3170,
  vpX: 1257,
  floorScale: 420,
};

/**
 * Returns the canonical set of joints pinned for a given IK/Balance solver mode,
 * merged with any user-toggled manual pins.
 */
export function getPinnedJoints(
  mode: SolverMode,
  customPins?: Record<string, IKPinEntry>,
): JointId[] {
  const pinned = new Set<JointId>();
  if (mode === 'pinFeet') {
    pinned.add('footL');
    pinned.add('footR');
  } else if (mode === 'pinAll') {
    pinned.add('footL');
    pinned.add('footR');
    pinned.add('handL');
    pinned.add('handR');
  } else if (mode === 'pinFull') {
    pinned.add('footL');
    pinned.add('footR');
    pinned.add('handL');
    pinned.add('handR');
    pinned.add('head');
  }
  if (customPins) {
    for (const [id, entry] of Object.entries(customPins)) {
      if (entry?.pinned) pinned.add(id as JointId);
    }
  }
  return Array.from(pinned);
}

/**
 * Computes average horizontal support center across planted/pinned feet for procedural balance counterweight.
 */
export function computeSupportCenterX(
  by: Record<string, RigNode>,
  posFn: (n: RigNode, map: Record<string, RigNode>) => [number, number],
  groundY: number,
  pins?: Record<string, IKPinEntry>,
): number | null {
  const xs: number[] = [];
  for (const id of ['footL', 'footR'] as const) {
    const fn = by[id];
    if (!fn) continue;
    const p = posFn(fn, by);
    if (pins?.[id]?.pinned || Math.abs(p[1] - groundY) <= GROUND_TOL) {
      xs.push(p[0]);
    }
  }
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Enforces floor contact on lowest foot and optional center-of-mass balance feedback over support base.
 */
export function applyGroundAndBalance(
  nodes: RigNode[],
  by: Record<string, RigNode>,
  root: RigNode,
  env: Pick<SpatialEnvironment, 'groundY'>,
  mode: SolverMode,
  solveFn: (n: RigNode[], b: Record<string, RigNode>, bondOn: boolean, wingPop: number) => void,
  posFn: (n: RigNode, map: Record<string, RigNode>) => [number, number],
  bondOn: boolean,
  wingPop: number,
  options?: { pullDownToo?: boolean; balanceWeight?: number; pins?: Record<string, IKPinEntry> },
): boolean {
  solveFn(nodes, by, bondOn, wingPop);
  let maxFootY = -1e9;
  for (const id of ['footL', 'footR'] as const) {
    const fn = by[id];
    if (!fn) continue;
    maxFootY = Math.max(maxFootY, posFn(fn, by)[1]);
  }
  if (maxFootY < -1e8) return false;

  let adjusted = false;
  const diffY = env.groundY - maxFootY;
  if (diffY < -0.5 || (options?.pullDownToo && diffY > 0.5)) {
    root.ty += diffY;
    adjusted = true;
  }

  if (mode === 'balance' && (options?.balanceWeight ?? 0) > 0) {
    solveFn(nodes, by, bondOn, wingPop);
    const supportX = computeSupportCenterX(by, posFn, env.groundY, options?.pins);
    if (supportX !== null) {
      const pelvisX = posFn(root, by)[0];
      const thoraxX = by.thorax ? posFn(by.thorax, by)[0] : pelvisX;
      const comX = pelvisX * 0.55 + thoraxX * 0.45;
      const w = Math.max(0, Math.min(0.4, options?.balanceWeight ?? 0));
      const shiftX = (supportX - comX) * w;
      if (Math.abs(shiftX) > 0.5) {
        root.tx += shiftX;
        adjusted = true;
      }
    }
  }

  if (adjusted) solveFn(nodes, by, bondOn, wingPop);
  return adjusted;
}
