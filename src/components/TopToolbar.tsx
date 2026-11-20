import React from 'react';
import { IK_MODE_LABELS } from '../engine/ikEngine';
import type { IKMode, PanelId, RenderMode } from '../engine/types';
import type { PanelLayoutState } from './FloatingPanel';

interface TopToolbarProps {
  panels: Record<PanelId, PanelLayoutState>;
  mode: RenderMode;
  ikMode: IKMode;
  showBones: boolean;
  showGuides: boolean;
  onTogglePanel: (id: PanelId) => void;
  onModeChange: (mode: RenderMode) => void;
  onIkModeChange: (ikMode: IKMode) => void;
  onToggleBones: (v: boolean) => void;
  onToggleGuides: (v: boolean) => void;
  onFit: () => void;
}

const PANEL_TABS: Array<{ id: PanelId; label: string }> = [
  { id: 'pose', label: 'Pose' },
  { id: 'bones', label: 'Bones' },
  { id: 'ik', label: 'IK / FABRIK' },
  { id: 'tl', label: 'Keyframes' },
  { id: 'library', label: 'Pose Library' },
  { id: 'data', label: 'Data' },
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'about', label: 'About' },
];

export const TopToolbar: React.FC<TopToolbarProps> = ({
  panels,
  mode,
  ikMode,
  showBones,
  showGuides,
  onTogglePanel,
  onModeChange,
  onIkModeChange,
  onToggleBones,
  onToggleGuides,
  onFit,
}) => {
  return (
    <header
      onWheel={(e) => {
        const el = e.currentTarget;
        if (el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          el.scrollLeft += e.deltaY;
        }
      }}
      className="no-scrollbar relative z-30 flex w-full shrink-0 flex-nowrap items-center gap-1.5 overflow-x-auto border-b border-[#2b2f36] bg-[#191b1f]/95 px-2.5 py-1.5 backdrop-blur-sm"
      style={{ paddingTop: 'calc(6px + env(safe-area-inset-top, 0px))' }}
    >
      <span className="mr-1 whitespace-nowrap shrink-0 text-[13px] font-bold tracking-tight text-[#e6e8ec]">
        Bitruvius<span className="hidden sm:inline"> Puppyt</span>
      </span>

      <div className="flex shrink-0 flex-nowrap items-center gap-1">
        {PANEL_TABS.map((tab) => {
          const active = panels[tab.id].open;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTogglePanel(tab.id)}
              className={`whitespace-nowrap shrink-0 rounded border px-2 py-1 text-[11.5px] font-medium transition-colors sm:px-2.5 sm:text-[12px] ${
                active
                  ? 'border-[#a855f7] bg-[#7e22ce] text-white'
                  : 'border-[#2b2f36] bg-[#121315] text-[#c7cbd3] hover:border-[#a855f7]/70 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <span className="mx-0.5 h-4 w-px shrink-0 bg-[#2b2f36]" aria-hidden="true" />

      <select
        value={ikMode}
        onChange={(e) => onIkModeChange(e.target.value as IKMode)}
        title="Kinematics Solver Mode: Pure FK or FABRIK / Pinning IK"
        className={`whitespace-nowrap shrink-0 rounded border px-2 py-1 text-[11.5px] font-medium focus:outline-none sm:text-[12px] ${
          ikMode === 'fk'
            ? 'border-[#2b2f36] bg-[#121315] text-[#c7cbd3] focus:border-[#a855f7]'
            : 'border-[#10b981]/60 bg-[#10b981]/15 text-[#34d399] focus:border-[#10b981]'
        }`}
      >
        {(Object.keys(IK_MODE_LABELS) as IKMode[]).map((k) => (
          <option key={k} value={k} className="bg-[#121315] text-[#e6e8ec]">
            {IK_MODE_LABELS[k]}
          </option>
        ))}
      </select>

      <select
        value={mode}
        onChange={(e) => onModeChange(e.target.value as RenderMode)}
        title="Analog: the purple paper puppet. Digital: the green bones behind it."
        className="whitespace-nowrap shrink-0 rounded border border-[#2b2f36] bg-[#121315] px-2 py-1 text-[11.5px] text-[#e6e8ec] focus:border-[#a855f7] focus:outline-none sm:text-[12px]"
      >
        <option value="A">Analog</option>
        <option value="D">Digital</option>
      </select>

      <label className="flex cursor-pointer items-center gap-1 whitespace-nowrap shrink-0 rounded px-1 py-1 text-[11.5px] text-[#c7cbd3] hover:text-white sm:gap-1.5 sm:px-1.5 sm:text-[12px]">
        <input
          type="checkbox"
          checked={showBones}
          onChange={(e) => onToggleBones(e.target.checked)}
          className="accent-[#10b981]"
        />
        <span>bones</span>
      </label>

      <label className="flex cursor-pointer items-center gap-1 whitespace-nowrap shrink-0 rounded px-1 py-1 text-[11.5px] text-[#c7cbd3] hover:text-white sm:gap-1.5 sm:px-1.5 sm:text-[12px]">
        <input
          type="checkbox"
          checked={showGuides}
          onChange={(e) => onToggleGuides(e.target.checked)}
          className="accent-[#a855f7]"
        />
        <span>guides</span>
      </label>

      <span className="mx-0.5 h-4 w-px shrink-0 bg-[#2b2f36]" aria-hidden="true" />

      <button
        type="button"
        onClick={onFit}
        title="Frame the whole figure (F)"
        className="whitespace-nowrap shrink-0 rounded border border-[#10b981]/50 bg-[#10b981]/15 px-2.5 py-1 text-[11.5px] font-medium text-[#34d399] transition-colors hover:border-[#10b981] hover:bg-[#10b981]/25 sm:text-[12px]"
      >
        Fit
      </button>
    </header>
  );
};
