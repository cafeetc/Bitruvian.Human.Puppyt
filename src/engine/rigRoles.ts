import type { JointId } from './motionFormat';
import type { RigNode } from './types';

export type BoneRole =
  | 'root'
  | 'spine'
  | 'head_facial'
  | 'shoulder_girdle'
  | 'limb_arm'
  | 'hand_digit'
  | 'limb_leg'
  | 'foot_digit'
  | 'accessory_wing'
  | 'accessory_rig';

export interface JointMeta {
  id: JointId;
  role: BoneRole;
  side: 'center' | 'L' | 'R';
  /** True kinematic parent inside the 43-node articulated graph */
  parent: JointId | null;
  ikChain?: 'armL' | 'armR' | 'legL' | 'legR' | 'spine';
}

/**
 * Semantic classification & true kinematic hierarchy for all 43 skeleton joints.
 * Matches the live articulated parent-child topology (including pelvis -> hip -> femur
 * and lumbar -> swivel -> acromion -> humerus, with thorax -> brace aiming at acromion).
 */
export const RIG_METADATA: Record<JointId, JointMeta> = {
  pelvis: { id: 'pelvis', role: 'root', side: 'center', parent: null, ikChain: 'spine' },
  lumbar: { id: 'lumbar', role: 'spine', side: 'center', parent: 'pelvis', ikChain: 'spine' },
  thorax: { id: 'thorax', role: 'spine', side: 'center', parent: 'lumbar', ikChain: 'spine' },
  neck: { id: 'neck', role: 'spine', side: 'center', parent: 'thorax', ikChain: 'spine' },
  head: { id: 'head', role: 'head_facial', side: 'center', parent: 'neck' },
  lip: { id: 'lip', role: 'head_facial', side: 'center', parent: 'head' },
  chinTip: { id: 'chinTip', role: 'head_facial', side: 'center', parent: 'lip' },
  ribL: { id: 'ribL', role: 'spine', side: 'L', parent: 'thorax' },
  ribR: { id: 'ribR', role: 'spine', side: 'R', parent: 'thorax' },
  swivelL: { id: 'swivelL', role: 'shoulder_girdle', side: 'L', parent: 'lumbar', ikChain: 'armL' },
  swivelTipL: { id: 'swivelTipL', role: 'accessory_rig', side: 'L', parent: 'swivelL' },
  acromionL: { id: 'acromionL', role: 'shoulder_girdle', side: 'L', parent: 'swivelL', ikChain: 'armL' },
  braceL: { id: 'braceL', role: 'shoulder_girdle', side: 'L', parent: 'thorax' },
  humerusL: { id: 'humerusL', role: 'limb_arm', side: 'L', parent: 'acromionL', ikChain: 'armL' },
  forearmL: { id: 'forearmL', role: 'limb_arm', side: 'L', parent: 'humerusL', ikChain: 'armL' },
  handL: { id: 'handL', role: 'limb_arm', side: 'L', parent: 'forearmL', ikChain: 'armL' },
  thumbL: { id: 'thumbL', role: 'hand_digit', side: 'L', parent: 'handL' },
  thumbTipL: { id: 'thumbTipL', role: 'hand_digit', side: 'L', parent: 'thumbL' },
  fingerL: { id: 'fingerL', role: 'hand_digit', side: 'L', parent: 'handL' },
  fingerTipL: { id: 'fingerTipL', role: 'hand_digit', side: 'L', parent: 'fingerL' },
  swivelR: { id: 'swivelR', role: 'shoulder_girdle', side: 'R', parent: 'lumbar', ikChain: 'armR' },
  swivelTipR: { id: 'swivelTipR', role: 'accessory_rig', side: 'R', parent: 'swivelR' },
  acromionR: { id: 'acromionR', role: 'shoulder_girdle', side: 'R', parent: 'swivelR', ikChain: 'armR' },
  braceR: { id: 'braceR', role: 'shoulder_girdle', side: 'R', parent: 'thorax' },
  humerusR: { id: 'humerusR', role: 'limb_arm', side: 'R', parent: 'acromionR', ikChain: 'armR' },
  forearmR: { id: 'forearmR', role: 'limb_arm', side: 'R', parent: 'humerusR', ikChain: 'armR' },
  handR: { id: 'handR', role: 'limb_arm', side: 'R', parent: 'forearmR', ikChain: 'armR' },
  thumbR: { id: 'thumbR', role: 'hand_digit', side: 'R', parent: 'handR' },
  thumbTipR: { id: 'thumbTipR', role: 'hand_digit', side: 'R', parent: 'thumbR' },
  fingerR: { id: 'fingerR', role: 'hand_digit', side: 'R', parent: 'handR' },
  fingerTipR: { id: 'fingerTipR', role: 'hand_digit', side: 'R', parent: 'fingerR' },
  hipL: { id: 'hipL', role: 'limb_leg', side: 'L', parent: 'pelvis', ikChain: 'legL' },
  femurL: { id: 'femurL', role: 'limb_leg', side: 'L', parent: 'hipL', ikChain: 'legL' },
  shinL: { id: 'shinL', role: 'limb_leg', side: 'L', parent: 'femurL', ikChain: 'legL' },
  footL: { id: 'footL', role: 'limb_leg', side: 'L', parent: 'shinL', ikChain: 'legL' },
  toeL: { id: 'toeL', role: 'foot_digit', side: 'L', parent: 'footL' },
  hipR: { id: 'hipR', role: 'limb_leg', side: 'R', parent: 'pelvis', ikChain: 'legR' },
  femurR: { id: 'femurR', role: 'limb_leg', side: 'R', parent: 'hipR', ikChain: 'legR' },
  shinR: { id: 'shinR', role: 'limb_leg', side: 'R', parent: 'femurR', ikChain: 'legR' },
  footR: { id: 'footR', role: 'limb_leg', side: 'R', parent: 'shinR', ikChain: 'legR' },
  toeR: { id: 'toeR', role: 'foot_digit', side: 'R', parent: 'footR' },
  wingL: { id: 'wingL', role: 'accessory_wing', side: 'L', parent: 'braceL' },
  wingR: { id: 'wingR', role: 'accessory_wing', side: 'R', parent: 'braceR' },
};

export interface HierarchyAuditReport {
  valid: boolean;
  orphanNodes: string[];
  cycles: string[];
  parentMismatches: Array<{ id: string; expected: string | null; actual: string | null }>;
}

/**
 * Verifies every joint connects to a valid parent without cycles and matches canonical topology.
 */
export function auditRigHierarchy(nodes: RigNode[], by: Record<string, RigNode>): HierarchyAuditReport {
  const orphanNodes: string[] = [];
  const cycles: string[] = [];
  const parentMismatches: Array<{ id: string; expected: string | null; actual: string | null }> = [];

  for (const n of nodes) {
    if (n.parent && !by[n.parent]) {
      orphanNodes.push(n.id);
    }
    const meta = RIG_METADATA[n.id as JointId];
    if (meta && meta.parent !== n.parent) {
      parentMismatches.push({ id: n.id, expected: meta.parent, actual: n.parent });
    }
    const seen = new Set<string>([n.id]);
    let cur: RigNode | undefined = n.parent ? by[n.parent] : undefined;
    while (cur) {
      if (seen.has(cur.id)) {
        cycles.push(n.id);
        break;
      }
      seen.add(cur.id);
      cur = cur.parent ? by[cur.parent] : undefined;
    }
  }

  return {
    valid: orphanNodes.length === 0 && cycles.length === 0,
    orphanNodes,
    cycles,
    parentMismatches,
  };
}
