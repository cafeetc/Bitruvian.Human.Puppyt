/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FloatingPanel, type PanelLayoutState } from './components/FloatingPanel';
import {
  AboutPanel,
  BonesPanel,
  DataPanel,
  IKPanel,
  PoseLibraryPanel,
  PosePanel,
  RoadmapPanel,
  TimelinePanel,
} from './components/Panels';
import { PartRigModal } from './components/PartRigModal';
import { RigSystemsPanel } from './components/studio/RigSystemsPanel';
import { StageHud } from './components/studio/StageHud';
import { TimelineDock } from './components/studio/TimelineDock';
import { StageRenderer, type AbcGhostItem } from './engine/canvasRenderer';
import {
  DEG,
  applyChungusChestCavity,
  applyPoseSnapshot,
  applyPrometheusArmCompensation,
  applyPrometheusWingFollowFromArm,
  applyRibAnchorMode,
  buildRigGraph,
  clampAnatomicalAngle,
  clampCameraToKeepBodyVisible,
  clampChungusRibAngle,
  clampRealisticShoulder,
  computeModelFrame,
  computeRigWorldBounds,
  decImage,
  exportBskJson,
  getBondStatus,
  hitTest,
  hitTestPiece,
  normalizeDeg,
  parentOf,
  parseBskJson,
  pos,
  setPieceBitmap,
  solveRig,
  sortPiecesForWings,
  type RibAnchorMode,
} from './engine/fkEngine';
import { applyGotzPreset, cloneGotzState, getGotzPoseCode } from './engine/gotzHandEngine';
import {
  buildCanonicalPayload,
  createBuiltinChungusLibraryPoses,
  mirrorPoseSide,
  parseAndValidateRigPayload,
  payloadToPoseSnapshot,
  serializeRigPayload,
  type Keyframe as CanonicalKeyframe,
} from './engine/motionFormat';
import {
  HEAD_TURN_SEQUENCE,
  applyHeadTurnStep,
  getHeadTurnStep,
  preloadSkullAssets,
  resolvePoseHeadTurnStep,
  type HeadTurnStep,
  type SkullViewMode,
} from './engine/skullKitModels';
import {
  DEFAULT_IK_CONFIG,
  FBIK_CHAIN_NODES,
  LONG_IK_MS,
  PERSP_DEFAULT,
  anchorFigureOnPerspectiveShift,
  applyBalanceAndPins,
  applyPerspectiveSpineDelta,
  captureFBIKBaseline,
  capturePoseIKSnapshot,
  enforceGroundContact,
  findLimbChainForNode,
  getWorldDir,
  hitPerspHandle,
  limbLengths,
  setWorldDirExact,
  solveAnalyticalLimbIK,
  solveFullBodyIKDrag,
  solveLimbChain,
  syncPinsFromRig,
  type FBIKDragBaseline,
  type PerspectiveSpineBias,
  type PoseIKSnapshot,
} from './engine/ikEngine';
import {
  ABC_SLOTS,
  DEFAULT_MOTION_SETTINGS,
  applyAbcPoseInstant,
  applyAbcTweenPose,
  captureAbcPose,
  createDefaultAbcState,
  evalMotionScalar,
  getAbcCycleSequence,
  getAbcNodeLag,
  getFilledAbcSlots,
  nextAbcSlot,
  synthesizeProceduralInBetween,
} from './engine/motionEngine';
import { PartRigManager } from './engine/partRigEngine';
import { LIMB_CHAINS } from './engine/rigMetadata';
import type {
  AbcLoopMode,
  AbcPoseRecord,
  AbcSerializedState,
  AbcSlot,
  BondStatusItem,
  IKConfig,
  IKMode,
  IKOverlayState,
  IKPinEntry,
  Keyframe,
  LimbChainDef,
  MotionFeel,
  MotionSettings,
  PanelId,
  PartRigInstance,
  PartsManifest,
  PerspHandle,
  PerspectiveState,
  PoseSnapshot,
  RawRigDef,
  RenderMode,
  RigNode,
  RigPiece,
  SavedPoseEntry,
  SkullTurnTiming,
} from './engine/types';

const STORAGE_KEY = 'bpz_v1';
const POSE_LIBRARY_KEY = 'bpz_pose_library_v1';

interface RigRuntime {
  W: number;
  H: number;
  nodes: RigNode[];
  by: Record<string, RigNode>;
  root: RigNode;
  pieces: RigPiece[];
  sel: RigNode;
  hov: RigNode | null;
  z: number;
  ox: number;
  oy: number;
  dpr: number;
  userView: boolean;
  mode: RenderMode;
  showBones: boolean;
  showGuides: boolean;
  bondOn: boolean;
  constrainLimits: boolean;
  prometheusWings: boolean;
  ribAnchor: RibAnchorMode;
  skullView: SkullViewMode;
  headStep: HeadTurnStep;
  wingPop: number;
  wingVel: number;
  wingTarget: number;
  dirty: boolean;
  raf: number;
  actUntil: number;
  playing: boolean;
  loop: boolean;
  fps: number;
  frame: number;
  t0: number;
  keys: Keyframe[];
  canonicalKeys: CanonicalKeyframe[];
  ema: number;
  hudT: number;
}

const DEFAULT_PANELS: Record<PanelId, PanelLayoutState> = {
  pose: { open: false, collapsed: false, floating: false, x: 24, y: 72, zIndex: 31 },
  bones: { open: false, collapsed: false, floating: false, x: 24, y: 72, zIndex: 32 },
  ik: { open: false, collapsed: false, floating: false, x: 24, y: 72, zIndex: 33 },
  tl: { open: false, collapsed: false, floating: false, x: 24, y: 72, zIndex: 34 },
  library: { open: false, collapsed: false, floating: false, x: 24, y: 72, zIndex: 35 },
  data: { open: false, collapsed: false, floating: false, x: 24, y: 72, zIndex: 36 },
  roadmap: { open: false, collapsed: false, floating: false, x: 24, y: 72, zIndex: 37 },
  about: { open: false, collapsed: false, floating: false, x: 24, y: 72, zIndex: 38 },
};

function loadInitialPanels(): Record<PanelId, PanelLayoutState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PANELS;
    const parsed = JSON.parse(raw);
    const out = { ...DEFAULT_PANELS };
    (Object.keys(DEFAULT_PANELS) as PanelId[]).forEach((id) => {
      if (parsed[id]) {
        out[id] = { ...DEFAULT_PANELS[id], ...parsed[id] };
      }
    });
    return out;
  } catch {
    return DEFAULT_PANELS;
  }
}

function loadPoseLibrary(): SavedPoseEntry[] {
  const builtins = createBuiltinChungusLibraryPoses();
  try {
    const raw = localStorage.getItem(POSE_LIBRARY_KEY);
    const parsed: SavedPoseEntry[] = raw ? (JSON.parse(raw) as SavedPoseEntry[]) : [];
    const existing = Array.isArray(parsed) ? parsed : [];
    if (!localStorage.getItem('bitruvius_chungus_seed_v1')) {
      const existingIds = new Set(existing.map((e) => e.id));
      const merged = [...existing, ...builtins.filter((b) => !existingIds.has(b.id))];
      localStorage.setItem(POSE_LIBRARY_KEY, JSON.stringify(merged));
      localStorage.setItem('bitruvius_chungus_seed_v1', '1');
      return merged;
    }
    return existing;
  } catch {
    return builtins;
  }
}

export default function App() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const safeInsetRef = useRef<{ right: number; bottom: number }>({ right: 0, bottom: 0 });
  const rendererRef = useRef(new StageRenderer());
  const partMgrRef = useRef<PartRigManager | null>(null);
  const rawBaseRigRef = useRef<RawRigDef | null>(null);
  const rtRef = useRef<RigRuntime | null>(null);
  const dragRef = useRef<
    | { t: 'pan'; x: number; y: number; ox: number; oy: number }
    | {
        t: 'rot';
        a0: number;
        s: number;
        rawAng: number;
        parDetSign: number;
        snap?: PoseIKSnapshot;
        ikPending?:
          | {
              kind: 'limb';
              chain: LimbChainDef;
              node: RigNode;
              q0: [number, number];
              startX: number;
              startY: number;
              t0: number;
            }
          | {
              kind: 'fbik';
              fbNode: RigNode;
              q0: [number, number];
              startX: number;
              startY: number;
              t0: number;
            };
      }
    | {
        t: 'hipSwivel';
        side: 'L' | 'R';
        sAng: number;
        rawHip: number;
        hip0: number;
        femur0: number;
        shin0: number;
        foot0: number;
        flipped0: boolean;
        ankleTarget0: [number, number] | null;
        footWorldDir0: number | null;
        snap?: PoseIKSnapshot;
      }
    | {
        t: 'persp';
        what: 'vp' | 'horizon' | 'ground';
        q0: [number, number];
        vpX0: number;
        h0: number;
        g0: number;
      }
    | {
        t: 'shoulder';
        side: 'L' | 'R';
        guide: 'wing' | 'tendon' | 'acromion' | 'prometheus';
        sSwivel: number;
        sNeck: number;
        swivel0: number;
        acro0: number;
        brace0: number;
        humerus0: number;
        forearm0: number;
        hand0: number;
        snap?: PoseIKSnapshot;
      }
    | {
        t: 'limbIk';
        chain: LimbChainDef;
        target0: [number, number];
        q0: [number, number];
        swiv0: number;
        brace0: number;
        endDir0: number;
        bendHint: number;
        snap: PoseIKSnapshot;
        snapAngles: Record<string, number>;
        isElasticPin?: boolean;
        pinAnchor?: [number, number];
        downX: number;
        downY: number;
      }
    | {
        t: 'fbik';
        baseline: FBIKDragBaseline;
        activeChainIds: string[];
        downX: number;
        downY: number;
      }
    | {
        t: 'headSwivel';
        lastWorld: [number, number];
        startX: number;
        startY: number;
        accumAlongSpineRight: number;
        lastDir: -1 | 0 | 1;
        swiveledSteps: number;
      }
    | null
  >(null);
  const ikConfigRef = useRef<IKConfig>({ ...DEFAULT_IK_CONFIG });
  const perspRef = useRef<PerspectiveState>({ ...PERSP_DEFAULT });
  const perspSpineBiasRef = useRef<PerspectiveSpineBias>({ lumbar: 0, thorax: 0 });
  const hoverPerspRef = useRef<PerspHandle>(null);
  const ikPinsRef = useRef<Record<string, IKPinEntry>>({});
  const ikOverlayRef = useRef<{
    activeChainIds: string[] | null;
    targetPos: [number, number] | null;
    holdProgress: number | null;
    holdPos: [number, number] | null;
    elasticTethers?: Array<{ anchor: [number, number]; current: [number, number] }>;
  }>({
    activeChainIds: null,
    targetPos: null,
    holdProgress: null,
    holdPos: null,
    elasticTethers: undefined,
  });
  const longIkTimerRef = useRef<number>(0);
  const rightClickRef = useRef<{ count: number; timer: number }>({ count: 0, timer: 0 });
  const shiftTapRef = useRef<{ down: boolean; used: boolean }>({ down: false, used: false });
  const zCounterRef = useRef(40);
  const jsonEditingRef = useRef(false);
  const benchmarkMsgRef = useRef(false);
  const copyToastTimerRef = useRef(0);
  const abcRef = useRef<AbcSerializedState>(createDefaultAbcState());
  const abcPlayingRef = useRef(false);
  const abcLoopDirRef = useRef<1 | -1>(1);
  const abcPlayTimerRef = useRef(0);
  const abcScrubRef = useRef(0);
  const backdropDismissedRef = useRef(false);
  const sidePoseRef = useRef<'L' | 'R' | null>(null);
  const snapSpringRef = useRef<{
    fromAngles: Record<string, number>;
    toAngles: Record<string, number>;
    t0: number;
    dur: number;
  } | null>(null);
  const abcAnimRef = useRef<{
    fromPose: AbcPoseRecord;
    toPose: AbcPoseRecord;
    toSlot: AbcSlot;
    t0: number;
    dur: number;
    totalF: number;
    fpsPeriod: number;
    lastIdx: number;
    isLoop?: boolean;
    onDone?: () => void;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [panels, setPanels] = useState<Record<PanelId, PanelLayoutState>>(loadInitialPanels);
  const [showStats, setShowStats] = useState(false);
  const [hudText, setHudText] = useState('');
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [activePart, setActivePart] = useState<PartRigInstance | null>(null);
  const [modelSplitPct, setModelSplitPct] = useState(46);
  const [partHeightPct, setPartHeightPct] = useState(92);
  const [abcPlaying, setAbcPlaying] = useState(false);
  const [savedPoses, setSavedPoses] = useState<SavedPoseEntry[]>(loadPoseLibrary);

  // React mirrors for toolbar & panels
  const [uiTick, setUiTick] = useState(0);
  const [jsonText, setJsonText] = useState('');
  const [safeHudInset, setSafeHudInset] = useState<{ right: number; bottom: number }>({ right: 0, bottom: 0 });

  const buildJsonString = useCallback(() => {
    const rt = rtRef.current;
    if (!rt || !partMgrRef.current) return '';
    solveRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, rt.ribAnchor);
    const coordsById: Record<string, [number, number]> = {};
    for (const n of rt.nodes) {
      coordsById[n.id] = pos(n, rt.by);
    }
    const payload = buildCanonicalPayload(
      rt.nodes,
      coordsById,
      rt.root,
      rt.canonicalKeys,
      partMgrRef.current.inst,
      cloneGotzState,
      {
        abc: abcRef.current,
        prometheusWings: rt.prometheusWings,
        ribAnchor: rt.ribAnchor,
        headStep: rt.headStep,
        skullView: rt.skullView,
        legacyKeys: rt.keys,
      },
    );
    return serializeRigPayload(payload);
  }, []);

  const syncUi = useCallback(() => {
    if (!jsonEditingRef.current && !benchmarkMsgRef.current) {
      const live = buildJsonString();
      if (live) setJsonText(live);
    }
    setUiTick((t) => t + 1);
  }, [buildJsonString]);

  const persistPanels = useCallback((next: Record<PanelId, PanelLayoutState>) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
  }, []);

  const updatePanels = useCallback(
    (updater: (prev: Record<PanelId, PanelLayoutState>) => Record<PanelId, PanelLayoutState>) => {
      setPanels((prev) => {
        const next = updater(prev);
        persistPanels(next);
        return next;
      });
    },
    [persistPanels],
  );

  const buildIkOverlay = useCallback((): IKOverlayState => {
    const cfg = ikConfigRef.current;
    const ov = ikOverlayRef.current;
    return {
      active: cfg.mode !== 'fk',
      mode: cfg.mode,
      solver: cfg.solver,
      pins: ikPinsRef.current,
      groundY: cfg.groundY,
      footGravity: cfg.footGravity,
      activeChainIds: ov.activeChainIds,
      targetPos: ov.targetPos,
      holdProgress: ov.holdProgress,
      holdPos: ov.holdPos,
      elasticTethers: ov.elasticTethers,
    };
  }, []);

  const buildAbcGhosts = useCallback((): AbcGhostItem[] => {
    const abc = abcRef.current;
    if (!abc.ghostVisible) return [];
    const nextSlot = nextAbcSlot(abc.poses, abc.activeSlot, abc.loopMode, abcLoopDirRef.current);
    const slots = ABC_SLOTS.filter((s) => s !== abc.activeSlot && abc.poses[s]);
    if (!slots.length) return [];
    slots.sort((a, b) => (a === nextSlot ? 1 : b === nextSlot ? -1 : 0));
    return slots.map((s) => ({
      slot: s,
      pose: abc.poses[s]!,
      isPrimary: s === nextSlot || slots.length === 1,
      opacity: abc.ghostOpacity,
    }));
  }, []);

  const loopTick = useCallback(
    (ts: number) => {
      const rt = rtRef.current;
      const cv = canvasRef.current;
      if (!rt || !cv) return;
      rt.raf = 0;

      const wake = () => {
        rt.actUntil = performance.now() + 1500;
        rt.dirty = true;
        if (!rt.raf) rt.raf = requestAnimationFrame(loopTick);
      };

      const wingDiff = rt.wingTarget - rt.wingPop;
      if (Math.abs(wingDiff) > 0.002 || Math.abs(rt.wingVel) > 0.002) {
        rt.wingVel = rt.wingVel * 0.72 + wingDiff * 0.26;
        rt.wingPop = Math.max(0, Math.min(1.22, rt.wingPop + rt.wingVel));
        if (Math.abs(rt.wingTarget - rt.wingPop) <= 0.002 && Math.abs(rt.wingVel) <= 0.002) {
          rt.wingPop = rt.wingTarget;
          rt.wingVel = 0;
        }
        sortPiecesForWings(rt.pieces, rt.wingPop > 0.35);
        rt.dirty = true;
      }

      const spring = snapSpringRef.current;
      if (spring) {
        const st = Math.min(1, Math.max(0, (ts - spring.t0) / spring.dur));
        const elasticCfg = {
          ...DEFAULT_MOTION_SETTINGS,
          bounce: 0.72,
          damping: 0.45,
          stagger: 0.24,
          anticipation: 0.08,
        };
        rt.nodes.forEach((n, ni) => {
          const a = spring.fromAngles[n.id] ?? n.ang;
          const b = spring.toAngles[n.id] ?? a;
          const da = normalizeDeg(b - a);
          if (Math.abs(da) < 0.01 && st < 1) return;
          const sample = evalMotionScalar(st, 'elastic', elasticCfg, getAbcNodeLag(n.id), ni);
          const next = clampAnatomicalAngle(n, a + da * (sample.inAnticipation ? sample.antPull : sample.s), rt.constrainLimits);
          n.ang = clampRealisticShoulder(n, next, rt.by, rt.prometheusWings);
        });
        rt.dirty = true;
        rt.actUntil = Math.max(rt.actUntil, performance.now() + 450);
        if (st >= 1) {
          snapSpringRef.current = null;
        }
        syncUi();
      }

      let anim = abcAnimRef.current;
      if (anim && partMgrRef.current) {
        const abc = abcRef.current;
        const isFlow = abc.feel === 'flow';
        let elapsed = Math.max(0, ts - anim.t0);
        let t = Math.min(1, elapsed / anim.dur);

        // Pure flow: constant-interval phase-locked continuous loop with zero ease and zero pause between poses
        if (isFlow && anim.isLoop && abcPlayingRef.current && t >= 1) {
          while (t >= 1) {
            const curToSlot: AbcSlot = anim.toSlot;
            const nxt = nextAbcSlot(abc.poses, curToSlot, abc.loopMode, abcLoopDirRef.current, (d) => {
              abcLoopDirRef.current = d;
            });
            if (!nxt || !abc.poses[nxt]) break;
            const fpsPeriod = 1000 / Math.max(1, abc.fps);
            const totalF = Math.max(1, abc.snapFrames);
            const dur = Math.max(16, totalF * fpsPeriod);
            const carryT0: number = anim.t0 + anim.dur;
            const nextFromPose: AbcPoseRecord = anim.toPose;
            abc.activeSlot = nxt;
            anim = {
              fromPose: nextFromPose,
              toPose: abc.poses[nxt]!,
              toSlot: nxt,
              t0: carryT0,
              dur,
              totalF,
              fpsPeriod,
              lastIdx: -1,
              isLoop: true,
            };
            abcAnimRef.current = anim;
            elapsed = Math.max(0, ts - carryT0);
            t = Math.min(1, elapsed / dur);
          }
        }

        let skipStep = false;
        if (abc.steppedFps && !isFlow && t < 1) {
          const idx = Math.min(anim.totalF, Math.floor(elapsed / anim.fpsPeriod));
          if (idx === anim.lastIdx) {
            skipStep = true;
          } else {
            anim.lastIdx = idx;
            t = Math.min(1, idx / Math.max(1, anim.totalF));
          }
        }
        if (!skipStep) {
          applyAbcTweenPose(
            anim.fromPose,
            anim.toPose,
            t,
            abc.feel,
            abc.settings,
            rt.nodes,
            rt.root,
            partMgrRef.current.inst,
            (I) => partMgrRef.current?.rebake(I, wake),
            rt.constrainLimits,
            rt.by,
            rt.prometheusWings,
            {
              skullTurnTiming: abc.skullTurnTiming ?? 'halfway',
              onHeadTurn: (step, spec) => {
                rt.headStep = step;
                rt.skullView = spec.view;
              },
              onWake: wake,
            },
          );
          rt.dirty = true;
          rt.actUntil = Math.max(rt.actUntil, performance.now() + 450);
          syncUi();
        }
        if (t >= 1 && !(isFlow && anim.isLoop && abcPlayingRef.current)) {
          const done = anim.onDone;
          abcAnimRef.current = null;
          abc.activeSlot = anim.toSlot;
          syncUi();
          done?.();
        }
      }

      const live =
        rt.mode === 'A' &&
        rt.showBones &&
        (!!dragRef.current || !!abcAnimRef.current || !!snapSpringRef.current || rt.playing || performance.now() < rt.actUntil);
      if (live) rt.dirty = true;

      if (rt.dirty) {
        rt.dirty = false;
        const startMs = performance.now();
        try {
          partMgrRef.current?.syncLinks(rt.by, wake);
          solveRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, rt.ribAnchor);
          const ctx = cv.getContext('2d', { alpha: false });
          if (ctx) {
            rendererRef.current.render({
              cv,
              ctx,
              nodes: rt.nodes,
              by: rt.by,
              pieces: rt.pieces,
              sel: rt.sel,
              hov: rt.hov,
              W: rt.W,
              H: rt.H,
              z: rt.z,
              ox: rt.ox,
              oy: rt.oy,
              dpr: rt.dpr,
              mode: rt.mode,
              showBones: rt.showBones,
              showGuides: rt.showGuides,
              constrainLimits: rt.constrainLimits,
              bondOn: rt.bondOn,
              isActiveMotion: !!dragRef.current || !!abcAnimRef.current || rt.playing,
              actUntil: rt.actUntil,
              bgColor: '#121315',
              wingPop: rt.wingPop,
              abcGhosts: buildAbcGhosts(),
              ikOverlay: buildIkOverlay(),
              handRGotz: partMgrRef.current?.inst.handR?.gotz,
              handLGotz: partMgrRef.current?.inst.handL?.gotz,
              handRProps: partMgrRef.current?.inst.handR?.propsModel,
              handLProps: partMgrRef.current?.inst.handL?.propsModel,
              persp: perspRef.current,
              hoverPersp: hoverPerspRef.current,
              draggingPersp: dragRef.current?.t === 'persp' ? dragRef.current.what : null,
              hidePerspLabels: true,
              hideBackdropText: backdropDismissedRef.current,
              backdropWelcome: 'Welcome Bitruvius.',
              backdropHint:
                'Drag hands, feet, knees, or spine for FABRIK IK (Alt = pure FK) · 2× click head, hand, foot or wing · 2× right-click copies JSON',
              safeRightPx: safeInsetRef.current.right,
              safeBottomPx: safeInsetRef.current.bottom,
            });
          }
        } catch (err) {
          setHudText(`render error: ${err instanceof Error ? err.message : String(err)}`);
        }
        const elapsed = performance.now() - startMs;
        rt.ema = rt.ema ? rt.ema * 0.9 + elapsed * 0.1 : elapsed;
        if (ts - rt.hudT > 220) {
          rt.hudT = ts;
          setHudText(
            `${rt.ema.toFixed(2)} ms/frame · ${rendererRef.current.drawn} drawn · ${rendererRef.current.culled} culled · ${rt.nodes.length} bones · idle=0 CPU`,
          );
        }
      }

      if (
        !!abcAnimRef.current ||
        !!snapSpringRef.current ||
        rt.playing ||
        rt.dirty ||
        live ||
        Math.abs(rt.wingTarget - rt.wingPop) > 0.002 ||
        Math.abs(rt.wingVel) > 0.002
      ) {
        rt.raf = requestAnimationFrame(loopTick);
      } else {
        setHudText(`${rt.ema.toFixed(2)} ms last frame · idle (0 CPU)`);
      }
    },
    [buildAbcGhosts, buildIkOverlay, syncUi],
  );

  const wake = useCallback(() => {
    const rt = rtRef.current;
    if (!rt) return;
    rt.actUntil = performance.now() + 1500;
    rt.dirty = true;
    if (!rt.raf) {
      rt.raf = requestAnimationFrame(loopTick);
    }
  }, [loopTick]);

  const repaint = useCallback(() => {
    const rt = rtRef.current;
    if (!rt) return;
    rt.dirty = true;
    if (!rt.raf) {
      rt.raf = requestAnimationFrame(loopTick);
    }
  }, [loopTick]);

  const measureSafeInset = useCallback(() => {
    const stageEl = stageRef.current;
    const asideEl = asideRef.current;
    let next = { right: 0, bottom: 0 };
    if (stageEl && asideEl) {
      const sr = stageEl.getBoundingClientRect();
      const ar = asideEl.getBoundingClientRect();
      if (ar.width > 0 && ar.height > 0 && sr.width > 0 && sr.height > 0) {
        if (ar.width < sr.width * 0.65) {
          next = { right: Math.max(0, Math.round(sr.right - ar.left)), bottom: 0 };
        } else {
          next = { right: 0, bottom: Math.max(0, Math.round(sr.bottom - ar.top)) };
        }
      }
    }
    safeInsetRef.current = next;
    setSafeHudInset((prev) => (prev.right === next.right && prev.bottom === next.bottom ? prev : next));
    return next;
  }, []);

  const clampRtCamera = useCallback(() => {
    const rt = rtRef.current;
    const cv = canvasRef.current;
    if (!rt || !cv || cv.width <= 0 || cv.height <= 0) return;
    solveRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, rt.ribAnchor);
    const bounds = computeRigWorldBounds(rt.by, rt.pieces, rt.wingPop);
    const inset = safeInsetRef.current;
    const clamped = clampCameraToKeepBodyVisible(
      { z: rt.z, ox: rt.ox, oy: rt.oy },
      bounds,
      cv.width,
      cv.height,
      rt.dpr,
      {
        right: inset.right * rt.dpr,
        bottom: inset.bottom * rt.dpr,
      },
    );
    rt.z = clamped.z;
    rt.ox = clamped.ox;
    rt.oy = clamped.oy;
  }, []);

  const syncPerspectiveSpine = useCallback(() => {
    const rt = rtRef.current;
    if (!rt) return;
    perspSpineBiasRef.current = applyPerspectiveSpineDelta(
      rt.by,
      rt.root,
      perspRef.current,
      perspSpineBiasRef.current,
      rt.constrainLimits,
    );
  }, []);

  const fitCanvas = useCallback(() => {
    const rt = rtRef.current;
    const cv = canvasRef.current;
    if (!rt || !cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    rt.dpr = dpr;
    cv.width = Math.max(1, Math.round(cv.clientWidth * dpr));
    cv.height = Math.max(1, Math.round(cv.clientHeight * dpr));
    const inset = measureSafeInset();
    if (!rt.userView) {
      solveRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, rt.ribAnchor);
      const f = computeModelFrame(rt.by, rt.pieces, rt.W, rt.H, cv.width, cv.height, dpr, rt.wingPop, {
        right: inset.right * dpr,
        bottom: inset.bottom * dpr,
      });
      rt.z = f.z;
      rt.ox = f.ox;
      rt.oy = f.oy;
    }
    clampRtCamera();
    wake();
  }, [clampRtCamera, measureSafeInset, wake]);

  const loadRigDefinition = useCallback(
    (def: RawRigDef, withDigitsAndJoints: boolean) => {
      const graph = buildRigGraph(def, withDigitsAndJoints);
      const prev = rtRef.current;
      const rt: RigRuntime = {
        W: graph.W,
        H: graph.H,
        nodes: graph.nodes,
        by: graph.by,
        root: graph.root,
        pieces: graph.pieces,
        sel: graph.root,
        hov: null,
        z: 1,
        ox: 0,
        oy: 0,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
        userView: false,
        mode: prev?.mode ?? 'A',
        showBones: prev?.showBones ?? true,
        showGuides: prev?.showGuides ?? false,
        bondOn: true,
        constrainLimits: prev?.constrainLimits ?? false,
        prometheusWings: false,
        ribAnchor: 'upper',
        skullView: 'front',
        headStep: 0,
        wingPop: 0,
        wingVel: 0,
        wingTarget: 0,
        dirty: true,
        raf: prev?.raf ?? 0,
        actUntil: performance.now() + 1500,
        playing: false,
        loop: prev?.loop ?? true,
        fps: prev?.fps ?? 24,
        frame: 0,
        t0: 0,
        keys: [],
        canonicalKeys: [],
        ema: 0,
        hudT: 0,
      };
      rtRef.current = rt;

      graph.pieces.forEach((p) => {
        if (
          p.src &&
          !p.gotzManaged &&
          !(withDigitsAndJoints && (p.name === 'Handkit' || p.node?.id === 'head'))
        ) {
          decImage(p.src)
            .then((bm) => setPieceBitmap(p, bm as CanvasImageSource & { width: number; height: number }, wake))
            .catch((er) => setHudText(`image decode failed: ${er.message}`));
        }
      });

      if (withDigitsAndJoints && partMgrRef.current) {
        partMgrRef.current.initAll(rt.by, wake);
      }

      ikPinsRef.current = syncPinsFromRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, {});
      fitCanvas();
      syncUi();
    },
    [fitCanvas, syncUi, wake],
  );

  // Initial fetch of ClaudeBase rig & part sprite assets
  useEffect(() => {
    let cancelled = false;
    fetch('/rig-data.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ rig: RawRigDef; parts: PartsManifest }>;
      })
      .then((data) => {
        if (cancelled) return;
        rawBaseRigRef.current = data.rig;
        partMgrRef.current = new PartRigManager(data.parts);
        setLoading(false);
        loadRigDefinition(data.rig, true);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load rig data');
        setLoading(false);
      });

    return () => {
      cancelled = true;
      if (rtRef.current?.raf) cancelAnimationFrame(rtRef.current.raf);
    };
  }, [loadRigDefinition]);

  // Resize observer on stage
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let lw = 0;
    let lh = 0;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w === lw && h === lh) return;
      lw = w;
      lh = h;
      fitCanvas();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitCanvas]);

  // Re-frame safely (without squeezing canvas) when docked panels open, close, or resize
  const dockedPanelKey = (['pose', 'bones', 'ik', 'tl', 'library', 'data', 'roadmap', 'about'] as PanelId[])
    .filter((id) => panels[id].open && !panels[id].floating)
    .join(',');

  useEffect(() => {
    fitCanvas();
    const el = asideRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => fitCanvas());
    ro.observe(el);
    return () => ro.disconnect();
  }, [dockedPanelKey, fitCanvas]);

  // Re-frame cleanly when split popup opens, closes, or room sliders move
  useEffect(() => {
    const id = requestAnimationFrame(() => fitCanvas());
    return () => cancelAnimationFrame(id);
  }, [activePart, modelSplitPct, partHeightPct, fitCanvas]);

  const targetNode = (rt: RigRuntime | null): RigNode | null => {
    if (!rt) return null;
    return rt.sel.lock && rt.sel.parent ? rt.by[rt.sel.parent] : rt.sel;
  };

  const toWorld = (e: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>): [number, number] => {
    const cv = canvasRef.current!;
    const rt = rtRef.current!;
    const r = cv.getBoundingClientRect();
    const d = cv.width / r.width;
    return [((e.clientX - r.left) * d - rt.ox) / rt.z, ((e.clientY - r.top) * d - rt.oy) / rt.z];
  };

  const downloadBlob = (name: string, blob: Blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 999);
  };

  const handleExportPng = useCallback(() => {
    const rt = rtRef.current;
    const cv = canvasRef.current;
    if (!rt || !cv) return;
    solveRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, rt.ribAnchor);
    const ctx = cv.getContext('2d', { alpha: false });
    if (ctx) {
      rendererRef.current.render({
        cv,
        ctx,
        nodes: rt.nodes,
        by: rt.by,
        pieces: rt.pieces,
        sel: rt.sel,
        hov: null,
        W: rt.W,
        H: rt.H,
        z: rt.z,
        ox: rt.ox,
        oy: rt.oy,
        dpr: rt.dpr,
        mode: rt.mode,
        showBones: rt.showBones,
        showGuides: rt.showGuides,
        constrainLimits: rt.constrainLimits,
        bondOn: rt.bondOn,
        isActiveMotion: false,
        actUntil: 0,
        bgColor: '#121315',
        wingPop: rt.wingPop,
        handRGotz: partMgrRef.current?.inst.handR?.gotz,
        handLGotz: partMgrRef.current?.inst.handL?.gotz,
        handRProps: partMgrRef.current?.inst.handR?.propsModel,
        handLProps: partMgrRef.current?.inst.handL?.propsModel,
        persp: perspRef.current,
        hidePerspLabels: true,
        hideBackdropText: true,
      });
    }
    cv.toBlob((b) => {
      if (b) downloadBlob('bitruvius-pose.png', b);
    });
  }, []);

  const copyRawJson = useCallback(async () => {
    const s = buildJsonString();
    if (!s) return;
    benchmarkMsgRef.current = false;
    setJsonText(s);
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(s);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = s;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    window.clearTimeout(copyToastTimerRef.current);
    setCopyToast(ok ? 'Raw JSON copied to clipboard' : 'Raw JSON ready in box');
    copyToastTimerRef.current = window.setTimeout(() => setCopyToast(null), 2200);
  }, [buildJsonString]);

  const applyJsonInput = useCallback(
    (rawStr: string) => {
      const rt = rtRef.current;
      const mgr = partMgrRef.current;
      if (!rt || !mgr) return;
      try {
        const payload = parseAndValidateRigPayload(rawStr);
        const parsed = payloadToPoseSnapshot(payload);
        const loadedKeys = applyPoseSnapshot(parsed, rt.nodes, rt.root, mgr.inst, (I) => mgr.rebake(I, wake));
        if (loadedKeys) rt.keys = loadedKeys;
        rt.canonicalKeys = payload.keys;
        if (parsed.abc) {
          const base = createDefaultAbcState();
          const rawSlot = parsed.abc.activeSlot;
          abcRef.current = {
            ...base,
            ...parsed.abc,
            activeSlot: rawSlot === 'B' || rawSlot === 'C' ? rawSlot : 'A',
            skullTurnTiming: parsed.abc.skullTurnTiming === 'nextLetter' ? 'nextLetter' : 'halfway',
            poses: {
              A: parsed.abc.poses?.A ?? null,
              B: parsed.abc.poses?.B ?? null,
              C: parsed.abc.poses?.C ?? null,
            },
            settings: { ...base.settings, ...(parsed.abc.settings ?? {}) },
          };
        }
        const nextRibAnchor: RibAnchorMode = payload.ribAnchor ?? 'upper';
        rt.ribAnchor = nextRibAnchor;
        if (typeof parsed.prometheusWings === 'boolean') {
          rt.prometheusWings = parsed.prometheusWings;
          rt.wingTarget = parsed.prometheusWings ? 1 : 0;
          rt.wingPop = rt.wingTarget;
          rt.wingVel = 0;
          sortPiecesForWings(rt.pieces, rt.prometheusWings);
        } else {
          rt.prometheusWings = false;
          rt.wingTarget = 0;
          rt.wingPop = 0;
          rt.wingVel = 0;
          sortPiecesForWings(rt.pieces, false);
        }
        applyRibAnchorMode(rt.by, nextRibAnchor, rt.prometheusWings);
        if (nextRibAnchor === 'lower') {
          solveRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, nextRibAnchor);
          applyChungusChestCavity(rt.by, rt.prometheusWings, rt.prometheusWings);
        }
        if (!rt.prometheusWings) {
          rt.nodes.forEach((n) => {
            n.ang = clampRealisticShoulder(n, n.ang, rt.by, false);
          });
        }
        sidePoseRef.current = null;
        snapSpringRef.current = null;
        benchmarkMsgRef.current = false;
        jsonEditingRef.current = false;
        if (rt.by.head && (parsed.headStep !== undefined || parsed.skullView !== undefined)) {
          const loadedStep = resolvePoseHeadTurnStep({
            headStep: parsed.headStep,
            skullView: parsed.skullView,
            flipX: parsed.flipX,
          });
          const spec = applyHeadTurnStep(rt.by.head, loadedStep, wake);
          rt.headStep = loadedStep;
          rt.skullView = spec.view;
        } else {
          rt.headStep = getHeadTurnStep(rt.skullView, !!rt.by.head?.flipX);
        }
        ikPinsRef.current = syncPinsFromRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, ikPinsRef.current);
        syncUi();
        wake();
      } catch {
        setCopyToast('Invalid JSON');
        window.clearTimeout(copyToastTimerRef.current);
        copyToastTimerRef.current = window.setTimeout(() => setCopyToast(null), 2200);
      }
    },
    [syncUi, wake],
  );

  const handleExportJson = useCallback(() => {
    const s = buildJsonString();
    benchmarkMsgRef.current = false;
    setJsonText(s);
    downloadBlob('bitruvius-pose.json', new Blob([s], { type: 'application/json' }));
  }, [buildJsonString]);

  const stopAbcLoop = useCallback(() => {
    abcPlayingRef.current = false;
    setAbcPlaying(false);
    abcAnimRef.current = null;
    if (abcPlayTimerRef.current) {
      window.clearTimeout(abcPlayTimerRef.current);
      abcPlayTimerRef.current = 0;
    }
  }, []);

  const animateAbcToSlot = useCallback(
    (slot: AbcSlot, onDone?: () => void, isLoop = false) => {
      const rt = rtRef.current;
      const mgr = partMgrRef.current;
      const target = abcRef.current.poses[slot];
      if (!rt || !mgr || !target) return;

      snapSpringRef.current = null;
      const fromPose = captureAbcPose(rt.nodes, rt.root, mgr.inst, {
        headStep: rt.headStep,
        skullView: rt.skullView,
      });
      if (resolvePoseHeadTurnStep(fromPose) !== 0 || resolvePoseHeadTurnStep(target) !== 0) {
        preloadSkullAssets();
      }
      const abc = abcRef.current;
      const fpsPeriod = 1000 / Math.max(1, abc.fps);
      const totalF = Math.max(1, abc.snapFrames);
      const dur = Math.max(16, totalF * fpsPeriod);

      abc.activeSlot = slot;
      abcAnimRef.current = {
        fromPose,
        toPose: target,
        toSlot: slot,
        t0: performance.now(),
        dur,
        totalF,
        fpsPeriod,
        lastIdx: -1,
        isLoop,
        onDone,
      };
      syncUi();
      wake();
    },
    [syncUi, wake],
  );

  const handleCaptureAbcSlot = useCallback(
    (slot: AbcSlot) => {
      const rt = rtRef.current;
      const mgr = partMgrRef.current;
      if (!rt || !mgr) return;
      stopAbcLoop();
      abcRef.current.poses[slot] = captureAbcPose(rt.nodes, rt.root, mgr.inst, {
        headStep: rt.headStep,
        skullView: rt.skullView,
      });
      abcRef.current.activeSlot = slot;
      syncUi();
      wake();
      window.clearTimeout(copyToastTimerRef.current);
      setCopyToast(`Captured Keyframe ${slot}`);
      copyToastTimerRef.current = window.setTimeout(() => setCopyToast(null), 1600);
    },
    [stopAbcLoop, syncUi, wake],
  );

  const handleGenerateProceduralAbcB = useCallback(() => {
    const rt = rtRef.current;
    const mgr = partMgrRef.current;
    if (!rt || !mgr) return;
    const poseA = abcRef.current.poses.A;
    const poseC = abcRef.current.poses.C;
    if (!poseA || !poseC || abcRef.current.poses.B) return;

    stopAbcLoop();
    const generated = synthesizeProceduralInBetween(
      poseA,
      poseC,
      rt.nodes,
      rt.root,
      mgr.inst,
      (I) => mgr.rebake(I, wake),
      {
        by: rt.by,
        bondOn: rt.bondOn,
        wingPop: rt.wingPop,
        ribAnchor: rt.ribAnchor,
        constrainLimits: rt.constrainLimits,
        prometheusWings: rt.prometheusWings,
        groundY: ikConfigRef.current.groundY,
        footGravity: ikConfigRef.current.footGravity,
      },
    );
    abcRef.current.poses.B = generated;
    abcRef.current.activeSlot = 'B';
    const nextStep = resolvePoseHeadTurnStep(generated);
    rt.headStep = nextStep;
    rt.skullView = HEAD_TURN_SEQUENCE[nextStep].view;
    sidePoseRef.current = null;
    snapSpringRef.current = null;
    ikPinsRef.current = syncPinsFromRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, ikPinsRef.current);
    clampRtCamera();
    syncUi();
    wake();
    window.clearTimeout(copyToastTimerRef.current);
    setCopyToast('Procedural In-Between A↔C → B');
    copyToastTimerRef.current = window.setTimeout(() => setCopyToast(null), 1900);
  }, [clampRtCamera, stopAbcLoop, syncUi, wake]);

  const persistPoseLibrary = useCallback((next: SavedPoseEntry[]) => {
    try {
      localStorage.setItem(POSE_LIBRARY_KEY, JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
  }, []);

  const updateSavedPoses = useCallback(
    (updater: (prev: SavedPoseEntry[]) => SavedPoseEntry[]) => {
      setSavedPoses((prev) => {
        const next = updater(prev);
        persistPoseLibrary(next);
        return next;
      });
    },
    [persistPoseLibrary],
  );

  const handleSavePoseToLibrary = useCallback(
    (rawName?: string) => {
      const rt = rtRef.current;
      const mgr = partMgrRef.current;
      if (!rt || !mgr) return;
      const now = Date.now();
      const pose = captureAbcPose(rt.nodes, rt.root, mgr.inst, {
        headStep: rt.headStep,
        skullView: rt.skullView,
      });
      const savedName = rawName?.trim() || `Pose ${savedPoses.length + 1}`;
      const entry: SavedPoseEntry = {
        id: `pose_${now}_${Math.random().toString(36).slice(2, 7)}`,
        name: savedName,
        createdAt: now,
        updatedAt: now,
        prometheusWings: rt.prometheusWings,
        pose,
      };
      updateSavedPoses((prev) => [entry, ...prev]);
      window.clearTimeout(copyToastTimerRef.current);
      setCopyToast(`Saved "${savedName}" to Library`);
      copyToastTimerRef.current = window.setTimeout(() => setCopyToast(null), 1800);
    },
    [savedPoses.length, updateSavedPoses],
  );

  const handleApplyLibraryPose = useCallback(
    (entry: SavedPoseEntry) => {
      const rt = rtRef.current;
      const mgr = partMgrRef.current;
      if (!rt || !mgr) return;
      stopAbcLoop();
      applyAbcPoseInstant(
        entry.pose,
        rt.nodes,
        rt.root,
        mgr.inst,
        (I) => mgr.rebake(I, wake),
        (step, spec) => {
          rt.headStep = step;
          rt.skullView = spec.view;
        },
        wake,
      );
      const wingsOn = !!entry.prometheusWings;
      rt.prometheusWings = wingsOn;
      rt.wingTarget = wingsOn ? 1 : 0;
      rt.wingPop = rt.wingTarget;
      rt.wingVel = 0;
      rt.ribAnchor = 'upper';
      applyRibAnchorMode(rt.by, 'upper', wingsOn);
      sortPiecesForWings(rt.pieces, wingsOn);
      if (!wingsOn) {
        rt.nodes.forEach((n) => {
          n.ang = clampRealisticShoulder(n, n.ang, rt.by, false);
        });
      }
      sidePoseRef.current = null;
      snapSpringRef.current = null;
      ikPinsRef.current = syncPinsFromRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, ikPinsRef.current);
      clampRtCamera();
      syncUi();
      wake();
      window.clearTimeout(copyToastTimerRef.current);
      setCopyToast(`Applied "${entry.name}"`);
      copyToastTimerRef.current = window.setTimeout(() => setCopyToast(null), 1500);
    },
    [clampRtCamera, stopAbcLoop, syncUi, wake],
  );

  const handleLoadLibraryPoseToSlot = useCallback(
    (entry: SavedPoseEntry, slot: AbcSlot) => {
      const rt = rtRef.current;
      const mgr = partMgrRef.current;
      if (!rt || !mgr) return;
      stopAbcLoop();
      abcRef.current.poses[slot] = JSON.parse(JSON.stringify(entry.pose)) as AbcPoseRecord;
      abcRef.current.activeSlot = slot;
      applyAbcPoseInstant(
        entry.pose,
        rt.nodes,
        rt.root,
        mgr.inst,
        (I) => mgr.rebake(I, wake),
        (step, spec) => {
          rt.headStep = step;
          rt.skullView = spec.view;
        },
        wake,
      );
      const wingsOn = !!entry.prometheusWings;
      rt.prometheusWings = wingsOn;
      rt.wingTarget = wingsOn ? 1 : 0;
      rt.wingPop = rt.wingTarget;
      rt.wingVel = 0;
      rt.ribAnchor = 'upper';
      applyRibAnchorMode(rt.by, 'upper', wingsOn);
      sortPiecesForWings(rt.pieces, wingsOn);
      if (!wingsOn) {
        rt.nodes.forEach((n) => {
          n.ang = clampRealisticShoulder(n, n.ang, rt.by, false);
        });
      }
      sidePoseRef.current = null;
      snapSpringRef.current = null;
      clampRtCamera();
      syncUi();
      wake();
      window.clearTimeout(copyToastTimerRef.current);
      setCopyToast(`"${entry.name}" → Keyframe ${slot}`);
      copyToastTimerRef.current = window.setTimeout(() => setCopyToast(null), 1700);
    },
    [stopAbcLoop, syncUi, wake],
  );

  const handleOverwriteLibraryPose = useCallback(
    (id: string) => {
      const rt = rtRef.current;
      const mgr = partMgrRef.current;
      if (!rt || !mgr) return;
      const pose = captureAbcPose(rt.nodes, rt.root, mgr.inst, {
        headStep: rt.headStep,
        skullView: rt.skullView,
      });
      const now = Date.now();
      const target = savedPoses.find((item) => item.id === id);
      updateSavedPoses((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                updatedAt: now,
                prometheusWings: rt.prometheusWings,
                pose,
              }
            : item,
        ),
      );
      window.clearTimeout(copyToastTimerRef.current);
      setCopyToast(`Updated "${target?.name ?? 'Pose'}"`);
      copyToastTimerRef.current = window.setTimeout(() => setCopyToast(null), 1600);
    },
    [savedPoses, updateSavedPoses],
  );

  const handleRenameLibraryPose = useCallback(
    (id: string, name: string) => {
      updateSavedPoses((prev) =>
        prev.map((item) => (item.id === id ? { ...item, name, updatedAt: Date.now() } : item)),
      );
    },
    [updateSavedPoses],
  );

  const handleDeleteLibraryPose = useCallback(
    (id: string) => {
      updateSavedPoses((prev) => prev.filter((item) => item.id !== id));
    },
    [updateSavedPoses],
  );

  const handleJumpAbcSlot = useCallback(
    (slot: AbcSlot) => {
      stopAbcLoop();
      animateAbcToSlot(slot);
    },
    [animateAbcToSlot, stopAbcLoop],
  );

  const handleStepAbc = useCallback(() => {
    stopAbcLoop();
    const abc = abcRef.current;
    const nxt = nextAbcSlot(abc.poses, abc.activeSlot, abc.loopMode, abcLoopDirRef.current, (d) => {
      abcLoopDirRef.current = d;
    });
    if (nxt) animateAbcToSlot(nxt);
  }, [animateAbcToSlot, stopAbcLoop]);

  const handleToggleAbcLoop = useCallback(() => {
    const abc = abcRef.current;
    if (abcPlayingRef.current) {
      stopAbcLoop();
      syncUi();
      return;
    }
    const filled = getFilledAbcSlots(abc.poses);
    if (filled.length < 2) return;
    stopAbcLoop();
    abcPlayingRef.current = true;
    setAbcPlaying(true);

    const playNext = () => {
      if (!abcPlayingRef.current) return;
      const curAbc = abcRef.current;
      const nxt = nextAbcSlot(curAbc.poses, curAbc.activeSlot, curAbc.loopMode, abcLoopDirRef.current, (d) => {
        abcLoopDirRef.current = d;
      });
      if (!nxt) {
        stopAbcLoop();
        syncUi();
        return;
      }
      animateAbcToSlot(
        nxt,
        () => {
          if (!abcPlayingRef.current) return;
          if (abcRef.current.feel === 'flow') {
            playNext();
          } else {
            const holdMs = Math.max(25, Math.round((1000 / Math.max(1, abcRef.current.fps)) * 2));
            abcPlayTimerRef.current = window.setTimeout(playNext, holdMs);
          }
        },
        true,
      );
    };
    playNext();
  }, [animateAbcToSlot, stopAbcLoop, syncUi]);

  const handleScrubAbcCycle = useCallback(
    (progress: number) => {
      const rt = rtRef.current;
      const mgr = partMgrRef.current;
      if (!rt || !mgr) return;
      stopAbcLoop();
      const abc = abcRef.current;
      const segments = getAbcCycleSequence(abc.poses, abc.loopMode);
      if (!segments.length) return;
      const clamped = Math.max(0, Math.min(1, progress));
      abcScrubRef.current = clamped;

      const scaled = clamped * segments.length;
      const segIdx = Math.min(segments.length - 1, Math.floor(scaled));
      const localT = clamped >= 1 ? 1 : scaled - segIdx;
      const [fromSlot, toSlot] = segments[segIdx];
      const fromPose = abc.poses[fromSlot];
      const toPose = abc.poses[toSlot];
      if (!fromPose || !toPose) return;

      abc.activeSlot = localT < 0.5 ? fromSlot : toSlot;
      applyAbcTweenPose(
        fromPose,
        toPose,
        localT,
        abc.feel,
        abc.settings,
        rt.nodes,
        rt.root,
        mgr.inst,
        (I) => mgr.rebake(I, wake),
        rt.constrainLimits,
        rt.by,
        rt.prometheusWings,
        {
          skullTurnTiming: abc.skullTurnTiming ?? 'halfway',
          onHeadTurn: (step, spec) => {
            rt.headStep = step;
            rt.skullView = spec.view;
          },
          onWake: wake,
        },
      );
      syncUi();
      wake();
    },
    [stopAbcLoop, syncUi, wake],
  );

  // Keyboard shortcuts matching ClaudeBase + ABC capture/loop + Shift tap Ribwings
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        if (!e.repeat) {
          shiftTapRef.current = { down: true, used: false };
        }
        return;
      }
      if (shiftTapRef.current.down) {
        shiftTapRef.current.used = true;
      }
      if (e.key === 'Escape') {
        setActivePart(null);
        return;
      }
      const tag = (e.target as HTMLElement | null)?.tagName || '';
      if (/TEXTAREA|INPUT|SELECT/.test(tag)) return;
      const rt = rtRef.current;
      if (!rt) return;
      const tgt = targetNode(rt);
      if (!tgt) return;
      const step = e.shiftKey ? 5 : 1;

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (tgt.id === 'lip' || tgt.id === 'chinTip') {
          if (rt.by.lip) rt.by.lip.ang = 0;
          stepHeadTurn(e.key === 'ArrowRight' ? 1 : -1);
          return;
        }
        const nextDeg = e.key === 'ArrowLeft' ? tgt.ang - step : tgt.ang + step;
        tgt.ang = clampAnatomicalAngle(
          tgt,
          clampChungusRibAngle(
            tgt.id,
            clampRealisticShoulder(tgt, nextDeg, rt.by, rt.prometheusWings),
            rt.ribAnchor,
            rt.by,
            rt.prometheusWings,
          ),
          rt.constrainLimits,
        );
        if (rt.ribAnchor === 'lower' && (tgt.id === 'ribR' || tgt.id === 'ribL')) {
          const oppRib = rt.by[tgt.id === 'ribR' ? 'ribL' : 'ribR'];
          if (oppRib) {
            oppRib.ang = clampChungusRibAngle(oppRib.id, -tgt.ang, 'lower', rt.by, rt.prometheusWings);
          }
        }
      } else if (e.key === ' ') {
        e.preventDefault();
        handleToggleAbcLoop();
        return;
      } else if (e.key === 'k' || e.key === 'K') {
        const abc = abcRef.current;
        const nextEmpty = ABC_SLOTS.find((s) => !abc.poses[s]);
        handleCaptureAbcSlot(nextEmpty ?? abc.activeSlot);
        return;
      } else if (e.key === 'f' || e.key === 'F') {
        rt.userView = false;
        fitCanvas();
        return;
      } else {
        return;
      }
      syncUi();
      wake();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && shiftTapRef.current.down) {
        const wasUsed = shiftTapRef.current.used;
        shiftTapRef.current = { down: false, used: false };
        if (wasUsed) return;
        const tag = (document.activeElement as HTMLElement | null)?.tagName || '';
        if (/TEXTAREA|INPUT|SELECT/.test(tag)) return;
        const rt = rtRef.current;
        if (!rt) return;
        const nextMode: RibAnchorMode = rt.ribAnchor === 'ribwings' ? 'upper' : 'ribwings';
        rt.ribAnchor = nextMode;
        applyRibAnchorMode(rt.by, nextMode, rt.prometheusWings);
        window.clearTimeout(copyToastTimerRef.current);
        setCopyToast(nextMode === 'ribwings' ? 'Rib anchor · Ribwings (Neck)' : 'Rib anchor · Upper Spine');
        copyToastTimerRef.current = window.setTimeout(() => setCopyToast(null), 1500);
        syncUi();
        wake();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [fitCanvas, handleCaptureAbcSlot, handleToggleAbcLoop, syncUi, wake]);

  const setHeadTurnStepExplicit = useCallback(
    (step: HeadTurnStep) => {
      const rt = rtRef.current;
      if (!rt || !rt.by.head) return;
      const norm = (((step % 4) + 4) % 4) as HeadTurnStep;
      const spec = HEAD_TURN_SEQUENCE[norm];
      rt.headStep = norm;
      rt.skullView = spec.view;
      anchorFigureOnPerspectiveShift(
        rt.nodes,
        rt.by,
        rt.root,
        rt.bondOn,
        rt.wingPop,
        ikConfigRef.current.groundY,
        () => {
          applyHeadTurnStep(rt.by.head, norm, wake);
          if (rt.by.lip) rt.by.lip.ang = 0;
        },
      );
      window.clearTimeout(copyToastTimerRef.current);
      setCopyToast(`Skull 360° · ${spec.label}`);
      copyToastTimerRef.current = window.setTimeout(() => setCopyToast(null), 1400);
      syncUi();
      wake();
    },
    [syncUi, wake],
  );

  const stepHeadTurn = useCallback(
    (dir: -1 | 1) => {
      const rt = rtRef.current;
      if (!rt) return;
      const next = (((rt.headStep + dir) % 4) + 4) % 4 as HeadTurnStep;
      setHeadTurnStepExplicit(next);
    },
    [setHeadTurnStepExplicit],
  );

  const openPartForNode = useCallback(
    (node: RigNode) => {
      const mgr = partMgrRef.current;
      if (!mgr) return;
      // Head steps cleanly through the 4 cardinal 360° skull poses
      if (node.id === 'head' || node.id === 'lip' || node.id === 'chinTip') {
        stepHeadTurn(1);
        return;
      }
      const mappedId =
        node.id.startsWith('thumb') || node.id.startsWith('finger')
          ? 'hand' + (node.id.endsWith('L') ? 'L' : 'R')
          : node.id.startsWith('toe')
          ? 'foot' + (node.id.endsWith('L') ? 'L' : 'R')
          : node.id;
      const I =
        mgr.inst[mappedId] ||
        mgr.inst[node.id] ||
        (node.parent ? mgr.inst[node.parent] : undefined);
      if (I && (I.key === 'hand' || I.key === 'foot')) {
        if (I.key === 'foot') {
          void mgr.loadPartAssets('foot').then(wake);
        }
        setActivePart(I);
      }
    },
    [stepHeadTurn, wake],
  );

  const isSwivelId = (id: string) =>
    id === 'swivelL' || id === 'swivelR' || id === 'swivelTipL' || id === 'swivelTipR';

  const triggerSidePoseSnap = useCallback(
    (targetSide: 'L' | 'R' | null) => {
      const rt = rtRef.current;
      if (!rt) return;

      const fromAngles: Record<string, number> = {};
      rt.nodes.forEach((n) => {
        fromAngles[n.id] = n.ang;
      });
      const toAngles: Record<string, number> = { ...fromAngles };

      if (targetSide === null) {
        sidePoseRef.current = null;
        for (const id of [
          'pelvis',
          'hipR',
          'hipL',
          'femurR',
          'femurL',
          'shinR',
          'shinL',
          'footR',
          'footL',
          'lumbar',
          'thorax',
          'ribR',
          'ribL',
          'neck',
          'head',
          'swivelR',
          'swivelL',
          'acromionR',
          'acromionL',
          'braceR',
          'braceL',
          'humerusR',
          'humerusL',
          'forearmR',
          'forearmL',
          'handR',
          'handL',
        ]) {
          if (rt.by[id]) toAngles[id] = 0;
        }
        if (rt.by.hipR) rt.by.hipR.flipX = false;
        if (rt.by.hipL) rt.by.hipL.flipX = false;
        if (rt.by.femurR) rt.by.femurR.flipX = false;
        if (rt.by.femurL) rt.by.femurL.flipX = false;
      } else {
        sidePoseRef.current = targetSide;
        const dir = targetSide === 'R' ? 1 : -1; // 'R' = facing viewer's right (+X), 'L' = facing viewer's left (-X)
        if (rt.by.hipR) rt.by.hipR.flipX = targetSide === 'R';
        if (rt.by.femurR) rt.by.femurR.flipX = false;
        if (rt.by.hipL) rt.by.hipL.flipX = targetSide === 'L';
        if (rt.by.femurL) rt.by.femurL.flipX = false;

        // Hips + staggered side-view legs (both knees & feet oriented in profile)
        toAngles.pelvis = dir * 4;
        toAngles.hipR = targetSide === 'R' ? 8 : -6;
        toAngles.hipL = targetSide === 'R' ? -6 : 8;
        if (targetSide === 'R') {
          toAngles.femurL = -14;
          toAngles.shinL = 24;
          toAngles.footL = -8;
          toAngles.femurR = 14;
          toAngles.shinR = -6;
          toAngles.footR = 8;
        } else {
          toAngles.femurR = 14;
          toAngles.shinR = -24;
          toAngles.footR = 8;
          toAngles.femurL = -14;
          toAngles.shinL = 6;
          toAngles.footL = -8;
        }

        // Spine & head profile turn
        toAngles.lumbar = dir * -4;
        toAngles.thorax = dir * -5;
        toAngles.ribR = dir * 5;
        toAngles.ribL = dir * 5;
        toAngles.neck = dir * 8;
        toAngles.head = dir * 14;

        // Shoulders & arms balance in side profile
        toAngles.swivelR = dir * -10;
        toAngles.swivelL = dir * -14;
        toAngles.acromionR = dir * 10;
        toAngles.acromionL = dir * 12;
        toAngles.braceR = dir * -6;
        toAngles.braceL = dir * -6;

        if (targetSide === 'R') {
          toAngles.humerusR = -30;
          toAngles.forearmR = -28;
          toAngles.handR = -8;
          toAngles.humerusL = 18;
          toAngles.forearmL = -18;
          toAngles.handL = 6;
        } else {
          toAngles.humerusL = 30;
          toAngles.forearmL = 28;
          toAngles.handL = 8;
          toAngles.humerusR = -18;
          toAngles.forearmR = 18;
          toAngles.handR = -6;
        }
      }

      snapSpringRef.current = {
        fromAngles,
        toAngles,
        t0: performance.now(),
        dur: 430,
      };
      window.clearTimeout(copyToastTimerRef.current);
      setCopyToast(
        targetSide === null
          ? 'Snapped elastically · Front pose'
          : `Snapped elastically · Side pose (${targetSide === 'R' ? 'Right' : 'Left'})`,
      );
      copyToastTimerRef.current = window.setTimeout(() => setCopyToast(null), 1700);
      wake();
    },
    [wake],
  );

  const pickAtWorldPoint = (
    q: [number, number],
    rt: RigRuntime,
  ): { node: RigNode; piece: RigPiece | null } | null => {
    // 0. Prioritize hands clearly over overlapping digit sub-bones so hand activation & drag aren't ambiguous
    const handPickR = (38 * rt.dpr) / rt.z;
    for (const hid of ['handR', 'handL'] as const) {
      const hn = rt.by[hid];
      if (!hn) continue;
      const hp = pos(hn, rt.by);
      if (Math.hypot(hp[0] - q[0], hp[1] - q[1]) < handPickR) {
        return { node: hn, piece: hn.pieces[0] ?? null };
      }
    }

    // 1. Primary anatomical joints with differentiated lumbar pick point (38% up toward thorax) so pelvis [1257,3382] stays unambiguous
    let best: RigNode | null = null;
    let bd = (20 * rt.dpr) / rt.z;
    for (const n of rt.nodes) {
      if (
        isSwivelId(n.id) ||
        n.id === 'hipR' ||
        n.id === 'hipL' ||
        n.id === 'ribR' ||
        n.id === 'ribL' ||
        n.id === 'chinTip' ||
        n.id.startsWith('thumb') ||
        n.id.startsWith('finger')
      ) {
        continue;
      }
      let p = pos(n, rt.by);
      if (n.id === 'lumbar' && rt.by.thorax) {
        const tp = pos(rt.by.thorax, rt.by);
        p = [p[0] + (tp[0] - p[0]) * 0.38, p[1] + (tp[1] - p[1]) * 0.38];
      }
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    if (best) return { node: best, piece: null };

    // 2. Pixel hit-test on sprites (defer Shoulderswivel if too close to primary spine/shoulder joints)
    const hit = hitTestPiece(q, rt.pieces, rt.wingPop);
    if (hit) {
      if (hit.piece.name === 'Shoulderswivel') {
        const minPrimaryDist = (30 * rt.dpr) / rt.z;
        const nearPrimary = [
          'thorax',
          'lumbar',
          'pelvis',
          'acromionL',
          'acromionR',
          'braceL',
          'braceR',
          'wingL',
          'wingR',
          'humerusL',
          'humerusR',
        ].some((id) => {
          const pn = rt.by[id];
          if (!pn) return false;
          const pp = pos(pn, rt.by);
          return Math.hypot(pp[0] - q[0], pp[1] - q[1]) < minPrimaryDist;
        });
        if (!nearPrimary) {
          return { node: hit.node, piece: hit.piece };
        }
      } else {
        return { node: hit.node, piece: hit.piece };
      }
    }

    // 3. Fallback tight radius for intentional swivel dot clicks
    let swBest: RigNode | null = null;
    let swBd = (9.5 * rt.dpr) / rt.z;
    for (const n of rt.nodes) {
      if (!isSwivelId(n.id)) continue;
      const p = pos(n, rt.by);
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d < swBd) {
        swBd = d;
        swBest = n;
      }
    }
    if (swBest) return { node: swBest, piece: null };
    return hit ? { node: hit.node, piece: hit.piece } : null;
  };

  const tipNodeForEffector = (id: string, by: Record<string, RigNode>): RigNode | undefined => {
    if (id === 'footL') return by.toeL;
    if (id === 'footR') return by.toeR;
    if (id === 'handL') return by.fingerTipL;
    if (id === 'handR') return by.fingerTipR;
    if (id === 'head') return by.chinTip;
    return undefined;
  };

  const clearLongIkTimer = useCallback(() => {
    if (longIkTimerRef.current) {
      cancelAnimationFrame(longIkTimerRef.current);
      longIkTimerRef.current = 0;
    }
    ikOverlayRef.current.holdProgress = null;
    ikOverlayRef.current.holdPos = null;
    if (dragRef.current && dragRef.current.t === 'rot' && dragRef.current.ikPending) {
      dragRef.current.ikPending = undefined;
    }
  }, []);

  const syncAllPinsToRig = useCallback(() => {
    const rt = rtRef.current;
    if (!rt) return;
    ikPinsRef.current = syncPinsFromRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, ikPinsRef.current);
  }, []);

  const startLimbIkDrag = useCallback(
    (chain: LimbChainDef, effectorNode: RigNode, q: [number, number], clientX: number, clientY: number) => {
      const rt = rtRef.current;
      if (!rt) return;
      solveRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, rt.ribAnchor);
      const U = rt.by[chain.upper];
      const L = rt.by[chain.lower];
      const E = rt.by[chain.effector] ?? effectorNode;
      if (!U || !L || !E) return;
      const swiv = chain.swiv ? rt.by[chain.swiv] : undefined;
      const braceSide = chain.id === 'armL' ? 'braceL' : chain.id === 'armR' ? 'braceR' : null;
      const br = braceSide ? rt.by[braceSide] : undefined;
      const tipNode = tipNodeForEffector(E.id, rt.by);
      const target0 = pos(E, rt.by);
      const endDir0 = getWorldDir(E, tipNode ? tipNode.piv : null, rt.by);
      const uPos = pos(U, rt.by);
      const ePos = pos(E, rt.by);
      const uMirror = U.w[0] * U.w[3] - U.w[1] * U.w[2] < 0 ? -1 : 1;
      const bendHint =
        Math.abs(L.ang) > 4
          ? (L.ang > 0 ? 1 : -1) * uMirror
          : chain.id.startsWith('leg')
          ? chain.bendSign
          : U.id === 'humerusL'
          ? ePos[0] < uPos[0]
            ? 1
            : -1
          : ePos[0] > uPos[0]
          ? -1
          : 1;

      const snapAngles: Record<string, number> = {};
      rt.nodes.forEach((n) => {
        snapAngles[n.id] = n.ang;
      });
      const cfg = ikConfigRef.current;
      const isElasticPin = cfg.mode === 'pinFull' && cfg.elasticPinFull;
      const pinAnchor: [number, number] | undefined = isElasticPin
        ? [...(ikPinsRef.current[E.id]?.pos ?? target0)] as [number, number]
        : undefined;

      dragRef.current = {
        t: 'limbIk',
        chain,
        target0,
        q0: [q[0], q[1]],
        swiv0: swiv?.ang ?? 0,
        brace0: br?.ang ?? 0,
        endDir0,
        bendHint,
        snap: capturePoseIKSnapshot(rt.nodes, rt.by, rt.root, rt.bondOn, rt.wingPop),
        snapAngles,
        isElasticPin,
        pinAnchor,
        downX: clientX,
        downY: clientY,
      };
      ikOverlayRef.current.activeChainIds = chain.swiv
        ? [chain.swiv, chain.upper, chain.lower, chain.effector]
        : [chain.upper, chain.lower, chain.effector];
      ikOverlayRef.current.targetPos = [target0[0], target0[1]];
      ikOverlayRef.current.elasticTethers = undefined;
      if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
      wake();
    },
    [wake],
  );

  const startFbikDrag = useCallback(
    (fbNode: RigNode, q: [number, number], clientX: number, clientY: number) => {
      const rt = rtRef.current;
      if (!rt) return;
      const baseline = captureFBIKBaseline(
        fbNode,
        q,
        rt.nodes,
        rt.by,
        rt.root,
        rt.bondOn,
        rt.wingPop,
        ikConfigRef.current,
        ikPinsRef.current,
      );
      const activeChainIds =
        fbNode.id === 'head'
          ? ['pelvis', 'lumbar', 'thorax', 'neck', 'head']
          : fbNode.id === 'neck'
          ? ['pelvis', 'lumbar', 'thorax', 'neck']
          : fbNode.id === 'thorax'
          ? ['pelvis', 'lumbar', 'thorax']
          : fbNode.id === 'lumbar'
          ? ['pelvis', 'lumbar']
          : fbNode.id === 'shinL'
          ? ['femurL', 'shinL', 'footL']
          : fbNode.id === 'shinR'
          ? ['femurR', 'shinR', 'footR']
          : ['pelvis', 'femurL', 'shinL', 'footL', 'femurR', 'shinR', 'footR'];

      dragRef.current = {
        t: 'fbik',
        baseline,
        activeChainIds,
        downX: clientX,
        downY: clientY,
      };
      ikOverlayRef.current.activeChainIds = activeChainIds;
      ikOverlayRef.current.targetPos = [q[0], q[1]];
      if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
      wake();
    },
    [wake],
  );

  const armLongIkTimer = useCallback(
    (pend: NonNullable<Extract<typeof dragRef.current, { t: 'rot' }>['ikPending']>) => {
      clearLongIkTimer();
      const drag = dragRef.current;
      if (!drag || drag.t !== 'rot') return;
      drag.ikPending = pend;

      const step = (now: number) => {
        longIkTimerRef.current = 0;
        const curDrag = dragRef.current;
        if (!curDrag || curDrag.t !== 'rot' || !curDrag.ikPending) return;
        const p = curDrag.ikPending;
        const progress = Math.min(1, (now - p.t0) / LONG_IK_MS);
        ikOverlayRef.current.holdProgress = progress;
        ikOverlayRef.current.holdPos = [p.q0[0], p.q0[1]];
        repaint();
        if (now - p.t0 >= LONG_IK_MS) {
          curDrag.ikPending = undefined;
          ikOverlayRef.current.holdProgress = null;
          ikOverlayRef.current.holdPos = null;
          if (p.kind === 'limb') {
            startLimbIkDrag(p.chain, p.node, p.q0, p.startX, p.startY);
          } else {
            startFbikDrag(p.fbNode, p.q0, p.startX, p.startY);
          }
          return;
        }
        longIkTimerRef.current = requestAnimationFrame(step);
      };
      longIkTimerRef.current = requestAnimationFrame(step);
    },
    [clearLongIkTimer, repaint, startFbikDrag, startLimbIkDrag],
  );

  const handleUpdateIkConfig = useCallback(
    (patch: Partial<IKConfig>) => {
      const rt = rtRef.current;
      const prevMode = ikConfigRef.current.mode;
      const prevGrav = ikConfigRef.current.footGravity;
      ikConfigRef.current = { ...ikConfigRef.current, ...patch };
      if (rt) {
        if (ikConfigRef.current.mode !== prevMode || ikConfigRef.current.footGravity !== prevGrav) {
          syncAllPinsToRig();
        }
        if (patch.footGravity && !prevGrav) {
          enforceGroundContact(rt.nodes, rt.by, rt.root, rt.bondOn, rt.wingPop, ikConfigRef.current.groundY, false);
          syncAllPinsToRig();
        }
      }
      syncUi();
      wake();
    },
    [syncAllPinsToRig, syncUi, wake],
  );

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    clearLongIkTimer();
    const rt = rtRef.current;
    const cv = canvasRef.current;
    if (!rt || !cv) return;
    cv.setPointerCapture(e.pointerId);

    if (e.shiftKey || e.button === 1) {
      shiftTapRef.current.used = true;
      rt.userView = true;
      dragRef.current = { t: 'pan', x: e.clientX, y: e.clientY, ox: rt.ox, oy: rt.oy };
      return;
    }

    stopAbcLoop();
    snapSpringRef.current = null;
    solveRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, rt.ribAnchor);
    const q = toWorld(e);

    // Zero-friction hit order: Puppet joints ALWAYS beat perspective handles
    const picked = pickAtWorldPoint(q, rt);
    const pPre = hitPerspHandle(q, perspRef.current, { z: rt.z, ox: rt.ox, oy: rt.oy, dpr: rt.dpr });
    if (!picked && pPre) {
      dragRef.current = {
        t: 'persp',
        what: pPre,
        q0: q,
        vpX0: perspRef.current.vpX,
        h0: perspRef.current.horizonY,
        g0: perspRef.current.groundY,
      };
      cv.style.cursor = pPre === 'vp' ? 'ew-resize' : 'ns-resize';
      wake();
      return;
    }

    if (picked) {
      rt.sel = picked.node;
    }
    syncUi();
    wake();

    if (rt.sel.id === 'lip' || rt.sel.id === 'chinTip') {
      if (rt.by.lip) rt.by.lip.ang = 0;
      dragRef.current = {
        t: 'headSwivel',
        lastWorld: [q[0], q[1]],
        startX: e.clientX,
        startY: e.clientY,
        accumAlongSpineRight: 0,
        lastDir: 0,
        swiveledSteps: 0,
      };
      cv.style.cursor = 'ew-resize';
      return;
    }

    const ikCfg = ikConfigRef.current;
    const allowIk = ikCfg.mode !== 'fk' && !e.altKey;

    // Separated Hip cluster (upper hip swivels around spine base; switches >25% beyond lower spine onto opposite leg)
    if (rt.sel.id === 'hipR' || rt.sel.id === 'hipL') {
      const hipSide: 'L' | 'R' = rt.sel.id === 'hipL' ? 'L' : 'R';
      const hipNode = rt.sel;
      const femur = rt.by['femur' + hipSide];
      const shin = rt.by['shin' + hipSide];
      const foot = rt.by['foot' + hipSide];
      let onUpperRound = true;
      const hp = picked?.piece ?? hipNode.pieces[0];
      if (hp) {
        const w = hipNode.w;
        const det = w[0] * w[3] - w[1] * w[2];
        if (det) {
          const dx = q[0] - w[4];
          const dy = q[1] - w[5];
          const localY = (-w[1] * dx + w[0] * dy) / det;
          onUpperRound = localY <= hp.y + hp.h * 0.62;
        }
      }
      if (onUpperRound && femur) {
        solveRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, rt.ribAnchor);
        const spineBase = pos(rt.by.pelvis ?? rt.root, rt.by);
        const spineDivInit = rt.by.lumbar?.ang ?? 0;
        const curSideInit = (hipSide === 'R' ? -1 : 1) * (hipNode.flipX ? -1 : 1);
        const relInit = normalizeDeg(hipNode.ang - spineDivInit);
        const outInit = curSideInit === -1 ? relInit : -relInit;
        let initRaw = hipNode.ang;
        if (outInit > 76) {
          const ratio = Math.min(0.985, (outInit - 76) / 16.25);
          const rawOut = 76 + 16.25 * Math.atanh(ratio);
          initRaw = spineDivInit + (curSideInit === -1 ? rawOut : -rawOut);
        }
        const toeNode = rt.by['toe' + hipSide];
        const ankleTarget0 = foot ? pos(foot, rt.by) : null;
        const footWorldDir0 = foot && toeNode ? getWorldDir(foot, toeNode.piv, rt.by) : null;
        dragRef.current = {
          t: 'hipSwivel',
          side: hipSide,
          sAng: Math.atan2(q[1] - spineBase[1], q[0] - spineBase[0]),
          rawHip: initRaw,
          hip0: hipNode.ang,
          femur0: femur.ang,
          shin0: shin?.ang ?? 0,
          foot0: foot?.ang ?? 0,
          flipped0: !!hipNode.flipX,
          ankleTarget0,
          footWorldDir0,
          snap: allowIk ? capturePoseIKSnapshot(rt.nodes, rt.by, rt.root, rt.bondOn, rt.wingPop) : undefined,
        };
        return;
      }
      // Lower hip base drives pelvis weight/squat IK
      rt.sel = rt.root;
    }

    // Coordinated piece-guided shoulder girdle (wing circle, Backshoulder, Shouldertendon, Shoulderbone)
    const selId = rt.sel.id;
    const side: 'L' | 'R' | null = selId.endsWith('L') ? 'L' : selId.endsWith('R') ? 'R' : null;
    let guide: 'wing' | 'tendon' | 'acromion' | 'prometheus' | null = null;
    if (selId === 'wingL' || selId === 'wingR' || picked?.piece?.name === 'Backshoulder') {
      guide = rt.prometheusWings ? 'prometheus' : 'wing';
    } else if (picked?.piece?.name === 'Shouldertendon') {
      guide = 'tendon';
    } else if (selId === 'braceL' || selId === 'braceR') {
      guide = rt.prometheusWings ? 'prometheus' : 'tendon';
    } else if (selId === 'acromionL' || selId === 'acromionR' || picked?.piece?.name === 'Shoulderbone') {
      guide = 'acromion';
    }

    if (guide && side) {
      const swivel = rt.by['swivel' + side];
      const acromion = rt.by['acromion' + side];
      const brace = rt.by['brace' + side];
      const humerus = rt.by['humerus' + side];
      const forearm = rt.by['forearm' + side];
      const hand = rt.by['hand' + side];
      if (swivel && acromion && brace) {
        const swPos = pos(swivel, rt.by);
        const neckPos = pos(brace, rt.by);
        dragRef.current = {
          t: 'shoulder',
          side,
          guide,
          sSwivel: Math.atan2(q[1] - swPos[1], q[0] - swPos[0]),
          sNeck: Math.atan2(q[1] - neckPos[1], q[0] - neckPos[0]),
          swivel0: swivel.ang,
          acro0: acromion.ang,
          brace0: brace.ang,
          humerus0: humerus?.ang ?? 0,
          forearm0: forearm?.ang ?? 0,
          hand0: hand?.ang ?? 0,
          snap: allowIk ? capturePoseIKSnapshot(rt.nodes, rt.by, rt.root, rt.bondOn, rt.wingPop) : undefined,
        };
        return;
      }
    }

    // IK & FABRIK routing for extremities, knees, spine & pelvis
    const limbChain = allowIk ? findLimbChainForNode(rt.sel.id) : null;
    const isFbikNode = allowIk && !limbChain && FBIK_CHAIN_NODES.has(rt.sel.id);

    if (limbChain && ikCfg.trigger === 'direct') {
      startLimbIkDrag(limbChain, rt.by[limbChain.effector] ?? rt.sel, q, e.clientX, e.clientY);
      return;
    }

    if (isFbikNode && ikCfg.trigger === 'direct') {
      startFbikDrag(rt.sel, q, e.clientX, e.clientY);
      return;
    }

    // FK drag (with optional Hold-0.26s IK promotion when trigger === 'hold')
    const pp = pos(rt.sel, rt.by);
    const par = parentOf(rt.sel, rt.by);
    const pw = par ? par.w : [1, 0, 0, 1, 0, 0];
    const parDetSign = pw[0] * pw[3] - pw[1] * pw[2] < 0 ? -1 : 1;
    dragRef.current = {
      t: 'rot',
      a0: rt.sel.ang,
      s: Math.atan2(q[1] - pp[1], q[0] - pp[0]),
      rawAng: rt.sel.ang,
      parDetSign,
      snap: allowIk ? capturePoseIKSnapshot(rt.nodes, rt.by, rt.root, rt.bondOn, rt.wingPop) : undefined,
    };

    if (limbChain && ikCfg.trigger === 'hold') {
      armLongIkTimer({
        kind: 'limb',
        chain: limbChain,
        node: rt.by[limbChain.effector] ?? rt.sel,
        q0: [q[0], q[1]],
        startX: e.clientX,
        startY: e.clientY,
        t0: performance.now(),
      });
    } else if (isFbikNode && ikCfg.trigger === 'hold') {
      armLongIkTimer({
        kind: 'fbik',
        fbNode: rt.sel,
        q0: [q[0], q[1]],
        startX: e.clientX,
        startY: e.clientY,
        t0: performance.now(),
      });
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rt = rtRef.current;
    const cv = canvasRef.current;
    if (!rt || !cv) return;

    const drag = dragRef.current;
    if (!drag) {
      solveRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, rt.ribAnchor);
      const q = toWorld(e);
      const picked = pickAtWorldPoint(q, rt);
      const best = picked?.node ?? null;
      const pH = hitPerspHandle(q, perspRef.current, { z: rt.z, ox: rt.ox, oy: rt.oy, dpr: rt.dpr });
      const nextPersp: PerspHandle = !best && pH ? pH : null;
      if (best !== rt.hov || nextPersp !== hoverPerspRef.current) {
        rt.hov = best;
        hoverPerspRef.current = nextPersp;
        cv.style.cursor =
          nextPersp === 'vp' ? 'ew-resize' : nextPersp ? 'ns-resize' : best ? 'pointer' : 'crosshair';
        repaint();
      }
      return;
    }

    if (drag.t === 'pan') {
      const d = cv.width / cv.getBoundingClientRect().width;
      rt.ox = drag.ox + (e.clientX - drag.x) * d;
      rt.oy = drag.oy + (e.clientY - drag.y) * d;
      clampRtCamera();
      wake();
      return;
    }

    const q = toWorld(e);
    if (drag.t === 'headSwivel') {
      // Determine drag direction perpendicular to the live upper-to-neck spine axis
      const spBase = rt.by.thorax ? pos(rt.by.thorax, rt.by) : rt.by.pelvis ? pos(rt.by.pelvis, rt.by) : [1257, 2377.5];
      const spTop = rt.by.neck ? pos(rt.by.neck, rt.by) : rt.by.head ? pos(rt.by.head, rt.by) : [1257, 1327];
      const spDx = spTop[0] - spBase[0];
      const spDy = spTop[1] - spBase[1];
      const spLen = Math.hypot(spDx, spDy) || 1;
      const rx = -spDy / spLen;
      const ry = spDx / spLen;
      const projDelta = (q[0] - drag.lastWorld[0]) * rx + (q[1] - drag.lastWorld[1]) * ry;
      drag.lastWorld = [q[0], q[1]];
      if (rt.by.lip) rt.by.lip.ang = 0;

      const STEP_WORLD = 115;
      if (projDelta > 1 && drag.lastDir === -1 && drag.accumAlongSpineRight < -STEP_WORLD * 0.35) {
        drag.accumAlongSpineRight = -STEP_WORLD * 0.35;
      } else if (projDelta < -1 && drag.lastDir === 1 && drag.accumAlongSpineRight > STEP_WORLD * 0.35) {
        drag.accumAlongSpineRight = STEP_WORLD * 0.35;
      }
      drag.accumAlongSpineRight += projDelta;

      while (drag.accumAlongSpineRight >= STEP_WORLD) {
        drag.accumAlongSpineRight -= STEP_WORLD;
        drag.lastDir = 1;
        drag.swiveledSteps++;
        stepHeadTurn(1);
      }
      while (drag.accumAlongSpineRight <= -STEP_WORLD) {
        drag.accumAlongSpineRight += STEP_WORLD;
        drag.lastDir = -1;
        drag.swiveledSteps++;
        stepHeadTurn(-1);
      }
      return;
    }

    if (drag.t === 'persp') {
      if (drag.what === 'vp') {
        perspRef.current.vpX = drag.vpX0 + (q[0] - drag.q0[0]);
      } else if (drag.what === 'horizon') {
        perspRef.current.horizonY = Math.max(-1800, Math.min(perspRef.current.groundY + 1200, drag.h0 + (q[1] - drag.q0[1])));
      } else if (drag.what === 'ground') {
        perspRef.current.groundY = Math.max(perspRef.current.horizonY - 900, Math.min(rt.H + 1400, drag.g0 + (q[1] - drag.q0[1])));
        ikConfigRef.current = { ...ikConfigRef.current, groundY: perspRef.current.groundY };
      }
      syncPerspectiveSpine();
      syncUi();
      wake();
      return;
    }

    const ikCfg = ikConfigRef.current;

    if (drag.t === 'limbIk') {
      let targetRaw: [number, number] = [
        drag.target0[0] + (q[0] - drag.q0[0]),
        drag.target0[1] + (q[1] - drag.q0[1]),
      ];
      if (drag.isElasticPin && drag.pinAnchor) {
        const ax = drag.pinAnchor[0];
        const ay = drag.pinAnchor[1];
        const px = targetRaw[0] - ax;
        const py = targetRaw[1] - ay;
        const dist = Math.hypot(px, py);
        const maxStretch = 360;
        const stretch = dist > 1e-4 ? maxStretch * Math.tanh(dist / maxStretch) : 0;
        targetRaw = dist > 1e-4 ? [ax + (px / dist) * stretch, ay + (py / dist) * stretch] : [ax, ay];
      }
      const target: [number, number] =
        ikCfg.footGravity && drag.chain.id.startsWith('leg')
          ? [targetRaw[0], Math.min(ikCfg.groundY, targetRaw[1])]
          : targetRaw;

      const U = rt.by[drag.chain.upper];
      const L = rt.by[drag.chain.lower];
      const E = rt.by[drag.chain.effector];
      const swiv = drag.chain.swiv ? rt.by[drag.chain.swiv] : undefined;

      if (U && L && E) {
        if (swiv && !swiv.lock) {
          swiv.ang = drag.swiv0;
        }
        const armSideBrace = drag.chain.id === 'armL' ? rt.by.braceL : drag.chain.id === 'armR' ? rt.by.braceR : undefined;
        if (armSideBrace && rt.prometheusWings) {
          armSideBrace.ang = drag.brace0;
        }
        solveRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, rt.ribAnchor);

        // Optional shoulder clavicle swivel follow (amplified elastically when Prometheus wings are active)
        const effSwivelFollow = rt.prometheusWings && drag.chain.id.startsWith('arm')
          ? Math.max(0.58, Math.min(1, ikCfg.swivelFollow * 1.45))
          : ikCfg.swivelFollow;
        if (swiv && !swiv.lock && effSwivelFollow > 0.001) {
          const [L1, L2] = limbLengths(drag.chain, rt.by);
          const hardMax = L1 + L2 - 4;
          const effSoft = (L1 + L2) * Math.max(0.05, Math.min(0.28, ikCfg.softness));
          const softSwivStart = rt.prometheusWings ? hardMax * 0.48 : hardMax - effSoft * 0.55;
          const S = pos(U, rt.by);
          const distST = Math.hypot(target[0] - S[0], target[1] - S[1]);
          if (distST > softSwivStart) {
            const C = pos(swiv, rt.by);
            const par = parentOf(swiv, rt.by);
            const pw = par ? par.w : [1, 0, 0, 1, 0, 0];
            const sgnS = pw[0] * pw[3] - pw[1] * pw[2] >= 0 ? 1 : -1;
            const angCS = Math.atan2(S[1] - C[1], S[0] - C[0]);
            const angCT = Math.atan2(target[1] - C[1], target[0] - C[0]);
            const rCS = Math.hypot(S[0] - C[0], S[1] - C[1]) || 1;
            const rCT = Math.hypot(target[0] - C[0], target[1] - C[1]) || 1;
            let desiredScreen = angCT;
            if (rCT < rCS + hardMax && rCT > Math.abs(rCS - hardMax)) {
              const phi = Math.acos(
                Math.max(-1, Math.min(1, (rCS * rCS + rCT * rCT - hardMax * hardMax) / (2 * rCS * rCT))),
              );
              const a1 = angCT + phi;
              const a2 = angCT - phi;
              desiredScreen =
                Math.abs(normalizeDeg((a1 - angCS) / DEG)) <= Math.abs(normalizeDeg((a2 - angCS) / DEG))
                  ? a1
                  : a2;
            }
            const rawW = Math.min(1, (distST - softSwivStart) / (Math.max(1, hardMax - softSwivStart) + 1e-6));
            const swivWeight = rawW * rawW * (3 - 2 * rawW) * effSwivelFollow;
            const delta = normalizeDeg((desiredScreen - angCS) / DEG) * swivWeight;
            swiv.ang = clampAnatomicalAngle(
              swiv,
              clampRealisticShoulder(swiv, drag.swiv0 + sgnS * delta, rt.by, rt.prometheusWings),
              rt.constrainLimits,
            );
            if (armSideBrace && rt.prometheusWings) {
              armSideBrace.ang = clampAnatomicalAngle(
                armSideBrace,
                drag.brace0 + sgnS * delta * 0.72,
                rt.constrainLimits,
              );
            }
          }
        }

        solveLimbChain(
          drag.chain,
          target,
          rt.nodes,
          rt.by,
          rt.bondOn,
          rt.wingPop,
          ikCfg,
          rt.constrainLimits,
          drag.bendHint,
        );

        if (Math.abs(L.ang) > 4) {
          drag.bendHint = (L.ang > 0 ? 1 : -1) * (U.flipX ? -1 : 1);
        }

        const tipNode = tipNodeForEffector(E.id, rt.by);
        if (tipNode) {
          setWorldDirExact(E, tipNode.piv, drag.endDir0, rt.by);
          E.ang = clampAnatomicalAngle(E, E.ang, rt.constrainLimits);
          solveRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, rt.ribAnchor);
        }

        const ePos = pos(E, rt.by);
        if (drag.isElasticPin && drag.pinAnchor) {
          ikOverlayRef.current.elasticTethers = [{ anchor: drag.pinAnchor, current: [ePos[0], ePos[1]] }];
        } else {
          ikPinsRef.current[E.id] = {
            pos: [ePos[0], ePos[1]],
            endDir: drag.endDir0,
            pinned: !!ikPinsRef.current[E.id]?.pinned,
          };
          ikOverlayRef.current.elasticTethers = undefined;
        }
        applyBalanceAndPins(
          E.id,
          drag.snap,
          rt.nodes,
          rt.by,
          rt.bondOn,
          rt.wingPop,
          ikCfg,
          ikPinsRef.current,
          rt.constrainLimits,
          drag.chain.id,
        );
        ikOverlayRef.current.targetPos = [target[0], target[1]];
      }
      syncUi();
      wake();
      return;
    }

    if (drag.t === 'fbik') {
      const chainIds = solveFullBodyIKDrag(
        q,
        drag.baseline,
        rt.nodes,
        rt.by,
        rt.root,
        rt.bondOn,
        rt.wingPop,
        ikCfg,
        ikPinsRef.current,
        rt.constrainLimits,
      );
      if (drag.baseline.fbNodeId === 'pelvis' || drag.baseline.fbNodeId === 'lumbar') {
        syncPerspectiveSpine();
        clampRtCamera();
      }
      if (chainIds.length) {
        drag.activeChainIds = chainIds;
        ikOverlayRef.current.activeChainIds = chainIds;
      }
      ikOverlayRef.current.targetPos = [q[0], q[1]];
      syncUi();
      wake();
      return;
    }

    if (drag.t === 'hipSwivel') {
      solveRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, rt.ribAnchor);
      const hip = rt.by['hip' + drag.side];
      const femur = rt.by['femur' + drag.side];
      const shin = rt.by['shin' + drag.side];
      const foot = rt.by['foot' + drag.side];
      if (hip && femur) {
        const spineBase = pos(rt.by.pelvis ?? rt.root, rt.by);
        const curAng = Math.atan2(q[1] - spineBase[1], q[0] - spineBase[0]);
        const stepDeg = normalizeDeg((curAng - drag.sAng) / DEG);
        drag.sAng = curAng;
        drag.rawHip += stepDeg * 0.95;

        // Lower spine dividing angle in pelvis-local space (the dividing line in all poses)
        const spineDivDeg = rt.by.lumbar?.ang ?? 0;
        const homeSide = drag.side === 'R' ? -1 : 1;
        const curSide = homeSide * (hip.flipX ? -1 : 1);

        // Positive outwardDeg swings leg outward toward 90° horizontal; positive inwardDeg crosses the lower spine
        const relToSpine = drag.rawHip - spineDivDeg;
        const outwardDeg = curSide === -1 ? relToSpine : -relToSpine;
        const inwardDeg = -outwardDeg;
        const femOutwardSign = drag.side === 'R' ? 1 : -1;

        const easeStart = 76;
        const maxOutward = 92.25;
        const headroom = maxOutward - easeStart;

        const legChain = LIMB_CHAINS.find((c) => c.id === 'leg' + drag.side);
        const toeNode = rt.by['toe' + drag.side];
        const weightyIkCfg = { ...ikCfg, solver: 'analytical' as const, softness: 0.02 };

        const applyGroundedWeightiness = (target: [number, number] | null) => {
          if (!legChain || !target) return;
          femur.ang = drag.femur0;
          if (shin) shin.ang = drag.shin0;
          solveAnalyticalLimbIK(
            legChain,
            target,
            rt.nodes,
            rt.by,
            rt.bondOn,
            rt.wingPop,
            weightyIkCfg,
            false,
            legChain.bendSign,
          );
          if (foot && toeNode && drag.footWorldDir0 !== null) {
            solveRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, rt.ribAnchor);
            setWorldDirExact(foot, toeNode.piv, drag.footWorldDir0, rt.by);
          }
        };

        const computeAnkleTargetBeforeShift = (): [number, number] | null => {
          solveRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, rt.ribAnchor);
          const anNode = foot ?? shin;
          if (!anNode) return null;
          const feB = pos(femur, rt.by);
          const anB = pos(anNode, rt.by);
          const dy = anB[1] - feB[1];
          const gy = perspRef.current.groundY;
          if (dy > 40 && gy > feB[1] + 40) {
            const t = (gy - feB[1]) / dy;
            return [feB[0] + t * (anB[0] - feB[0]), gy];
          }
          return anB;
        };

        const snapFemurToAnkleTarget = (target: [number, number] | null) => {
          const anNode = foot ?? shin;
          if (!target || !anNode) return;
          solveRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, rt.ribAnchor);
          const feA = pos(femur, rt.by);
          const anA = pos(anNode, rt.by);
          const curDir = Math.atan2(anA[1] - feA[1], anA[0] - feA[0]);
          const tgtDir = Math.atan2(target[1] - feA[1], target[0] - feA[0]);
          const hw = hip.w;
          const detSign = hw[0] * hw[3] - hw[1] * hw[2] < 0 ? -1 : 1;
          const deltaDeg = normalizeDeg((tgtDir - curDir) / DEG);
          femur.ang = normalizeDeg(femur.ang + deltaDeg * detSign);
        };

        // 1. Inward crossing past lower spine (>25% = 45°): shift hip & compensate leg to keep ankle on same ground spot
        if (inwardDeg > 45) {
          const groundSpot = drag.ankleTarget0 ?? computeAnkleTargetBeforeShift();
          const nextFlip = !hip.flipX;
          const oppSide: 'L' | 'R' = drag.side === 'R' ? 'L' : 'R';
          const oppHip = rt.by['hip' + oppSide];

          hip.flipX = nextFlip;
          femur.flipX = false;

          const sameVisualSideAsOpp = Boolean(nextFlip) !== Boolean(oppHip?.flipX);
          if (oppHip && sameVisualSideAsOpp) {
            hip.ang = oppHip.ang;
          } else {
            hip.ang = oppHip ? normalizeDeg(2 * spineDivDeg - oppHip.ang) : spineDivDeg;
          }
          applyGroundedWeightiness(groundSpot);

          drag.rawHip = hip.ang;
          drag.hip0 = hip.ang;
          drag.femur0 = femur.ang;
          drag.shin0 = shin?.ang ?? 0;
          drag.foot0 = foot?.ang ?? 0;
          drag.flipped0 = nextFlip;

          window.clearTimeout(copyToastTimerRef.current);
          setCopyToast(
            `${drag.side === 'R' ? 'Right' : 'Left'} hip · shifted & weighted to ankle ground spot`,
          );
          copyToastTimerRef.current = window.setTimeout(() => setCopyToast(null), 1600);
        } else {
          // 2. Outward hip eases into ~92.25° while femur & shin compensate for grounded weightiness, then lifts past upper spine
          let easedHipOutward = outwardDeg;
          let carryToFemur = 0;
          if (outwardDeg > easeStart) {
            easedHipOutward = easeStart + headroom * Math.tanh((outwardDeg - easeStart) / headroom);
            carryToFemur = outwardDeg - easedHipOutward;
          }
          const finalRel = curSide === -1 ? easedHipOutward : -easedHipOutward;
          hip.ang = normalizeDeg(spineDivDeg + finalRel);

          // Grounded 2-bone weighty compensation keeps ankle at drag.ankleTarget0
          applyGroundedWeightiness(drag.ankleTarget0);

          if (carryToFemur > 0) {
            const femGrounded = femur.ang;
            const shinGrounded = shin?.ang ?? drag.shin0;
            const footGrounded = foot?.ang ?? drag.foot0;
            const liftT = Math.min(1, carryToFemur / 42);
            const smoothT = liftT * liftT * (3 - 2 * liftT);
            const targetUp = drag.femur0 + femOutwardSign * carryToFemur;
            const upDelta =
              femOutwardSign === 1
                ? (((targetUp - femGrounded) % 360) + 360) % 360
                : -((((femGrounded - targetUp) % 360) + 360) % 360);
            femur.ang = normalizeDeg(femGrounded + upDelta * smoothT);
            if (shin) {
              shin.ang = normalizeDeg(
                shinGrounded * (1 - smoothT) + drag.shin0 * smoothT - femOutwardSign * 16 * Math.sin(Math.PI * smoothT),
              );
            }
            if (foot) {
              foot.ang = normalizeDeg(footGrounded + normalizeDeg(drag.foot0 - footGrounded) * smoothT);
            }
          }

          // Check if femur has continued upward past the upper spine (thorax -> neck); if so, switch hip cleanly
          if (outwardDeg > 135 && shin && rt.by.thorax && rt.by.neck) {
            solveRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, rt.ribAnchor);
            const th = pos(rt.by.thorax, rt.by);
            const nk = pos(rt.by.neck, rt.by);
            const fe = pos(femur, rt.by);
            const shBefore = pos(shin, rt.by);
            const spDx = nk[0] - th[0];
            const spDy = nk[1] - th[1];
            const spLen = Math.hypot(spDx, spDy) || 1;
            const ux = spDx / spLen;
            const uy = spDy / spLen;
            const nx = -uy;
            const ny = ux;
            const alongSpine = (shBefore[0] - th[0]) * ux + (shBefore[1] - th[1]) * uy;
            const kneeLat = (shBefore[0] - th[0]) * nx + (shBefore[1] - th[1]) * ny;
            const femAng = Math.atan2(shBefore[1] - fe[1], shBefore[0] - fe[0]);
            const spineAng = Math.atan2(spDy, spDx);
            const femPastSpine = normalizeDeg((femAng - spineAng) / DEG) * -curSide;

            if (alongSpine > 200 && femPastSpine > 6 && kneeLat * -curSide > 35) {
              const ankleTarget = computeAnkleTargetBeforeShift();
              const nextFlip = !hip.flipX;
              const newCurSide = homeSide * (nextFlip ? -1 : 1);
              hip.flipX = nextFlip;
              femur.flipX = false;
              hip.ang = normalizeDeg(2 * spineDivDeg - hip.ang);
              snapFemurToAnkleTarget(ankleTarget);

              const rawCarry = (femur.ang - drag.femur0) * femOutwardSign;
              const newCarry = Math.max(0, rawCarry < -90 ? rawCarry + 360 : rawCarry);
              const newTotalOut = easedHipOutward + newCarry;
              drag.rawHip = spineDivDeg + (newCurSide === -1 ? newTotalOut : -newTotalOut);
              drag.hip0 = hip.ang;
              drag.flipped0 = nextFlip;

              window.clearTimeout(copyToastTimerRef.current);
              setCopyToast(
                `${drag.side === 'R' ? 'Right' : 'Left'} hip · switched past upper spine`,
              );
              copyToastTimerRef.current = window.setTimeout(() => setCopyToast(null), 1600);
            }
          }
        }

        if (ikCfg.mode !== 'fk') {
          applyBalanceAndPins(
            hip.id,
            drag.snap ?? null,
            rt.nodes,
            rt.by,
            rt.bondOn,
            rt.wingPop,
            ikCfg,
            ikPinsRef.current,
            rt.constrainLimits,
            'leg' + drag.side,
          );
        }
        syncUi();
        wake();
      }
      return;
    }

    if (drag.t === 'shoulder') {
      solveRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, rt.ribAnchor);
      const swivel = rt.by['swivel' + drag.side];
      const acromion = rt.by['acromion' + drag.side];
      const brace = rt.by['brace' + drag.side];
      if (swivel && acromion && brace) {
        const swPos = pos(swivel, rt.by);
        const neckPos = pos(brace, rt.by);
        const dSwivel = normalizeDeg((Math.atan2(q[1] - swPos[1], q[0] - swPos[0]) - drag.sSwivel) / DEG);
        const dNeck = normalizeDeg((Math.atan2(q[1] - neckPos[1], q[0] - neckPos[0]) - drag.sNeck) / DEG);

        if (drag.guide === 'wing') {
          swivel.ang = clampAnatomicalAngle(
            swivel,
            clampRealisticShoulder(swivel, drag.swivel0 + dSwivel, rt.by, rt.prometheusWings),
            rt.constrainLimits,
          );
          brace.ang = clampAnatomicalAngle(
            brace,
            clampRealisticShoulder(brace, drag.brace0 + dSwivel * 0.35, rt.by, rt.prometheusWings),
            rt.constrainLimits,
          );
          acromion.ang = clampAnatomicalAngle(
            acromion,
            clampRealisticShoulder(acromion, drag.acro0 - dSwivel * 0.45, rt.by, rt.prometheusWings),
            rt.constrainLimits,
          );
        } else if (drag.guide === 'tendon') {
          swivel.ang = clampAnatomicalAngle(
            swivel,
            clampRealisticShoulder(swivel, drag.swivel0 + dSwivel * 0.85, rt.by, rt.prometheusWings),
            rt.constrainLimits,
          );
          brace.ang = clampAnatomicalAngle(
            brace,
            clampRealisticShoulder(brace, drag.brace0 + dNeck * 0.55, rt.by, rt.prometheusWings),
            rt.constrainLimits,
          );
          acromion.ang = clampAnatomicalAngle(
            acromion,
            clampRealisticShoulder(acromion, drag.acro0 - dSwivel * 0.25, rt.by, rt.prometheusWings),
            rt.constrainLimits,
          );
        } else if (drag.guide === 'acromion') {
          acromion.ang = clampAnatomicalAngle(
            acromion,
            clampRealisticShoulder(acromion, drag.acro0 + dNeck * 0.9, rt.by, rt.prometheusWings),
            rt.constrainLimits,
          );
          swivel.ang = clampAnatomicalAngle(
            swivel,
            clampRealisticShoulder(swivel, drag.swivel0 + dSwivel * 0.55, rt.by, rt.prometheusWings),
            rt.constrainLimits,
          );
          brace.ang = clampAnatomicalAngle(
            brace,
            clampRealisticShoulder(brace, drag.brace0 + dSwivel * 0.25, rt.by, rt.prometheusWings),
            rt.constrainLimits,
          );
        } else {
          applyPrometheusArmCompensation(drag.side, rt.by, drag, dSwivel, dNeck, rt.constrainLimits);
        }
        if (ikCfg.mode !== 'fk') {
          applyBalanceAndPins(
            swivel.id,
            drag.snap ?? null,
            rt.nodes,
            rt.by,
            rt.bondOn,
            rt.wingPop,
            ikCfg,
            ikPinsRef.current,
            rt.constrainLimits,
          );
        }
        syncUi();
        wake();
      }
      return;
    }

    if (drag.t === 'rot' && drag.ikPending) {
      const pxMoved = Math.hypot(e.clientX - drag.ikPending.startX, e.clientY - drag.ikPending.startY);
      if (pxMoved > 6) {
        clearLongIkTimer();
      }
    }

    if (rt.sel.lock && rt.sel.parent) {
      solveRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, rt.ribAnchor);
      const par = rt.by[rt.sel.parent];
      const gp = parentOf(par, rt.by);
      const gpw = gp ? gp.w : [1, 0, 0, 1, 0, 0];
      const gpDetSign = gpw[0] * gpw[3] - gpw[1] * gpw[2] < 0 ? -1 : 1;
      const a = pos(par, rt.by);
      const t = pos(rt.sel, rt.by);
      const d = (Math.atan2(q[1] - a[1], q[0] - a[0]) - Math.atan2(t[1] - a[1], t[0] - a[0])) * gpDetSign;
      par.ang = clampAnatomicalAngle(
        par,
        clampRealisticShoulder(par, par.ang + d / DEG, rt.by, rt.prometheusWings),
        rt.constrainLimits,
      );
      syncUi();
      wake();
      return;
    }

    solveRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, rt.ribAnchor);
    const pp = pos(rt.sel, rt.by);
    const curAng = Math.atan2(q[1] - pp[1], q[0] - pp[0]);
    const stepDelta = normalizeDeg(((curAng - drag.s) / DEG) * drag.parDetSign);
    drag.s = curAng;
    drag.rawAng += stepDelta;
    const rawDelta = drag.rawAng - drag.a0;
    const rawIntent = normalizeDeg(drag.rawAng);

    // Arm cross-center slow-down resistance & 12.5% (45deg) elastic side-pose snap
    if (rt.sel.id === 'humerusR' || rt.sel.id === 'humerusL') {
      const isRightArm = rt.sel.id === 'humerusR';
      const inwardSign = isRightArm ? -1 : 1; // R swings inward with -ang, L swings inward with +ang
      const snapSide: 'R' | 'L' = isRightArm ? 'R' : 'L';
      const curSide = sidePoseRef.current;
      const prevHumerusAng = rt.sel.ang;

      if (curSide === null) {
        const inwardDeg = rawIntent * inwardSign;
        if (inwardDeg >= 45) {
          dragRef.current = null;
          triggerSidePoseSnap(snapSide);
          syncUi();
          return;
        }
        // Progressive slow-down resistance once arm crosses inward past 14 deg
        let visualAng = rawIntent;
        if (inwardDeg > 14) {
          const excess = inwardDeg - 14;
          const slowed = 14 + 17 * Math.tanh(excess / 24);
          visualAng = inwardSign * slowed;
        }
        rt.sel.ang = clampAnatomicalAngle(rt.sel, visualAng, rt.constrainLimits);
        if (rt.prometheusWings) {
          applyPrometheusWingFollowFromArm(
            snapSide,
            rt.by,
            normalizeDeg(rt.sel.ang - prevHumerusAng),
            rt.constrainLimits,
          );
        } else {
          // Subtle elastic shoulder pre-load follow while pushing against the resistance
          const sw = rt.by['swivel' + snapSide];
          if (sw && inwardDeg > 14) {
            const tension = Math.min(1, (inwardDeg - 14) / 31);
            sw.ang = clampRealisticShoulder(sw, inwardSign * -10 * tension, rt.by, false);
          }
        }
        syncUi();
        wake();
        return;
      }

      // Already in a Side Pose: pulling the arm 12.5% (45deg) back in the other direction snaps back to front
      const unwindDelta = rawDelta * (curSide === 'R' ? 1 : -1);
      if (unwindDelta >= 45) {
        dragRef.current = null;
        triggerSidePoseSnap(null);
        syncUi();
        return;
      }
      let visualAng = rawIntent;
      if (unwindDelta > 14) {
        const excess = unwindDelta - 14;
        const resistStep = 14 + 17 * Math.tanh(excess / 24);
        visualAng = normalizeDeg(drag.a0 + (curSide === 'R' ? resistStep : -resistStep));
      }
      rt.sel.ang = clampAnatomicalAngle(rt.sel, visualAng, rt.constrainLimits);
      if (rt.prometheusWings) {
        applyPrometheusWingFollowFromArm(
          snapSide,
          rt.by,
          normalizeDeg(rt.sel.ang - prevHumerusAng),
          rt.constrainLimits,
        );
      }
      syncUi();
      wake();
      return;
    }

    rt.sel.ang = clampAnatomicalAngle(
      rt.sel,
      clampChungusRibAngle(
        rt.sel.id,
        clampRealisticShoulder(rt.sel, rawIntent, rt.by, rt.prometheusWings),
        rt.ribAnchor,
        rt.by,
        rt.prometheusWings,
      ),
      rt.constrainLimits,
    );
    if (rt.ribAnchor === 'lower' && (rt.sel.id === 'ribR' || rt.sel.id === 'ribL')) {
      const oppRib = rt.by[rt.sel.id === 'ribR' ? 'ribL' : 'ribR'];
      if (oppRib) {
        oppRib.ang = clampChungusRibAngle(oppRib.id, -rt.sel.ang, 'lower', rt.by, rt.prometheusWings);
      }
    }
    if (ikCfg.mode !== 'fk') {
      applyBalanceAndPins(
        rt.sel.id,
        drag.snap ?? null,
        rt.nodes,
        rt.by,
        rt.bondOn,
        rt.wingPop,
        ikCfg,
        ikPinsRef.current,
        rt.constrainLimits,
      );
    }
    syncUi();
    wake();
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    clearLongIkTimer();
    const prevDrag = dragRef.current;
    dragRef.current = null;
    ikOverlayRef.current = {
      activeChainIds: null,
      targetPos: null,
      holdProgress: null,
      holdPos: null,
      elasticTethers: undefined,
    };
    const rt = rtRef.current;
    if (prevDrag?.t === 'headSwivel') {
      if (rt?.by.lip) rt.by.lip.ang = 0;
      const movedPx = Math.hypot(e.clientX - prevDrag.startX, e.clientY - prevDrag.startY);
      if (prevDrag.swiveledSteps === 0 && movedPx < 8) {
        stepHeadTurn(1);
      }
    }
    if (prevDrag?.t === 'persp' && prevDrag.what === 'ground' && rt && ikConfigRef.current.footGravity) {
      enforceGroundContact(rt.nodes, rt.by, rt.root, rt.bondOn, rt.wingPop, ikConfigRef.current.groundY, false);
    }

    const wasElasticPinDrag = prevDrag?.t === 'limbIk' && !!prevDrag.isElasticPin;
    if (wasElasticPinDrag && prevDrag && rt) {
      const fromAngles: Record<string, number> = {};
      rt.nodes.forEach((n) => {
        fromAngles[n.id] = n.ang;
      });
      snapSpringRef.current = {
        fromAngles,
        toAngles: { ...prevDrag.snapAngles },
        t0: performance.now(),
        dur: 380,
      };
      wake();
    } else {
      syncAllPinsToRig();
    }

    if (canvasRef.current) {
      const hp = hoverPerspRef.current;
      canvasRef.current.style.cursor =
        hp === 'vp' ? 'ew-resize' : hp ? 'ns-resize' : rt?.hov ? 'pointer' : 'crosshair';
    }
    syncUi();
    repaint();
  };

  const handleCanvasWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const rt = rtRef.current;
    const cv = canvasRef.current;
    if (!rt || !cv) return;
    rt.userView = true;
    const r = cv.getBoundingClientRect();
    const d = cv.width / r.width;
    const mx = (e.clientX - r.left) * d;
    const my = (e.clientY - r.top) * d;
    const k = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    rt.ox = mx - (mx - rt.ox) * k;
    rt.oy = my - (my - rt.oy) * k;
    rt.z *= k;
    clampRtCamera();
    wake();
  };

  const isNearWing = (q: [number, number], rt: RigRuntime): RigNode | null => {
    const wingHitR = (34 * rt.dpr) / rt.z;
    for (const id of ['wingL', 'wingR'] as const) {
      const wn = rt.by[id];
      if (!wn) continue;
      const wp = pos(wn, rt.by);
      if (Math.hypot(wp[0] - q[0], wp[1] - q[1]) <= wingHitR) return wn;
    }
    const pieceHit = hitTestPiece(q, rt.pieces, rt.wingPop);
    if (pieceHit?.piece.name === 'Backshoulder') {
      return rt.by[pieceHit.node.id === 'braceL' ? 'wingL' : 'wingR'] ?? pieceHit.node;
    }
    return null;
  };

  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rt = rtRef.current;
    if (!rt) return;
    solveRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, rt.ribAnchor);
    const q = toWorld(e);

    // 1. Wing toggle (2x click pops/tucks elastic Prometheus wings)
    const wn = isNearWing(q, rt);
    if (wn) {
      rt.prometheusWings = !rt.prometheusWings;
      rt.wingTarget = rt.prometheusWings ? 1 : 0;
      rt.sel = wn;
      sortPiecesForWings(rt.pieces, rt.prometheusWings);
      if (rt.ribAnchor === 'lower') {
        solveRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, rt.ribAnchor);
        applyChungusChestCavity(rt.by, rt.prometheusWings, rt.prometheusWings);
      }
      if (!rt.prometheusWings) {
        rt.nodes.forEach((n) => {
          n.ang = clampRealisticShoulder(n, n.ang, rt.by, false);
        });
      }
      window.clearTimeout(copyToastTimerRef.current);
      setCopyToast(
        rt.prometheusWings
          ? rt.ribAnchor === 'lower'
            ? 'Prometheus wings + Chungus chest cavity active'
            : 'Prometheus wings popped out (elastic)'
          : 'Prometheus wings tucked',
      );
      copyToastTimerRef.current = window.setTimeout(() => setCopyToast(null), 1600);
      syncUi();
      wake();
      return;
    }

    // 2. Generous hand & foot proximity checks so double-clicking opens Gotz Hand or Piggy Foot
    const handProxR = (78 * rt.dpr) / rt.z;
    for (const s of ['R', 'L'] as const) {
      const hn = rt.by['hand' + s];
      if (!hn) continue;
      const wp = pos(hn, rt.by);
      const ft = rt.by['fingerTip' + s];
      const palm = ft ? pos(ft, rt.by) : [wp[0], wp[1] + 400];
      const mx = (wp[0] + palm[0]) * 0.5;
      const my = (wp[1] + palm[1]) * 0.5;
      if (Math.hypot(wp[0] - q[0], wp[1] - q[1]) <= handProxR || Math.hypot(mx - q[0], my - q[1]) <= handProxR * 1.45) {
        rt.sel = hn;
        openPartForNode(hn);
        syncUi();
        wake();
        return;
      }
    }

    const footProxR = (76 * rt.dpr) / rt.z;
    for (const s of ['R', 'L'] as const) {
      const fn = rt.by['foot' + s];
      if (!fn) continue;
      const fp = pos(fn, rt.by);
      const tn = rt.by['toe' + s];
      const tip = tn ? pos(tn, rt.by) : [fp[0] + (s === 'R' ? -240 : 240), fp[1] + 220];
      const mx = (fp[0] + tip[0]) * 0.5;
      const my = (fp[1] + tip[1]) * 0.5;
      if (Math.hypot(fp[0] - q[0], fp[1] - q[1]) <= footProxR || Math.hypot(mx - q[0], my - q[1]) <= footProxR * 1.45) {
        rt.sel = fn;
        openPartForNode(fn);
        syncUi();
        wake();
        return;
      }
    }

    // 3. Fallback sprite pixel hit-test (skip double-cycling if click was on head swivel, since pointerUp cycles per click)
    if (rt.sel.id === 'lip' || rt.sel.id === 'chinTip') return;
    const hit = hitTest(q, rt.pieces, rt.wingPop);
    if (hit) openPartForNode(hit);
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    rightClickRef.current.count++;
    window.clearTimeout(rightClickRef.current.timer);
    rightClickRef.current.timer = window.setTimeout(() => {
      const n = rightClickRef.current.count;
      rightClickRef.current.count = 0;
      if (n === 2) void copyRawJson();
      else if (n >= 3) handleExportPng();
    }, 420);
  };

  const togglePanel = (id: PanelId) => {
    updatePanels((prev) => {
      const wasOpen = prev[id].open;
      return {
        ...prev,
        [id]: {
          ...prev[id],
          open: !wasOpen,
          zIndex: !wasOpen ? ++zCounterRef.current : prev[id].zIndex,
        },
      };
    });
  };

  const focusPanel = (id: PanelId) => {
    updatePanels((prev) => ({
      ...prev,
      [id]: { ...prev[id], zIndex: ++zCounterRef.current },
    }));
  };

  const rt = rtRef.current;
  const tgt = targetNode(rt);
  const bondStatus: BondStatusItem[] = rt ? getBondStatus(rt.nodes, rt.bondOn) : [];
  const canEditSelectedPart = !!(
    rt &&
    partMgrRef.current &&
    (rt.sel.id === 'handR' ||
      rt.sel.id === 'handL' ||
      rt.sel.id === 'footR' ||
      rt.sel.id === 'footL' ||
      rt.sel.id === 'toeR' ||
      rt.sel.id === 'toeL' ||
      rt.sel.parent === 'handR' ||
      rt.sel.parent === 'handL' ||
      rt.sel.id.startsWith('thumb') ||
      rt.sel.id.startsWith('finger'))
  );
  const selectedHandInst =
    rt && partMgrRef.current
      ? rt.sel.id === 'handR' || rt.sel.parent === 'handR' || rt.sel.id.endsWith('TipR') || rt.sel.id === 'thumbR' || rt.sel.id === 'fingerR'
        ? partMgrRef.current.inst.handR
        : rt.sel.id === 'handL' || rt.sel.parent === 'handL' || rt.sel.id.endsWith('TipL') || rt.sel.id === 'thumbL' || rt.sel.id === 'fingerL'
        ? partMgrRef.current.inst.handL
        : undefined
      : undefined;

  const activeHandScreenAngleDeg = (() => {
    if (!activePart || activePart.key !== 'hand' || !rt) return undefined;
    const hn = rt.by[activePart.id];
    if (!hn) return undefined;
    solveRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, rt.ribAnchor);
    const w = hn.w;
    return Math.round(normalizeDeg(Math.atan2(w[1], w[0]) / DEG + 180) * 10) / 10;
  })();

  // Trigger re-read whenever uiTick advances
  void uiTick;

  const panelHandlers = {
    onFocus: focusPanel,
    onToggleCollapse: (id: PanelId) =>
      updatePanels((p) => ({ ...p, [id]: { ...p[id], collapsed: !p[id].collapsed } })),
    onClose: (id: PanelId) => updatePanels((p) => ({ ...p, [id]: { ...p[id], open: false } })),
    onDragFloat: (id: PanelId, x: number, y: number) =>
      updatePanels((p) => ({ ...p, [id]: { ...p[id], floating: true, x, y } })),
    onDock: (id: PanelId) => updatePanels((p) => ({ ...p, [id]: { ...p[id], floating: false } })),
  };

  const renderPanelById = (id: PanelId) => {
    switch (id) {
      case 'pose':
        return (
          <FloatingPanel key={id} id="pose" title="Pose" layout={panels.pose} {...panelHandlers}>
            <PosePanel
              selected={rt?.sel ?? null}
              target={tgt}
              isRoot={!!(rt && rt.sel === rt.root)}
              rootTx={rt?.root.tx ?? 0}
              rootTy={rt?.root.ty ?? 0}
              bondOn={rt?.bondOn ?? true}
              constrainLimits={rt?.constrainLimits ?? false}
              prometheusWings={rt?.prometheusWings ?? false}
              bondStatus={bondStatus}
              canEditPart={canEditSelectedPart}
              ikMode={ikConfigRef.current.mode}
              ribAnchorMode={rt?.ribAnchor ?? 'upper'}
              onRibAnchorModeChange={(nextMode) => {
                if (!rt) return;
                const prevMode = rt.ribAnchor;
                if (prevMode === 'lower' && nextMode !== 'lower') {
                  applyChungusChestCavity(rt.by, false, rt.prometheusWings);
                }
                rt.ribAnchor = nextMode;
                applyRibAnchorMode(rt.by, nextMode, rt.prometheusWings);
                if (nextMode === 'lower') {
                  rt.prometheusWings = true;
                  rt.wingTarget = 1;
                  sortPiecesForWings(rt.pieces, true);
                  solveRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, 'lower');
                  applyChungusChestCavity(rt.by, true, true);
                  window.clearTimeout(copyToastTimerRef.current);
                  setCopyToast('Chungus Swing · Spine junction + elastic Prometheus wings');
                  copyToastTimerRef.current = window.setTimeout(() => setCopyToast(null), 1700);
                }
                syncUi();
                wake();
              }}
              skullView={rt?.skullView ?? 'front'}
              headTurnStep={rt?.headStep ?? 0}
              onHeadTurnStep={setHeadTurnStepExplicit}
              onSkullViewChange={(view) =>
                setHeadTurnStepExplicit(view === 'front' ? 0 : view === 'back' ? 2 : 1)
              }
              gotzPoseCode={selectedHandInst?.gotz ? getGotzPoseCode(selectedHandInst.gotz) : undefined}
              onQuickGotzPreset={
                selectedHandInst?.gotz
                  ? (presetName: string) => {
                      const mgr = partMgrRef.current;
                      if (!mgr || !selectedHandInst.gotz) return;
                      selectedHandInst.gotz = applyGotzPreset(selectedHandInst.gotz, presetName);
                      selectedHandInst.touched = 1;
                      mgr.rebake(selectedHandInst, wake);
                      syncUi();
                      wake();
                    }
                  : undefined
              }
              onOpenPartEditor={openPartForNode}
              onApplyPreset={(presetId) => {
                const builtins = createBuiltinChungusLibraryPoses();
                const entry = builtins.find((b) =>
                  presetId === 'promethean' ? b.id === 'builtin_promethean_chungus' : b.id === 'builtin_chungus',
                );
                if (entry) handleApplyLibraryPose(entry);
              }}
              onMirrorSide={(mode) => {
                if (!rt) return;
                mirrorPoseSide(rt.nodes, mode);
                if (!rt.prometheusWings) {
                  rt.nodes.forEach((n) => {
                    n.ang = clampRealisticShoulder(n, n.ang, rt.by, false);
                  });
                }
                ikPinsRef.current = syncPinsFromRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, ikPinsRef.current);
                syncUi();
                wake();
                window.clearTimeout(copyToastTimerRef.current);
                setCopyToast(mode === 'RtoLArms' ? 'Mirrored Right → Left arms' : 'Mirrored Left → Right side');
                copyToastTimerRef.current = window.setTimeout(() => setCopyToast(null), 1500);
              }}
              onAngleChange={(deg) => {
                if (!rt || !tgt) return;
                solveRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, rt.ribAnchor);
                tgt.ang = clampAnatomicalAngle(
                  tgt,
                  clampChungusRibAngle(
                    tgt.id,
                    clampRealisticShoulder(tgt, deg, rt.by, rt.prometheusWings),
                    rt.ribAnchor,
                    rt.by,
                    rt.prometheusWings,
                  ),
                  rt.constrainLimits,
                );
                if (rt.ribAnchor === 'lower' && (tgt.id === 'ribR' || tgt.id === 'ribL')) {
                  const oppRib = rt.by[tgt.id === 'ribR' ? 'ribL' : 'ribR'];
                  if (oppRib) {
                    oppRib.ang = clampChungusRibAngle(oppRib.id, -tgt.ang, 'lower', rt.by, rt.prometheusWings);
                  }
                }
                syncUi();
                wake();
              }}
              onRootOffset={(tx, ty) => {
                if (!rt) return;
                rt.root.tx = tx;
                rt.root.ty = ty;
                syncPerspectiveSpine();
                clampRtCamera();
                syncUi();
                wake();
              }}
              onToggleBond={() => {
                if (!rt) return;
                rt.bondOn = true;
                syncUi();
                wake();
              }}
              onToggleConstrainLimits={(v) => {
                if (!rt) return;
                rt.constrainLimits = v;
                if (v) {
                  rt.nodes.forEach((n) => {
                    n.ang = clampAnatomicalAngle(n, n.ang, true);
                  });
                }
                syncUi();
                wake();
              }}
              onTogglePrometheusWings={(v) => {
                if (!rt) return;
                rt.prometheusWings = v;
                rt.wingTarget = v ? 1 : 0;
                sortPiecesForWings(rt.pieces, v);
                if (rt.ribAnchor === 'lower') {
                  solveRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, 'lower');
                  applyChungusChestCavity(rt.by, v, v);
                }
                if (!v) {
                  rt.nodes.forEach((n) => {
                    n.ang = clampRealisticShoulder(n, n.ang, rt.by, false);
                  });
                }
                syncUi();
                wake();
              }}
              onResetJoint={() => {
                if (!rt) return;
                snapSpringRef.current = null;
                rt.sel.ang = 0;
                rt.sel.flipX = false;
                if (rt.sel.id === 'hipR' && rt.by.femurR) rt.by.femurR.flipX = false;
                if (rt.sel.id === 'hipL' && rt.by.femurL) rt.by.femurL.flipX = false;
                rt.sel.piv = rt.sel.rest.slice() as [number, number];
                if (rt.sel === rt.root) {
                  rt.root.tx = 0;
                  rt.root.ty = 0;
                }
                syncPerspectiveSpine();
                clampRtCamera();
                syncUi();
                wake();
              }}
              onResetPose={() => {
                if (!rt || !partMgrRef.current) return;
                snapSpringRef.current = null;
                sidePoseRef.current = null;
                rt.prometheusWings = false;
                rt.wingVel = 0;
                rt.wingTarget = 0;
                rt.ribAnchor = 'upper';
                rt.skullView = 'front';
                rt.headStep = 0;
                if (rt.by.head) applyHeadTurnStep(rt.by.head, 0, wake);
                for (const partId in partMgrRef.current.inst) {
                  partMgrRef.current.inst[partId].reset();
                }
                rt.nodes.forEach((n) => {
                  n.ang = 0;
                  n.flipX = false;
                  n.piv = n.rest.slice() as [number, number];
                });
                applyRibAnchorMode(rt.by, 'upper', false);
                rt.root.tx = 0;
                rt.root.ty = 0;
                perspRef.current = { ...PERSP_DEFAULT, enabled: perspRef.current.enabled };
                perspSpineBiasRef.current = { lumbar: 0, thorax: 0 };
                syncPerspectiveSpine();
                ikConfigRef.current = { ...ikConfigRef.current, groundY: PERSP_DEFAULT.groundY };
                ikPinsRef.current = syncPinsFromRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, {});
                clampRtCamera();
                syncUi();
                wake();
              }}
            />
          </FloatingPanel>
        );
      case 'bones':
        return (
          <FloatingPanel key={id} id="bones" title="Bones" layout={panels.bones} {...panelHandlers}>
            <BonesPanel
              nodes={rt?.nodes ?? []}
              selectedId={rt?.sel.id ?? null}
              onSelect={(node) => {
                if (!rt) return;
                rt.sel = node;
                syncUi();
                wake();
              }}
              onRotateNode={(node, nextDeg) => {
                if (!rt) return;
                stopAbcLoop();
                rt.sel = node;
                const tgtNode = node.lock && node.parent ? rt.by[node.parent] : node;
                tgtNode.ang = clampAnatomicalAngle(
                  tgtNode,
                  clampRealisticShoulder(tgtNode, nextDeg, rt.by, rt.prometheusWings),
                  rt.constrainLimits,
                );
                syncUi();
                wake();
              }}
              onHover={(node) => {
                if (!rt) return;
                if (rt.hov !== node) {
                  rt.hov = node;
                  repaint();
                }
              }}
            />
          </FloatingPanel>
        );
      case 'ik':
        return (
          <FloatingPanel key={id} id="ik" title="IK & FABRIK" layout={panels.ik} {...panelHandlers}>
            <IKPanel
              config={ikConfigRef.current}
              pins={ikPinsRef.current}
              persp={perspRef.current}
              onTogglePersp={(enabled) => {
                perspRef.current = { ...perspRef.current, enabled };
                if (!enabled) hoverPerspRef.current = null;
                syncPerspectiveSpine();
                syncUi();
                wake();
              }}
              onResetPersp={() => {
                perspRef.current = { ...PERSP_DEFAULT, enabled: true };
                ikConfigRef.current = { ...ikConfigRef.current, groundY: PERSP_DEFAULT.groundY };
                if (rt && ikConfigRef.current.footGravity) {
                  enforceGroundContact(rt.nodes, rt.by, rt.root, rt.bondOn, rt.wingPop, ikConfigRef.current.groundY, false);
                  syncAllPinsToRig();
                }
                syncPerspectiveSpine();
                syncUi();
                wake();
              }}
              onUpdateConfig={handleUpdateIkConfig}
              onTogglePin={(effectorId) => {
                if (!rt) return;
                solveRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, rt.ribAnchor);
                const n = rt.by[effectorId];
                if (!n) return;
                const tip = tipNodeForEffector(effectorId, rt.by);
                const prev = ikPinsRef.current[effectorId];
                ikPinsRef.current = {
                  ...ikPinsRef.current,
                  [effectorId]: {
                    pos: pos(n, rt.by),
                    endDir: getWorldDir(n, tip ? tip.piv : null, rt.by),
                    pinned: !(prev?.pinned ?? false),
                  },
                };
                syncUi();
                wake();
              }}
              onSyncPins={() => {
                syncAllPinsToRig();
                syncUi();
                wake();
              }}
              onClearPins={() => {
                const cleared: Record<string, IKPinEntry> = {};
                for (const k of Object.keys(ikPinsRef.current)) {
                  cleared[k] = { ...ikPinsRef.current[k], pinned: false };
                }
                ikPinsRef.current = cleared;
                syncUi();
                wake();
              }}
              onFlipBend={(chainId) => {
                if (!rt) return;
                const chain = LIMB_CHAINS.find((c) => c.id === chainId);
                if (!chain) return;
                const cur = ikConfigRef.current.bendOverrides[chainId] ?? chain.bendSign;
                const nextBend = cur > 0 ? -1 : 1;
                ikConfigRef.current = {
                  ...ikConfigRef.current,
                  bendOverrides: { ...ikConfigRef.current.bendOverrides, [chainId]: nextBend },
                };
                if (ikConfigRef.current.mode !== 'fk') {
                  const E = rt.by[chain.effector];
                  if (E) {
                    solveRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, rt.ribAnchor);
                    const ePos = pos(E, rt.by);
                    const tip = tipNodeForEffector(E.id, rt.by);
                    const dir0 = getWorldDir(E, tip ? tip.piv : null, rt.by);
                    solveLimbChain(
                      chain,
                      ePos,
                      rt.nodes,
                      rt.by,
                      rt.bondOn,
                      rt.wingPop,
                      ikConfigRef.current,
                      rt.constrainLimits,
                      nextBend,
                    );
                    if (tip) setWorldDirExact(E, tip.piv, dir0, rt.by);
                    syncAllPinsToRig();
                  }
                }
                syncUi();
                wake();
              }}
              onSnapToFloor={() => {
                if (!rt) return;
                enforceGroundContact(
                  rt.nodes,
                  rt.by,
                  rt.root,
                  rt.bondOn,
                  rt.wingPop,
                  ikConfigRef.current.groundY,
                  true,
                );
                syncAllPinsToRig();
                syncUi();
                wake();
              }}
              onResetIkDefaults={() => {
                ikConfigRef.current = { ...DEFAULT_IK_CONFIG };
                perspRef.current = { ...PERSP_DEFAULT, enabled: perspRef.current.enabled };
                const cleared: Record<string, IKPinEntry> = {};
                for (const k of Object.keys(ikPinsRef.current)) {
                  cleared[k] = { ...ikPinsRef.current[k], pinned: false };
                }
                ikPinsRef.current = cleared;
                syncUi();
                wake();
              }}
            />
          </FloatingPanel>
        );
      case 'tl':
        return (
          <FloatingPanel key={id} id="tl" title="ABC Keyframes" layout={panels.tl} {...panelHandlers}>
            <TimelinePanel
              abc={abcRef.current}
              playing={abcPlaying}
              scrubProgress={abcScrubRef.current}
              savedPoses={savedPoses}
              onCaptureSlot={handleCaptureAbcSlot}
              onGenerateProceduralB={handleGenerateProceduralAbcB}
              onJumpSlot={handleJumpAbcSlot}
              onClearSlots={() => {
                stopAbcLoop();
                abcRef.current.poses = { A: null, B: null, C: null };
                abcRef.current.activeSlot = 'A';
                abcScrubRef.current = 0;
                syncUi();
                wake();
              }}
              onStep={handleStepAbc}
              onToggleLoopPlay={handleToggleAbcLoop}
              onLoopModeChange={(loopMode: AbcLoopMode) => {
                abcRef.current.loopMode = loopMode;
                syncUi();
              }}
              onFeelChange={(feel: MotionFeel) => {
                abcRef.current.feel = feel;
                syncUi();
              }}
              onUpdateSettings={(patch: Partial<MotionSettings>) => {
                abcRef.current.settings = { ...abcRef.current.settings, ...patch };
                syncUi();
              }}
              onToggleGhost={(visible) => {
                abcRef.current.ghostVisible = visible;
                syncUi();
                repaint();
              }}
              onGhostOpacityChange={(opacity) => {
                abcRef.current.ghostOpacity = opacity;
                syncUi();
                repaint();
              }}
              onSnapFramesChange={(frames) => {
                abcRef.current.snapFrames = frames;
                syncUi();
              }}
              onFpsChange={(fps) => {
                abcRef.current.fps = fps;
                syncUi();
              }}
              onToggleSteppedFps={(stepped) => {
                abcRef.current.steppedFps = stepped;
                syncUi();
              }}
              onSkullTurnTimingChange={(timing: SkullTurnTiming) => {
                abcRef.current.skullTurnTiming = timing;
                syncUi();
              }}
              onScrubCycle={handleScrubAbcCycle}
              onQuickSaveToLibrary={() => handleSavePoseToLibrary()}
              onApplyLibraryPose={handleApplyLibraryPose}
              onLoadLibraryPoseToSlot={handleLoadLibraryPoseToSlot}
              onOpenLibraryTab={() => {
                updatePanels((p) => ({
                  ...p,
                  library: { ...p.library, open: true, collapsed: false, zIndex: ++zCounterRef.current },
                }));
              }}
            />
          </FloatingPanel>
        );
      case 'library':
        return (
          <FloatingPanel key={id} id="library" title="Pose Library" layout={panels.library} {...panelHandlers}>
            <PoseLibraryPanel
              savedPoses={savedPoses}
              onSavePose={handleSavePoseToLibrary}
              onApplyPose={handleApplyLibraryPose}
              onLoadToSlot={handleLoadLibraryPoseToSlot}
              onOverwritePose={handleOverwriteLibraryPose}
              onRenamePose={handleRenameLibraryPose}
              onDeletePose={handleDeleteLibraryPose}
            />
          </FloatingPanel>
        );
      case 'data':
        return (
          <FloatingPanel key={id} id="data" title="Data" layout={panels.data} {...panelHandlers}>
            <DataPanel
              jsonText={jsonText}
              onJsonTextChange={(val) => {
                benchmarkMsgRef.current = false;
                setJsonText(val);
              }}
              onJsonFocusChange={(focused) => {
                jsonEditingRef.current = focused;
                if (!focused && !benchmarkMsgRef.current) {
                  const live = buildJsonString();
                  if (live) setJsonText(live);
                }
              }}
              onLoadBsk={async (file) => {
                try {
                  const text = await file.text();
                  const def = parseBskJson(JSON.parse(text));
                  benchmarkMsgRef.current = false;
                  loadRigDefinition(def, false);
                } catch (err) {
                  benchmarkMsgRef.current = true;
                  setJsonText(`Could not load skeleton: ${err instanceof Error ? err.message : String(err)}`);
                }
              }}
              onExportBsk={() => {
                if (!rt) return;
                const data = exportBskJson(rt.nodes, rt.by, rt.W, rt.H);
                downloadBlob(
                  'bitruvius.bsk.json',
                  new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }),
                );
              }}
              onDemoRig={() => {
                if (rawBaseRigRef.current) {
                  benchmarkMsgRef.current = false;
                  loadRigDefinition(rawBaseRigRef.current, true);
                }
              }}
              onBenchmark={() => {
                if (!rt || !canvasRef.current) return;
                const cv = canvasRef.current;
                const ctx = cv.getContext('2d', { alpha: false });
                if (!ctx) return;
                const old = rt.nodes.map((n) => n.ang);
                const ts: number[] = [];
                let i = 0;
                const step = () => {
                  rt.nodes.forEach((n, k) => {
                    n.ang = old[k] + Math.sin(i / 20 + k) * 12;
                  });
                  const s = performance.now();
                  solveRig(rt.nodes, rt.by, rt.bondOn, rt.wingPop, rt.ribAnchor);
                  rendererRef.current.render({
                    cv,
                    ctx,
                    nodes: rt.nodes,
                    by: rt.by,
                    pieces: rt.pieces,
                    sel: rt.sel,
                    hov: null,
                    W: rt.W,
                    H: rt.H,
                    z: rt.z,
                    ox: rt.ox,
                    oy: rt.oy,
                    dpr: rt.dpr,
                    mode: rt.mode,
                    showBones: rt.showBones,
                    showGuides: rt.showGuides,
                    constrainLimits: rt.constrainLimits,
                    bondOn: rt.bondOn,
                    isActiveMotion: false,
                    actUntil: 0,
                    bgColor: '#121315',
                    wingPop: rt.wingPop,
                  });
                  ts.push(performance.now() - s);
                  if (++i < 240) {
                    requestAnimationFrame(step);
                  } else {
                    rt.nodes.forEach((n, k) => {
                      n.ang = old[k];
                    });
                    ts.sort((a, b) => a - b);
                    const av = ts.reduce((a, b) => a + b) / ts.length;
                    const p95 = ts[Math.floor(ts.length * 0.95)];
                    benchmarkMsgRef.current = true;
                    setJsonText(
                      `Benchmark (240 full redraws, ${rt.pieces.length} sprites): avg ${av.toFixed(
                        2,
                      )} ms, p95 ${p95.toFixed(2)} ms → ~${Math.round(1000 / Math.max(av, 0.01))} fps CPU ceiling`,
                    );
                    wake();
                  }
                };
                step();
              }}
              onGetJson={() => {
                benchmarkMsgRef.current = false;
                setJsonText(buildJsonString());
              }}
              onCopyJson={() => void copyRawJson()}
              onApplyJson={() => applyJsonInput(jsonText)}
            />
          </FloatingPanel>
        );
      case 'roadmap':
        return (
          <FloatingPanel key={id} id="roadmap" title="GitHub Parity Roadmap" layout={panels.roadmap} {...panelHandlers}>
            <RoadmapPanel />
          </FloatingPanel>
        );
      case 'about':
        return (
          <FloatingPanel key={id} id="about" title="About Bitruvius" layout={panels.about} {...panelHandlers}>
            <AboutPanel />
          </FloatingPanel>
        );
    }
  };

  const panelOrder: PanelId[] = ['pose', 'bones', 'ik', 'tl', 'library', 'data', 'roadmap', 'about'];
  const dockedPanelIds = panelOrder.filter((id) => panels[id].open && !panels[id].floating);
  const floatingPanelIds = panelOrder.filter((id) => panels[id].open && panels[id].floating);
  const horizonScreenY =
    rt && perspRef.current.enabled
      ? (perspRef.current.horizonY * rt.z + rt.oy) / rt.dpr
      : null;
  const groundScreenY =
    rt && perspRef.current.enabled
      ? (perspRef.current.groundY * rt.z + rt.oy) / rt.dpr
      : null;

  return (
    <div
      className="flex h-[100dvh] w-screen flex-col overflow-hidden bg-[#121315] text-[#e6e8ec] select-none"
      onPointerDownCapture={() => {
        if (!backdropDismissedRef.current) {
          backdropDismissedRef.current = true;
          wake();
        }
      }}
    >
      {/* Single-Row Top Toolbar (never wraps over the model) */}
      <RigSystemsPanel
        panels={panels}
        mode={rt?.mode ?? 'A'}
        ikMode={ikConfigRef.current.mode}
        showBones={rt?.showBones ?? true}
        showGuides={rt?.showGuides ?? false}
        showPersp={perspRef.current.enabled}
        onTogglePanel={togglePanel}
        onModeChange={(m) => {
          if (!rt) return;
          rt.mode = m;
          if (m === 'D') rt.showBones = true;
          syncUi();
          wake();
        }}
        onIkModeChange={(ikMode: IKMode) => handleUpdateIkConfig({ mode: ikMode })}
        onToggleBones={(v) => {
          if (!rt) return;
          rt.showBones = v;
          syncUi();
          wake();
        }}
        onToggleGuides={(v) => {
          if (!rt) return;
          rt.showGuides = v;
          syncUi();
          wake();
        }}
        onTogglePersp={(v) => {
          perspRef.current = { ...perspRef.current, enabled: v };
          if (!v) hoverPerspRef.current = null;
          syncPerspectiveSpine();
          syncUi();
          wake();
        }}
        onFit={() => {
          if (!rt) return;
          rt.userView = false;
          fitCanvas();
        }}
      />

      {/* Main Workspace: Stage Flex-Container + Modular On-Canvas Split Part Pop-Up with Top/Bottom Room Sliders */}
      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#121315]">
        {activePart && (
          <div className="flex h-7 shrink-0 items-center justify-center gap-3 border-b border-[#2b2f36] bg-[#16181c] px-3 text-[11px] text-[#c7cbd3]">
            <span className="font-medium text-[#34d399]">Model Room</span>
            <input
              type="range"
              min={28}
              max={72}
              value={modelSplitPct}
              onChange={(e) => setModelSplitPct(+e.target.value)}
              aria-label="Top room slider between Model and Hand/Foot"
              className="studio-range w-48 max-w-[44vw]"
            />
            <span className="font-medium text-[#c084fc]">
              {activePart.key === 'foot' ? 'Foot Room' : 'Hand Room'}
            </span>
          </div>
        )}

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col sm:flex-row">
          {/* Stage Flex-Container */}
          <div
            ref={stageRef}
            style={activePart ? { flexBasis: `${modelSplitPct}%`, flexGrow: 0, flexShrink: 0 } : undefined}
            className={`relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden bg-[#121315] ${
              activePart ? 'min-h-[34%] sm:h-full' : 'h-full w-full flex-1'
            }`}
          >
            <canvas
              ref={canvasRef}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerCancel={handleCanvasPointerUp}
              onPointerLeave={() => {
                const changed = !!(rtRef.current?.hov || hoverPerspRef.current);
                if (rtRef.current) rtRef.current.hov = null;
                hoverPerspRef.current = null;
                if (canvasRef.current) canvasRef.current.style.cursor = 'crosshair';
                if (changed) repaint();
              }}
              onWheel={handleCanvasWheel}
              onDoubleClick={handleCanvasDoubleClick}
              onContextMenu={handleContextMenu}
              className="block h-full w-full max-h-full max-w-full touch-none cursor-crosshair"
            />

            <StageHud
              showPersp={perspRef.current.enabled}
              horizonScreenY={horizonScreenY}
              groundScreenY={groundScreenY}
              hoverPersp={hoverPerspRef.current}
              draggingPersp={dragRef.current?.t === 'persp' ? dragRef.current.what : null}
              showStats={showStats}
              hudText={hudText}
              copyToast={copyToast}
              safeHudInset={safeHudInset}
              ikMode={ikConfigRef.current.mode}
              elasticPinFull={ikConfigRef.current.elasticPinFull}
              onToggleElasticPinFull={() =>
                handleUpdateIkConfig({ elasticPinFull: !ikConfigRef.current.elasticPinFull })
              }
            />
          </div>

          {/* Modular On-Canvas Gotz Hand / Piggy Foot Pop-Up (live syncs onto main model pushed cleanly beside it) */}
          {activePart && (
            <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center border-t border-[#2b2f36] bg-[#14161a] p-2 sm:border-t-0 sm:border-l">
              <div style={{ height: `${partHeightPct}%` }} className="w-full min-h-[210px] overflow-hidden">
                <PartRigModal
                  part={activePart}
                  screenAngleDeg={activeHandScreenAngleDeg}
                  forearmAngleDeg={
                    activePart.key === 'hand' && rt
                      ? rt.by[activePart.id === 'handR' ? 'forearmR' : 'forearmL']?.ang
                      : undefined
                  }
                  onForearmAngleChange={
                    activePart.key === 'hand'
                      ? (deg) => {
                          const curRt = rtRef.current;
                          if (!curRt) return;
                          const fn = curRt.by[activePart.id === 'handR' ? 'forearmR' : 'forearmL'];
                          if (!fn) return;
                          fn.ang = clampAnatomicalAngle(fn, deg, curRt.constrainLimits);
                          solveRig(curRt.nodes, curRt.by, curRt.bondOn, curRt.wingPop, curRt.ribAnchor);
                          syncUi();
                          wake();
                        }
                      : undefined
                  }
                  onClose={() => setActivePart(null)}
                  onMutated={(part) => {
                    const curRt = rtRef.current;
                    const mgr = partMgrRef.current;
                    if (!curRt || !mgr) return;
                    part.touched = 1;
                    mgr.linkOut(part, curRt.by);
                    mgr.rebake(part, wake);
                    syncUi();
                  }}
                />
              </div>
            </div>
          )}

          {/* Non-Squeezing Docked Panels Overlay (side rail >=520px, bottom drawer <520px) */}
          {dockedPanelIds.length > 0 && (
            <aside
              ref={asideRef}
              className="pointer-events-none absolute right-2 bottom-2 left-2 z-20 flex max-h-[36dvh] flex-col gap-2 overflow-y-auto min-[520px]:top-2 min-[520px]:bottom-auto min-[520px]:left-auto min-[520px]:max-h-[calc(100%-16px)] min-[520px]:w-[min(252px,44vw)] md:w-[min(280px,38vw)] lg:w-[304px]"
            >
              {dockedPanelIds.map((id) => renderPanelById(id))}
            </aside>
          )}
        </div>

        {activePart && (
          <div className="flex h-7 shrink-0 items-center justify-center gap-3 border-t border-[#2b2f36] bg-[#16181c] px-3 text-[11px] text-[#c7cbd3]">
            <span className="font-medium text-[#34d399]">Compact Popup</span>
            <input
              type="range"
              min={56}
              max={100}
              value={partHeightPct}
              onChange={(e) => setPartHeightPct(+e.target.value)}
              aria-label="Bottom room slider for Hand/Foot popup height"
              className="studio-range w-48 max-w-[44vw]"
            />
            <span className="font-medium text-[#c084fc]">
              Full {activePart.key === 'foot' ? 'Foot' : 'Hand'}
            </span>
          </div>
        )}
      </main>

      {/* Floating (Detached) Panels Layer */}
      {floatingPanelIds.length > 0 && (
        <div className="pointer-events-none fixed inset-0 z-40">
          {floatingPanelIds.map((id) => renderPanelById(id))}
        </div>
      )}

      {/* Single Compact In-Flow Bottom Menu (Canonical 43-joint RigStatePayload + Copy/Apply + JSON/PNG Export + Stats) */}
      <TimelineDock
        jsonText={jsonText}
        showStats={showStats}
        canonicalKeyCount={rt?.canonicalKeys.length ?? 0}
        onJsonChange={(val) => {
          benchmarkMsgRef.current = false;
          setJsonText(val);
        }}
        onJsonFocusChange={(focused) => {
          jsonEditingRef.current = focused;
          if (!focused && !benchmarkMsgRef.current) {
            const live = buildJsonString();
            if (live) setJsonText(live);
          }
        }}
        onCopyJson={() => void copyRawJson()}
        onApplyJson={applyJsonInput}
        onExportJson={handleExportJson}
        onExportPng={handleExportPng}
        onToggleStats={() => {
          setShowStats((s) => !s);
          wake();
        }}
      />

      {/* Loading / Error State */}
      {loading && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[#121315]/90">
          <div className="rounded-lg border border-[#2b2f36] bg-[#191b1f] px-5 py-3 text-[13px] text-[#c7cbd3]">
            Decoding Vitruvian FK rig assets…
          </div>
        </div>
      )}
      {loadError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#121315]/95">
          <div className="rounded-lg border border-[#ff3b6b] bg-[#191b1f] px-5 py-4 text-[13px] text-[#ff6b8f]">
            Failed to load rig data: {loadError}
          </div>
        </div>
      )}
    </div>
  );
}
