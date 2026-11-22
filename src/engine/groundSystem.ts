import {
  CANONICAL_PROPORTIONS,
  clampJointAngle,
  safeFinite,
  snapAngularEpsilon,
  VECTOR_EPSILON_PX,
} from './jointLimits';
import type { JointId } from './motionFormat';
import { CONTRALATERAL_LIMB_PAIRS } from './rigRoles';
import type { IKMode, IKPinEntry, PerspectiveState, RigNode } from './types';

export type SolverMode = IKMode;
export type PostureRegime = 'standing' | 'moving';

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

export interface LocomotionDiagnostics {
  regime: PostureRegime;
  strideAsymmetryDeg: number;
  hipSplayDeg: number;
  legSplayDropPx: number;
  armSpanToHeightRatio: number;
  naturalArmReachPx: number;
  stanceSide: 'L' | 'R' | 'balanced';
}

export type PosReader = (n: RigNode, map: Record<string, RigNode>) => [number, number];

function dist2(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const d = Math.hypot(dx, dy);
  return d > VECTOR_EPSILON_PX ? d : 0;
}

/**
 * Computes canonical Vitruvian & Leonardo da Vinci proportional metrics from the
 * live solved rig (arm span vs. height, limb segment lengths, leg-splay 1/14 height drop).
 */
export function computeCanonicalProportionMetrics(
  by: Record<string, RigNode>,
  posFn: PosReader,
): {
  standingHeightPx: number;
  armSpanPx: number;
  armSpanToHeightRatio: number;
  armMaxReachPx: number;
  legMaxReachPx: number;
  hipSplayDeg: number;
  legSplayDropPx: number;
} {
  const headP = by.head ? posFn(by.head, by) : [1257, 595.5] as [number, number];
  const footLP = by.footL ? posFn(by.footL, by) : [1658, DEFAULT_GROUND_Y] as [number, number];
  const footRP = by.footR ? posFn(by.footR, by) : [833, DEFAULT_GROUND_Y] as [number, number];
  const crownY = headP[1] - 580;
  const soleY = Math.max(footLP[1], footRP[1]) + 610;
  const standingHeightPx = Math.max(2400, safeFinite(soleY - crownY, 7883));

  const humLP = by.humerusL ? posFn(by.humerusL, by) : null;
  const forLP = by.forearmL ? posFn(by.forearmL, by) : null;
  const handLP = by.handL ? posFn(by.handL, by) : null;
  const humRP = by.humerusR ? posFn(by.humerusR, by) : null;
  const forRP = by.forearmR ? posFn(by.forearmR, by) : null;
  const handRP = by.handR ? posFn(by.handR, by) : null;

  const armReachL =
    humLP && forLP && handLP
      ? dist2(humLP, forLP) + dist2(forLP, handLP) + standingHeightPx * CANONICAL_PROPORTIONS.vitruvius.handToHeight
      : standingHeightPx * (CANONICAL_PROPORTIONS.leonardo.upperArmToHeight + CANONICAL_PROPORTIONS.leonardo.forearmHandToHeight);
  const armReachR =
    humRP && forRP && handRP
      ? dist2(humRP, forRP) + dist2(forRP, handRP) + standingHeightPx * CANONICAL_PROPORTIONS.vitruvius.handToHeight
      : armReachL;
  const armMaxReachPx = Math.max(1200, (armReachL + armReachR) * 0.5);

  const femLP = by.femurL ? posFn(by.femurL, by) : null;
  const femRP = by.femurR ? posFn(by.femurR, by) : null;
  const shLP = by.shinL ? posFn(by.shinL, by) : null;
  const legMaxReachPx =
    femLP && shLP
      ? dist2(femLP, shLP) + dist2(shLP, footLP)
      : standingHeightPx * (CANONICAL_PROPORTIONS.vitruvius.thighToHeight + CANONICAL_PROPORTIONS.vitruvius.lowerLegToHeight);

  // Outspread arm span ~ shoulder width + 2 * armReach vs. standing height (Leonardo 1:1 rule)
  const shoulderSpan = humLP && humRP ? dist2(humLP, humRP) : standingHeightPx * 0.175;
  const armSpanPx = shoulderSpan + armReachL + armReachR;
  const armSpanToHeightRatio = armSpanPx / standingHeightPx;

  // Bilateral hip-to-ankle spread angle for Leonardo's 1/14 equilateral-triangle splay drop
  let halfSplayRad = 0;
  if (femLP && femRP) {
    const dirL = Math.atan2(footLP[0] - femLP[0], Math.max(VECTOR_EPSILON_PX, footLP[1] - femLP[1]));
    const dirR = Math.atan2(femRP[0] - footRP[0], Math.max(VECTOR_EPSILON_PX, footRP[1] - femRP[1]));
    const outwardL = Math.max(0, dirL);
    const outwardR = Math.max(0, dirR);
    halfSplayRad = Math.min(Math.PI * 0.44, (outwardL + outwardR) * 0.5);
  }
  const hipSplayDeg = snapAngularEpsilon((halfSplayRad * 2 * 180) / Math.PI);
  const eqHalfRad = (CANONICAL_PROPORTIONS.leonardo.equilateralSplayHalfDeg * Math.PI) / 180;
  const cosDiffEq = Math.max(1e-4, 1 - Math.cos(eqHalfRad));
  const cosDiffCur = Math.max(0, 1 - Math.cos(halfSplayRad));
  const normalizedSplay = Math.min(1.25, cosDiffCur / cosDiffEq);
  const legSplayDropPx =
    standingHeightPx * CANONICAL_PROPORTIONS.leonardo.legSplayHeightDrop * normalizedSplay;

  return {
    standingHeightPx,
    armSpanPx,
    armSpanToHeightRatio,
    armMaxReachPx,
    legMaxReachPx,
    hipSplayDeg,
    legSplayDropPx,
  };
}

/**
 * Classifies whether the puppet is in a static Standing pose or an active Moving
 * locomotion regime based on root velocity, explicit override, or stride asymmetry.
 */
export function inferPostureRegime(options: {
  by: Record<string, RigNode>;
  posFn: PosReader;
  explicitRegime?: PostureRegime;
  rootVelocity?: [number, number];
  isKeyframedMotion?: boolean;
}): { regime: PostureRegime; strideAsymmetryDeg: number } {
  const femL = options.by.femurL;
  const shinL = options.by.shinL;
  const femR = options.by.femurR;
  const shinR = options.by.shinR;
  let strideAsymmetryDeg = 0;
  if (femL && shinL && femR && shinR) {
    const pFL = options.posFn(femL, options.by);
    const pSL = options.posFn(shinL, options.by);
    const pFR = options.posFn(femR, options.by);
    const pSR = options.posFn(shinR, options.by);
    const aL = Math.atan2(pSL[0] - pFL[0], pSL[1] - pFL[1]);
    const aR = Math.atan2(pSR[0] - pFR[0], pSR[1] - pFR[1]);
    strideAsymmetryDeg = Math.abs(((aL - aR) * 180) / Math.PI);
  }

  if (options.explicitRegime) {
    return { regime: options.explicitRegime, strideAsymmetryDeg };
  }
  const speed = options.rootVelocity
    ? Math.hypot(safeFinite(options.rootVelocity[0]), safeFinite(options.rootVelocity[1]))
    : 0;
  const movingByVel = speed >= CANONICAL_PROPORTIONS.muybridge.movingVelocityThresholdPx;
  const movingByStride =
    !!options.isKeyframedMotion &&
    strideAsymmetryDeg >= CANONICAL_PROPORTIONS.muybridge.movingStrideAngleThresholdDeg;

  return {
    regime: movingByVel || movingByStride ? 'moving' : 'standing',
    strideAsymmetryDeg,
  };
}

/**
 * Muybridge-grounded moving-regime contralateral arm-to-leg counter-swing and gentle
 * torso counter-rotation. Strictly skips any joint that is locked, manually pinned,
 * or actively dragged by the user so direct placement stays authoritative.
 */
export function applyMovingCounterBalance(
  by: Record<string, RigNode>,
  posFn: PosReader,
  options: {
    constrainLimits: boolean;
    strideStrength?: number;
    pins?: Record<string, IKPinEntry>;
    lockedJoints?: ReadonlySet<string>;
  },
): boolean {
  const femL = by.femurL;
  const shinL = by.shinL;
  const femR = by.femurR;
  const shinR = by.shinR;
  if (!femL || !shinL || !femR || !shinR) return false;

  const pFL = posFn(femL, by);
  const pSL = posFn(shinL, by);
  const pFR = posFn(femR, by);
  const pSR = posFn(shinR, by);
  // Signed leg forward/back swing relative to vertical (positive = forward swing)
  const legSwingL = (Math.atan2(pSL[0] - pFL[0], Math.max(VECTOR_EPSILON_PX, pSL[1] - pFL[1])) * 180) / Math.PI;
  const legSwingR = (Math.atan2(pSR[0] - pFR[0], Math.max(VECTOR_EPSILON_PX, pSR[1] - pFR[1])) * 180) / Math.PI;
  const strideDiff = legSwingR - legSwingL;
  if (Math.abs(strideDiff) < 1.5) return false;

  const strength = Math.max(0, Math.min(1, safeFinite(options.strideStrength ?? 0.55, 0.55)));
  const coupling = CANONICAL_PROPORTIONS.muybridge.contralateralArmLegCoupling * strength;
  const elbowFollow = CANONICAL_PROPORTIONS.muybridge.forearmSwingFollow * strength;
  let changed = false;

  for (const pair of CONTRALATERAL_LIMB_PAIRS) {
    const legSwing = pair.legSide === 'R' ? legSwingR : legSwingL;
    const armPinned = !!(options.pins?.[pair.armSide === 'L' ? 'handL' : 'handR']?.pinned);
    const armLocked =
      !!options.lockedJoints?.has(pair.humerus) ||
      !!options.lockedJoints?.has(pair.forearm);
    if (armPinned || armLocked) continue;

    const hum = by[pair.humerus];
    const fore = by[pair.forearm];
    if (hum && !hum.lock) {
      // Opposing swing around rest: arm swings opposite its ipsilateral leg / in phase with contralateral leg
      const armSign = pair.armSide === 'L' ? -1 : 1;
      const targetBias = snapAngularEpsilon(legSwing * coupling * armSign);
      const next = clampJointAngle(hum.id, hum.ang + (targetBias - hum.ang) * 0.32 * strength, options.constrainLimits);
      if (Math.abs(next - hum.ang) > 0.05) {
        hum.ang = next;
        changed = true;
      }
    }
    if (fore && !fore.lock) {
      const foreBendSign = pair.armSide === 'L' ? -1 : 1;
      const flexAmt = Math.max(0, Math.abs(legSwing) * elbowFollow);
      const nextFore = clampJointAngle(
        fore.id,
        fore.ang + (flexAmt * foreBendSign - fore.ang) * 0.25 * strength,
        options.constrainLimits,
      );
      if (Math.abs(nextFore - fore.ang) > 0.05) {
        fore.ang = nextFore;
        changed = true;
      }
    }
  }

  // Subtle thorax counter-lean across spine against hip stride asymmetry
  const thorax = by.thorax;
  if (thorax && !thorax.lock && !options.lockedJoints?.has('thorax')) {
    const counter = snapAngularEpsilon(-strideDiff * CANONICAL_PROPORTIONS.muybridge.spineCounterRotationGain * strength);
    const nextTx = clampJointAngle('thorax', thorax.ang + (counter - thorax.ang) * 0.2, options.constrainLimits);
    if (Math.abs(nextTx - thorax.ang) > 0.05) {
      thorax.ang = nextTx;
      changed = true;
    }
  }

  return changed;
}

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
  posFn: PosReader,
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
 * Enforces floor contact on lowest foot, applies Leonardo 1/14 leg-splay drop grounding
 * in Standing mode, and drives Muybridge weight transfer + contralateral swing in Moving mode.
 */
export function applyGroundAndBalance(
  nodes: RigNode[],
  by: Record<string, RigNode>,
  root: RigNode,
  env: Pick<SpatialEnvironment, 'groundY'>,
  mode: SolverMode,
  solveFn: (n: RigNode[], b: Record<string, RigNode>, bondOn: boolean, wingPop: number) => void,
  posFn: PosReader,
  bondOn: boolean,
  wingPop: number,
  options?: {
    pullDownToo?: boolean;
    balanceWeight?: number;
    pins?: Record<string, IKPinEntry>;
    regime?: PostureRegime;
    rootVelocity?: [number, number];
    isKeyframedMotion?: boolean;
    constrainLimits?: boolean;
    lockedJoints?: ReadonlySet<string>;
  },
): boolean {
  solveFn(nodes, by, bondOn, wingPop);
  let maxFootY = -1e9;
  for (const id of ['footL', 'footR'] as const) {
    const fn = by[id];
    if (!fn) continue;
    maxFootY = Math.max(maxFootY, posFn(fn, by)[1]);
  }
  if (maxFootY < -1e8) return false;

  const { regime } = inferPostureRegime({
    by,
    posFn,
    explicitRegime: options?.regime,
    rootVelocity: options?.rootVelocity,
    isKeyframedMotion: options?.isKeyframedMotion,
  });

  const metrics = computeCanonicalProportionMetrics(by, posFn);
  let adjusted = false;
  const diffY = env.groundY - maxFootY;
  // In Standing mode with splayed legs, preserve exact ground contact for Leonardo's 1/14 height reduction
  const splayFloorWindow = Math.max(GROUND_TOL, metrics.legSplayDropPx + GROUND_TOL);
  const shouldPullToFloor =
    !!options?.pullDownToo ||
    (regime === 'standing' &&
      metrics.hipSplayDeg >= 8 &&
      diffY > 0.5 &&
      diffY <= splayFloorWindow);
  if (diffY < -0.5 || (shouldPullToFloor && diffY > 0.5)) {
    root.ty = safeFinite(root.ty + diffY, root.ty);
    adjusted = true;
  }

  if (regime === 'moving') {
    const swung = applyMovingCounterBalance(by, posFn, {
      constrainLimits: !!options?.constrainLimits,
      pins: options?.pins,
      lockedJoints: options?.lockedJoints,
      strideStrength: mode === 'balance' ? 0.65 : 0.42,
    });
    if (swung) adjusted = true;
  }

  if ((mode === 'balance' || regime === 'moving') && (options?.balanceWeight ?? 0) > 0) {
    solveFn(nodes, by, bondOn, wingPop);
    const supportX = computeSupportCenterX(by, posFn, env.groundY, options?.pins);
    if (supportX !== null) {
      const pelvisX = posFn(root, by)[0];
      const thoraxX = by.thorax ? posFn(by.thorax, by)[0] : pelvisX;
      const comX = pelvisX * 0.55 + thoraxX * 0.45;
      const w = Math.max(0, Math.min(0.4, safeFinite(options?.balanceWeight ?? 0, 0)));
      const shiftX = (supportX - comX) * w;
      if (Math.abs(shiftX) > 0.5) {
        root.tx = safeFinite(root.tx + shiftX, root.tx);
        adjusted = true;
      }
    }
  }

  if (adjusted) solveFn(nodes, by, bondOn, wingPop);
  return adjusted;
}
