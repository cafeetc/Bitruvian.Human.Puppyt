/**
 * Feature Notes (Plain English):
 * - Stage HUD Overlay: Displays Horizon/Ground line tags, optional frame timing stats,
 *   copy/apply toasts, and an on-canvas Elastic Pin toggle switch when Pin Full Rig is active.
 */
import React from 'react';
import type { IKMode, PerspHandle } from '../../engine/types';

export interface StageHudProps {
  showPersp: boolean;
  horizonScreenY: number | null;
  groundScreenY: number | null;
  hoverPersp: PerspHandle;
  draggingPersp: PerspHandle;
  showStats: boolean;
  hudText: string;
  copyToast: string | null;
  safeHudInset: { right: number; bottom: number };
  ikMode?: IKMode;
  elasticPinFull?: boolean;
  onToggleElasticPinFull?: () => void;
}

export const StageHud: React.FC<StageHudProps> = ({
  showPersp,
  horizonScreenY,
  groundScreenY,
  hoverPersp,
  draggingPersp,
  showStats,
  hudText,
  copyToast,
  safeHudInset,
  ikMode,
  elasticPinFull = true,
  onToggleElasticPinFull,
}) => {
  const hHot = hoverPersp === 'horizon' || draggingPersp === 'horizon';
  const gHot = hoverPersp === 'ground' || draggingPersp === 'ground';

  return (
    <>
      {/* Crisp DOM architectural edge labels for Horizon & Ground lines on the live stage */}
      {showPersp && horizonScreenY !== null && Number.isFinite(horizonScreenY) && (
        <div
          className={`font-mono-tabular pointer-events-none absolute left-2.5 z-10 -translate-y-full pb-0.5 text-[10px] font-medium tracking-wider transition-colors ${
            hHot ? 'text-[#34d399]' : 'text-[#c084fc]/75'
          }`}
          style={{ top: `${Math.max(16, horizonScreenY)}px` }}
        >
          HORIZON
        </div>
      )}

      {showPersp && groundScreenY !== null && Number.isFinite(groundScreenY) && (
        <div
          className={`font-mono-tabular pointer-events-none absolute left-2.5 z-10 -translate-y-full pb-1 text-[10px] font-medium tracking-wider transition-colors ${
            gHot ? 'text-[#34d399]' : 'text-[#c084fc]/80'
          }`}
          style={{ top: `${Math.max(20, groundScreenY)}px` }}
        >
          GROUND
        </div>
      )}

      {/* On-demand HUD stats (stage top-left, never overlaps bars) */}
      {showStats && (
        <div className="font-mono-tabular pointer-events-none absolute top-2 left-2 z-10 rounded bg-[#121315]/75 px-1.5 py-0.5 whitespace-pre text-[10.5px] text-[#c7cbd3]/85">
          {hudText}
        </div>
      )}

      {/* Unobstructed Safe-Zone Overlay for Toast & On-Canvas Elastic Pin Toggle */}
      <div
        className="pointer-events-none absolute top-0 left-0 z-10"
        style={{ right: safeHudInset.right, bottom: safeHudInset.bottom }}
      >
        {ikMode === 'pinFull' && onToggleElasticPinFull && (
          <button
            type="button"
            onClick={onToggleElasticPinFull}
            title="Toggle strict-but-elastic Pin Full Rig tether & snap-back on release"
            className={`pointer-events-auto absolute top-2 right-2 z-20 flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-medium shadow-md transition-colors ${
              elasticPinFull
                ? 'border-[#10b981]/60 bg-[#121315]/90 text-[#34d399] hover:bg-[#10b981]/15'
                : 'border-[#2b2f36] bg-[#121315]/90 text-[#8b919c] hover:border-[#a855f7] hover:text-white'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${elasticPinFull ? 'bg-[#22c55e]' : 'bg-[#555b66]'}`}
            />
            <span>Elastic Pin: {elasticPinFull ? 'ON' : 'OFF'}</span>
          </button>
        )}

        {copyToast && (
          <div
            className={`pointer-events-none absolute bottom-2 left-1/2 z-20 -translate-x-1/2 rounded border px-3 py-1 text-[12px] font-medium shadow-lg ${
              copyToast === 'Invalid JSON'
                ? 'border-[#ff3b6b] bg-[#191b1f] text-[#ff6b8f]'
                : 'border-[#10b981] bg-[#191b1f] text-[#34d399]'
            }`}
          >
            {copyToast}
          </div>
        )}
      </div>
    </>
  );
};

