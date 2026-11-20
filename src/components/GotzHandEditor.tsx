import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GOTZ_BUILDS,
  GOTZ_DIGITS,
  GOTZ_PRESETS,
  GOTZ_PROPS_ANAT,
  GOTZ_PROPS_LEG,
  type GotzBuild,
  type GotzDigitId,
  type GotzHandState,
  type GotzLayerOrder,
  type GotzLimitsMode,
  type GotzStyle,
  applyGotzPreset,
  buildGotzHierarchyTree,
  cloneGotzState,
  enforceGotzLayerOrder,
  getGotzPoseCode,
  gotzBoneSvgPath,
  gotzCurlBounds,
  gotzRotBounds,
  solveGotzDigitIk,
  solveGotzHand,
} from '../engine/gotzHandEngine';
import type { PartRigInstance } from '../engine/types';

interface GotzHandEditorProps {
  part: PartRigInstance;
  onClose: () => void;
  onMutated: (part: PartRigInstance) => void;
  screenAngleDeg?: number;
}

const PRESET_NAMES = Object.keys(GOTZ_PRESETS);

const BUILD_OPTIONS: Array<{ id: GotzBuild; label: string }> = [
  { id: 'standard', label: '5F' },
  { id: 'claw', label: 'Claw' },
  { id: 'trident', label: 'Trident' },
  { id: 'mickey', label: 'Mickey' },
];

const LIMIT_OPTIONS: Array<{ id: GotzLimitsMode; label: string }> = [
  { id: 'realistic', label: 'Realistic' },
  { id: 'elastic', label: 'Elastic' },
  { id: 'expert', label: 'Expert' },
];

const LAYER_OPTIONS: Array<{ id: GotzLayerOrder; label: string }> = [
  { id: 'free', label: 'Free' },
  { id: 'rigid', label: 'Rigid' },
  { id: 'rigid-reverse', label: 'Rev' },
];

const STYLE_OPTIONS: Array<{ id: GotzStyle; label: string }> = [
  { id: 'hand-app-1', label: 'Studio' },
  { id: 'hand-app-2', label: 'Sculpt' },
  { id: 'legacy', label: 'Octagon' },
];

export const GotzHandEditor: React.FC<GotzHandEditorProps> = ({ part, onClose, onMutated, screenAngleDeg }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const handGroupRef = useRef<SVGGElement>(null);
  const wheelRef = useRef<SVGSVGElement>(null);
  const undoRef = useRef<GotzHandState[]>([]);
  const redoRef = useRef<GotzHandState[]>([]);
  const [alignToScreen, setAlignToScreen] = useState<boolean>(true);
  const dragRef = useRef<{
    digit: GotzDigitId;
    endPtIdx: number;
    snapshotSaved: boolean;
  } | null>(null);
  const wheelDragRef = useRef<{ startAng: number; wrist0: number; snapshotSaved: boolean } | null>(null);

  const [selectedBoneId, setSelectedBoneId] = useState<string>('wrist');
  const [collapsedDigits, setCollapsedDigits] = useState<Set<string>>(() => new Set());
  const [hoveredBoneId, setHoveredBoneId] = useState<string | null>(null);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const st = part.gotz!;
  const propsModel = part.propsModel === 'leg' ? GOTZ_PROPS_LEG : GOTZ_PROPS_ANAT;
  const activeDigits = GOTZ_BUILDS[st.build] || GOTZ_DIGITS;

  const pushUndo = useCallback((snapshot: GotzHandState) => {
    undoRef.current.push(cloneGotzState(snapshot));
    if (undoRef.current.length > 40) undoRef.current.shift();
    redoRef.current = [];
  }, []);

  const commitChange = useCallback(
    (mutate: (next: GotzHandState) => void, recordUndo = true) => {
      if (!part.gotz) return;
      if (recordUndo) {
        pushUndo(part.gotz);
      }
      const next = cloneGotzState(part.gotz);
      mutate(next);
      part.gotz = next;
      part.touched = 1;
      onMutated(part);
      setTick((t) => t + 1);
    },
    [onMutated, part, pushUndo],
  );

  const handleUndo = useCallback(() => {
    if (!part.gotz || !undoRef.current.length) return;
    redoRef.current.push(cloneGotzState(part.gotz));
    part.gotz = undoRef.current.pop()!;
    part.touched = 1;
    onMutated(part);
    setTick((t) => t + 1);
  }, [onMutated, part]);

  const handleRedo = useCallback(() => {
    if (!part.gotz || !redoRef.current.length) return;
    undoRef.current.push(cloneGotzState(part.gotz));
    part.gotz = redoRef.current.pop()!;
    part.touched = 1;
    onMutated(part);
    setTick((t) => t + 1);
  }, [onMutated, part]);

  useEffect(() => {
    undoRef.current = [];
    redoRef.current = [];
    setSelectedBoneId('wrist');
    setTick((t) => t + 1);
  }, [part]);

  const solved = useMemo(() => solveGotzHand(st, propsModel), [st, propsModel]);
  const tree = useMemo(() => buildGotzHierarchyTree(st), [st]);
  const poseCode = useMemo(() => getGotzPoseCode(st), [st]);

  const toGotzCoords = (e: React.PointerEvent<SVGSVGElement>): [number, number] | null => {
    const group = handGroupRef.current;
    if (!group) return null;
    const ctm = group.getScreenCTM();
    if (!ctm) return null;
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const local = pt.matrixTransform(ctm.inverse());
    return [local.x, local.y];
  };

  const findNearestTarget = (gx: number, gy: number): { digit: GotzDigitId; endPtIdx: number } | null => {
    let best: { digit: GotzDigitId; endPtIdx: number } | null = null;
    let bestDist = 1.25;
    for (const d of activeDigits) {
      const pts = solved[d].pts;
      for (let idx = 1; idx < pts.length; idx++) {
        const dist = Math.hypot(pts[idx][0] - gx, pts[idx][1] - gy);
        if (dist < bestDist) {
          bestDist = dist;
          best = { digit: d, endPtIdx: idx };
        }
      }
    }
    return best;
  };

  const handleStagePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const coords = toGotzCoords(e);
    if (!coords) return;
    const hit = findNearestTarget(coords[0], coords[1]);
    if (!hit) return;
    svg.setPointerCapture(e.pointerId);
    setSelectedBoneId(`${hit.digit}:${hit.endPtIdx - 1}`);
    dragRef.current = {
      digit: hit.digit,
      endPtIdx: hit.endPtIdx,
      snapshotSaved: false,
    };
  };

  const handleStagePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const coords = toGotzCoords(e);
    if (!coords) return;
    const drag = dragRef.current;
    if (!drag) {
      const hoverHit = findNearestTarget(coords[0], coords[1]);
      const nextHov = hoverHit ? `${hoverHit.digit}:${hoverHit.endPtIdx - 1}` : null;
      if (nextHov !== hoveredBoneId) setHoveredBoneId(nextHov);
      return;
    }
    if (!drag.snapshotSaved && part.gotz) {
      pushUndo(part.gotz);
      drag.snapshotSaved = true;
    }
    const next = cloneGotzState(part.gotz!);
    solveGotzDigitIk(drag.digit, drag.endPtIdx, coords[0], coords[1], next, propsModel);
    part.gotz = next;
    part.touched = 1;
    onMutated(part);
    setTick((t) => t + 1);
  };

  const handleStagePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (svg && svg.hasPointerCapture(e.pointerId)) {
      svg.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
  };

  const handleContextMenu = (e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (!part.gotz) return;
    const payload = JSON.stringify({ partId: part.id, gotz: part.gotz }, null, 2);
    let ok = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(payload).then(() => {}, () => {});
      ok = true;
    } else {
      try {
        const ta = document.createElement('textarea');
        ta.value = payload;
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
    setCopyToast(ok ? 'Hand pose data saved to clipboard' : 'Hand pose data ready');
    window.setTimeout(() => setCopyToast(null), 1800);
  };

  const handleWheelPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const wsvg = wheelRef.current;
    if (!wsvg || !part.gotz) return;
    wsvg.setPointerCapture(e.pointerId);
    const r = wsvg.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    wheelDragRef.current = {
      startAng: Math.atan2(e.clientY - cy, e.clientX - cx),
      wrist0: part.gotz.wrist,
      snapshotSaved: false,
    };
  };

  const handleWheelPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const wd = wheelDragRef.current;
    const wsvg = wheelRef.current;
    if (!wd || !wsvg || !part.gotz) return;
    const r = wsvg.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const cur = Math.atan2(e.clientY - cy, e.clientX - cx);
    let dRad = cur - wd.startAng;
    while (dRad > Math.PI) dRad -= Math.PI * 2;
    while (dRad < -Math.PI) dRad += Math.PI * 2;
    const deg = (dRad * 180) / Math.PI;
    if (!wd.snapshotSaved) {
      pushUndo(part.gotz);
      wd.snapshotSaved = true;
    }
    const nextWrist = Math.max(-90, Math.min(90, wd.wrist0 + deg));
    part.gotz = { ...cloneGotzState(part.gotz), wrist: Math.round(nextWrist * 10) / 10 };
    part.touched = 1;
    onMutated(part);
    setTick((t) => t + 1);
  };

  const handleWheelPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const wsvg = wheelRef.current;
    if (wsvg && wsvg.hasPointerCapture(e.pointerId)) {
      wsvg.releasePointerCapture(e.pointerId);
    }
    wheelDragRef.current = null;
  };

  // Determine selected bone inspector control
  const selectedBoneInfo = useMemo(() => {
    if (selectedBoneId === 'wrist') {
      return {
        label: 'Wrist / Carpal Hub',
        value: st.wrist,
        min: -90,
        max: 90,
        onChange: (val: number) =>
          commitChange((next) => {
            next.wrist = val;
          }, false),
      };
    }
    const [dStr, bStr] = selectedBoneId.split(':');
    const digit = dStr as GotzDigitId;
    const bIdx = Number(bStr);
    if (!GOTZ_DIGITS.includes(digit) || Number.isNaN(bIdx)) return null;
    if (bIdx === 0) {
      const [lo, hi] = gotzRotBounds(digit, st.limits);
      return {
        label: `${digit[0].toUpperCase() + digit.slice(1)} Metacarpal (rot)`,
        value: st.rot[digit] || 0,
        min: lo,
        max: hi,
        onChange: (val: number) =>
          commitChange((next) => {
            next.rot[digit] = val;
            enforceGotzLayerOrder(digit, next);
          }, false),
      };
    }
    const cIdx = bIdx - 1;
    const [cLo, cHi] = gotzCurlBounds(digit, cIdx, st.limits);
    const segName =
      digit === 'thumb'
        ? cIdx === 0
          ? 'Proximal'
          : 'Distal'
        : ['Proximal', 'Middle', 'Distal'][cIdx] || `Phalanx ${cIdx}`;
    return {
      label: `${digit[0].toUpperCase() + digit.slice(1)} ${segName}`,
      value: st.cj[digit]?.[cIdx] ?? 0,
      min: cLo,
      max: cHi,
      onChange: (val: number) =>
        commitChange((next) => {
          if (next.cj[digit] && cIdx < next.cj[digit].length) {
            next.cj[digit][cIdx] = val;
          }
        }, false),
    };
  }, [commitChange, selectedBoneId, st]);

  // Palm web polygon from wrist + metacarpal heads
  const palmWebPoints = useMemo(() => {
    const heads = activeDigits.filter((d) => d !== 'thumb').map((d) => solved[d].pts[1]);
    if (heads.length < 2) return '';
    return [[0, 0], ...heads].map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ');
  }, [activeDigits, solved]);

  // Visible tree entries (respecting collapsed digit groups)
  const visibleTree = useMemo(() => {
    return tree.filter((b) => {
      if (b.digit === 'wrist' || b.boneIdx === 0) return true;
      return !collapsedDigits.has(b.digit);
    });
  }, [collapsedDigits, tree]);

  return (
    <div className="fixed inset-2 z-40 flex flex-col overflow-hidden rounded-lg border border-[#2b2f36] bg-[#191b1f] shadow-[0_12px_48px_rgba(0,0,0,0.78)] md:inset-[3%] md:flex-row">
      {/* Interactive Gotz SVG Stage */}
      <div className="relative flex h-[54%] min-h-0 min-w-0 flex-1 flex-col bg-[#121315] md:h-full">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2b2f36]/80 bg-[#15171b] px-3 py-1.5 text-[11px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[#e6e8ec]">Gotz.Puppyt Hand Rig v2</span>
            <span className="rounded bg-[#2b2f36]/80 px-1.5 py-0.5 font-mono text-[10px] text-[#c084fc]">
              {part.id === 'handR' ? 'Right Hand (viewer left)' : 'Left Hand (viewer right)'}
            </span>
            {screenAngleDeg != null && (
              <button
                type="button"
                onClick={() => setAlignToScreen((v) => !v)}
                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                  alignToScreen
                    ? 'border-[#34d399]/60 bg-[#10b981]/15 text-[#34d399]'
                    : 'border-[#2b2f36] bg-[#121315] text-[#8b919c]'
                }`}
                title="Toggle aligning hand orientation to match its position on screen at that moment"
              >
                {alignToScreen ? `Aligned to Screen (${Math.round(screenAngleDeg)}°)` : 'Studio Upright (0°)'}
              </button>
            )}
          </div>
          <div className="font-mono text-[10.5px] text-[#34d399]">{poseCode}</div>
        </div>

        <svg
          ref={svgRef}
          viewBox="-6.2 -10.4 12.4 12.2"
          onPointerDown={handleStagePointerDown}
          onPointerMove={handleStagePointerMove}
          onPointerUp={handleStagePointerUp}
          onPointerCancel={handleStagePointerUp}
          onPointerLeave={() => setHoveredBoneId(null)}
          onContextMenu={handleContextMenu}
          className="h-full w-full flex-1 cursor-crosshair touch-none select-none"
        >
          <g
            ref={handGroupRef}
            transform={`rotate(${alignToScreen && screenAngleDeg != null ? screenAngleDeg : 0}) ${
              st.mirror ? 'scale(-1, 1)' : ''
            }`}
          >
            {/* Proportional 4:3:2:1 Arcs & Radial Guides */}
            {st.guides && (
              <g pointerEvents="none" opacity={0.34}>
                {[3.75, 6.55, 8.4, 9.4].map((r, i) => (
                  <circle
                    key={r}
                    cx={0}
                    cy={0}
                    r={r}
                    fill="none"
                    stroke={i === 0 ? '#a855f7' : '#2b323d'}
                    strokeWidth={0.035}
                    strokeDasharray="0.18 0.18"
                  />
                ))}
                <line x1={-5.8} y1={0} x2={5.8} y2={0} stroke="#2b323d" strokeWidth={0.03} />
                <line x1={0} y1={-10} x2={0} y2={1.4} stroke="#2b323d" strokeWidth={0.03} />
              </g>
            )}

            {/* Subtle Palm Web (Purple fill #5a10d8 with black outline #000000) */}
            {palmWebPoints && (
              <polygon
                points={palmWebPoints}
                fill="#5a10d8"
                fillOpacity={0.92}
                stroke="#000000"
                strokeWidth={0.08}
                strokeLinejoin="round"
                pointerEvents="none"
              />
            )}

            {/* 5-Digit Hierarchical Phalanges */}
            {(['middle', 'ring', 'index', 'pinky', 'thumb'] as GotzDigitId[])
              .filter((d) => activeDigits.includes(d))
              .map((d) => {
                const { pts, segs } = solved[d];
                return (
                  <g key={d}>
                    {segs.map((seg, i) => {
                      const boneId = `${d}:${i}`;
                      const isSel = selectedBoneId === boneId;
                      const isHov = hoveredBoneId === boneId;
                      const deg = (seg.ang * 180) / Math.PI;
                      const dPath = gotzBoneSvgPath(seg, i, segs.length, propsModel.width, st.style);
                      return (
                        <g key={boneId} transform={`translate(${seg.x1},${seg.y1}) rotate(${deg})`}>
                          <path
                            d={dPath}
                            fill="#5a10d8"
                            stroke={isSel ? '#ff3b6b' : isHov ? '#34d399' : '#000000'}
                            strokeWidth={isSel || isHov ? 0.12 : 0.085}
                            strokeLinejoin="round"
                          />
                          <line
                            x1={0}
                            y1={-seg.len * 0.18}
                            x2={0}
                            y2={-seg.len * 0.82}
                            stroke={isSel ? '#ff6b8f' : 'rgba(255, 255, 255, 0.32)'}
                            strokeWidth={0.045}
                            strokeLinecap="round"
                            pointerEvents="none"
                          />
                        </g>
                      );
                    })}

                    {/* Joint Pins & Interactive IK Tip Handles */}
                    {pts.slice(1).map(([px, py], jIdx) => {
                      const boneId = `${d}:${jIdx}`;
                      const isTip = jIdx === pts.length - 2;
                      const isSel = selectedBoneId === boneId;
                      const isHov = hoveredBoneId === boneId;
                      return (
                        <circle
                          key={`${d}-pt-${jIdx}`}
                          cx={px}
                          cy={py}
                          r={isTip ? 0.16 : 0.115}
                          fill={isSel ? '#ff3b6b' : isTip ? '#4c1d95' : '#181024'}
                          stroke={isHov ? '#34d399' : isSel ? '#ffffff' : '#000000'}
                          strokeWidth={isTip || isSel ? 0.05 : 0.035}
                        />
                      );
                    })}
                  </g>
                );
              })}

            {/* Carpal / Wrist Hub */}
            <circle
              cx={0}
              cy={0}
              r={0.34}
              fill="#5a10d8"
              stroke={selectedBoneId === 'wrist' ? '#ff3b6b' : '#000000'}
              strokeWidth={0.095}
              onClick={(ev) => {
                ev.stopPropagation();
                setSelectedBoneId('wrist');
              }}
            />
            <circle cx={0} cy={0} r={0.11} fill="#ff3b6b" pointerEvents="none" />
          </g>
        </svg>

        {/* Copy Toast Notification */}
        {copyToast && (
          <div className="pointer-events-none absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded border border-[#10b981] bg-[#191b1f] px-3 py-1 text-[12px] font-medium text-[#34d399] shadow-lg">
            {copyToast}
          </div>
        )}

        {/* Bottom-left Interactive Wrist Dial Overlay */}
        <div className="pointer-events-auto absolute bottom-3 left-3 flex items-center gap-2 rounded-md border border-[#2b2f36] bg-[#191b1f]/90 px-2 py-1.5 backdrop-blur-sm">
          <svg
            ref={wheelRef}
            width={44}
            height={44}
            viewBox="-24 -24 48 48"
            onPointerDown={handleWheelPointerDown}
            onPointerMove={handleWheelPointerMove}
            onPointerUp={handleWheelPointerUp}
            onPointerCancel={handleWheelPointerUp}
            className="cursor-grab touch-none active:cursor-grabbing"
          >
            <circle cx={0} cy={0} r={20} fill="#121315" stroke="#2b2f36" strokeWidth={2} />
            <line x1={0} y1={-20} x2={0} y2={-15} stroke="#a855f7" strokeWidth={1.6} strokeLinecap="round" />
            <g transform={`rotate(${st.mirror ? -st.wrist : st.wrist})`}>
              <line x1={0} y1={0} x2={0} y2={-17} stroke="#34d399" strokeWidth={2.2} strokeLinecap="round" />
              <circle cx={0} cy={-14} r={2.5} fill="#34d399" />
            </g>
            <circle cx={0} cy={0} r={3} fill="#ff3b6b" />
          </svg>
          <div className="text-[10.5px] leading-tight">
            <div className="font-medium text-[#c7cbd3]">Wrist Dial</div>
            <div className="font-mono text-[#34d399]">{Math.round(st.wrist)}°</div>
          </div>
        </div>

        <div className="pointer-events-none absolute right-3 bottom-3 rounded bg-[#191b1f]/80 px-2 py-1 text-[10.5px] text-[#8b919c]">
          Right-click copies hand pose · drag any fingertip/knuckle for 14-pass CCD IK
        </div>
      </div>

      {/* Right Gotz Inspector & Hierarchical Bone Tree */}
      <aside className="flex h-[46%] flex-col gap-2.5 overflow-y-auto border-t border-[#2b2f36] bg-[#191b1f] p-3 md:h-full md:w-[320px] md:border-t-0 md:border-l">
        {/* Header Bar */}
        <div className="flex items-center justify-between gap-1.5 border-b border-[#2b2f36] pb-2">
          <div className="truncate text-[13px] font-semibold text-[#e6e8ec]">
            Gotz Hand <span className="text-[#8b919c]">· {part.id}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={!undoRef.current.length}
              onClick={handleUndo}
              title="Undo hand edit"
              className="rounded border border-[#2b2f36] bg-[#121315] px-1.5 py-0.5 text-[11px] text-[#c7cbd3] hover:border-[#a855f7] disabled:opacity-40"
            >
              Undo
            </button>
            <button
              type="button"
              disabled={!redoRef.current.length}
              onClick={handleRedo}
              title="Redo hand edit"
              className="rounded border border-[#2b2f36] bg-[#121315] px-1.5 py-0.5 text-[11px] text-[#c7cbd3] hover:border-[#a855f7] disabled:opacity-40"
            >
              Redo
            </button>
            <button
              type="button"
              onClick={() => {
                if (part.gotz) pushUndo(part.gotz);
                part.reset();
                onMutated(part);
                setTick((t) => t + 1);
              }}
              className="rounded border border-[#ff3b6b]/45 bg-[#ff3b6b]/10 px-2 py-0.5 text-[11px] text-[#ff6b8f] hover:border-[#ff3b6b]"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-[#10b981]/50 bg-[#10b981]/15 px-2 py-0.5 text-[11px] font-medium text-[#34d399] hover:bg-[#10b981]/25"
            >
              Close
            </button>
          </div>
        </div>

        {/* Pose Presets */}
        <div className="space-y-1">
          <div className="text-[10.5px] font-semibold tracking-wide text-[#8b919c] uppercase">Presets</div>
          <div className="grid grid-cols-5 gap-1">
            {PRESET_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  commitChange((next) => {
                    const applied = applyGotzPreset(next, name);
                    Object.assign(next, applied);
                  });
                }}
                className="rounded border border-[#2b2f36] bg-[#121315] px-1 py-1 text-[10.5px] text-[#d0d4dc] transition-colors hover:border-[#a855f7] hover:text-white"
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        {/* Build, Proportions, Limits, Layer & Style */}
        <div className="space-y-1.5 border-t border-[#2b2f36] pt-2 text-[11px]">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[#8b919c]">Build</span>
            <div className="flex gap-1">
              {BUILD_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    commitChange((next) => {
                      next.build = opt.id;
                    })
                  }
                  className={`rounded border px-1.5 py-0.5 ${
                    st.build === opt.id
                      ? 'border-[#a855f7] bg-[#7e22ce] text-white'
                      : 'border-[#2b2f36] bg-[#121315] text-[#c7cbd3]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[#8b919c]">Proportions</span>
            <div className="flex gap-1">
              {(
                [
                  ['anat', '4:3:2:1 Anat'],
                  ['leg', '4:2:1:1 Leg'],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    part.propsModel = m;
                    part.touched = 1;
                    onMutated(part);
                    setTick((t) => t + 1);
                  }}
                  className={`rounded border px-1.5 py-0.5 ${
                    (part.propsModel ?? 'anat') === m
                      ? 'border-[#10b981] bg-[#10b981]/20 text-[#34d399]'
                      : 'border-[#2b2f36] bg-[#121315] text-[#c7cbd3]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[#8b919c]">Limits</span>
            <div className="flex gap-1">
              {LIMIT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    commitChange((next) => {
                      next.limits = opt.id;
                    })
                  }
                  className={`rounded border px-1.5 py-0.5 ${
                    st.limits === opt.id
                      ? 'border-[#a855f7] bg-[#7e22ce] text-white'
                      : 'border-[#2b2f36] bg-[#121315] text-[#c7cbd3]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[#8b919c]">Layer / Style</span>
            <div className="flex gap-1">
              {LAYER_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    commitChange((next) => {
                      next.layerOrder = opt.id;
                    })
                  }
                  className={`rounded border px-1.5 py-0.5 ${
                    st.layerOrder === opt.id
                      ? 'border-[#a855f7] bg-[#7e22ce] text-white'
                      : 'border-[#2b2f36] bg-[#121315] text-[#c7cbd3]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              <select
                value={st.style}
                onChange={(e) =>
                  commitChange((next) => {
                    next.style = e.target.value as GotzStyle;
                  })
                }
                aria-label="Bone visual style"
                className="rounded border border-[#2b2f36] bg-[#121315] px-1 py-0.5 text-[10.5px] text-[#e6e8ec]"
              >
                {STYLE_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-0.5 text-[#c7cbd3]">
            <label className="flex cursor-pointer items-center gap-1">
              <input
                type="checkbox"
                checked={st.wholeIk}
                onChange={(e) =>
                  commitChange((next) => {
                    next.wholeIk = e.target.checked;
                  })
                }
                className="accent-[#10b981]"
              />
              <span>Coupled IK</span>
            </label>
            <label className="flex cursor-pointer items-center gap-1">
              <input
                type="checkbox"
                checked={st.guides}
                onChange={(e) =>
                  commitChange((next) => {
                    next.guides = e.target.checked;
                  })
                }
                className="accent-[#a855f7]"
              />
              <span>Guides</span>
            </label>
            <label className="flex cursor-pointer items-center gap-1">
              <input
                type="checkbox"
                checked={st.mirror}
                onChange={(e) =>
                  commitChange((next) => {
                    next.mirror = e.target.checked;
                  })
                }
                className="accent-[#a855f7]"
              />
              <span>Mirror</span>
            </label>
          </div>
        </div>

        {/* Master Hand Sliders */}
        <div className="space-y-1.5 border-t border-[#2b2f36] pt-2 text-[11.5px] text-[#c7cbd3]">
          {(
            [
              ['Splay', st.splay, -100, 100, (v: number) => (next: GotzHandState) => (next.splay = v)],
              ['Tilt', st.tilt, -60, 60, (v: number) => (next: GotzHandState) => (next.tilt = v)],
              ['Thumb Spread', st.thumb, -80, 80, (v: number) => (next: GotzHandState) => (next.thumb = v)],
              ['Wrist', st.wrist, -90, 90, (v: number) => (next: GotzHandState) => (next.wrist = v)],
            ] as const
          ).map(([label, val, lo, hi, setter]) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-[#8b919c]">{label}</span>
              <input
                type="range"
                min={lo}
                max={hi}
                step={1}
                value={Math.round(val)}
                onChange={(e) => commitChange(setter(+e.target.value), false)}
                className="studio-range flex-1"
              />
              <span className="font-mono-tabular w-9 text-right text-[10.5px] text-[#e6e8ec]">
                {Math.round(val)}°
              </span>
            </div>
          ))}
        </div>

        {/* Selected Bone Fine Angle Slider */}
        {selectedBoneInfo && (
          <div className="space-y-1 rounded border border-[#a855f7]/40 bg-[#121315] p-2 text-[11px]">
            <div className="flex items-center justify-between text-[#d8b4fe]">
              <span className="truncate font-medium">{selectedBoneInfo.label}</span>
              <span className="font-mono-tabular">{Math.round(selectedBoneInfo.value)}°</span>
            </div>
            <input
              type="range"
              min={selectedBoneInfo.min}
              max={selectedBoneInfo.max}
              step={1}
              value={Math.round(selectedBoneInfo.value)}
              onChange={(e) => selectedBoneInfo.onChange(+e.target.value)}
              className="studio-range w-full"
            />
          </div>
        )}

        {/* Hierarchical Bone Tree */}
        <div className="flex-1 space-y-0.5 overflow-y-auto border-t border-[#2b2f36] pt-2">
          <div className="pb-1 text-[10.5px] font-semibold tracking-wide text-[#8b919c] uppercase">
            Hand Hierarchy Tree
          </div>
          {visibleTree.map((b) => {
            const active = selectedBoneId === b.id;
            const isMeta = b.digit !== 'wrist' && b.boneIdx === 0;
            const isCollapsed = isMeta && collapsedDigits.has(b.digit);
            return (
              <div
                key={b.id}
                style={{ paddingLeft: `${b.depth * 10}px` }}
                onMouseEnter={() => setHoveredBoneId(b.id)}
                onMouseLeave={() => setHoveredBoneId((prev) => (prev === b.id ? null : prev))}
                className="flex items-center gap-1 text-[11.5px]"
              >
                {isMeta ? (
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsedDigits((prev) => {
                        const next = new Set(prev);
                        if (next.has(b.digit)) next.delete(b.digit);
                        else next.add(b.digit);
                        return next;
                      })
                    }
                    className="w-4 shrink-0 text-center text-[10px] text-[#8b919c] hover:text-white"
                    title={isCollapsed ? 'Expand digit phalanges' : 'Collapse digit phalanges'}
                  >
                    {isCollapsed ? '▸' : '▾'}
                  </button>
                ) : (
                  <span className="w-4 shrink-0 text-center text-[10px] text-[#4b5260]">
                    {b.depth > 0 ? '└' : '◉'}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedBoneId(b.id)}
                  className={`flex flex-1 items-center justify-between gap-2 truncate rounded border px-1.5 py-0.5 text-left transition-colors ${
                    active
                      ? 'border-[#a855f7] bg-[#7e22ce] text-white'
                      : 'border-transparent text-[#c7cbd3] hover:border-[#10b981]/60 hover:text-[#34d399]'
                  }`}
                >
                  <span className="truncate">{b.label}</span>
                  <span className="font-mono-tabular shrink-0 text-[10px] opacity-80">{b.angleDeg}°</span>
                </button>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
};
