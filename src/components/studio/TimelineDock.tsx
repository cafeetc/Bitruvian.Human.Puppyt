import React from 'react';

export interface TimelineDockProps {
  jsonText: string;
  showStats: boolean;
  canonicalKeyCount?: number;
  onJsonChange: (val: string) => void;
  onJsonFocusChange: (focused: boolean) => void;
  onCopyJson: () => void;
  onApplyJson: (raw: string) => void;
  onExportJson: () => void;
  onExportPng: () => void;
  onToggleStats: () => void;
}

export const TimelineDock: React.FC<TimelineDockProps> = ({
  jsonText,
  showStats,
  canonicalKeyCount = 0,
  onJsonChange,
  onJsonFocusChange,
  onCopyJson,
  onApplyJson,
  onExportJson,
  onExportPng,
  onToggleStats,
}) => {
  return (
    <footer
      className="relative z-20 flex w-full shrink-0 items-center gap-1 border-t border-[#2b2f36] bg-[#191b1f]/95 px-2 py-1.5 backdrop-blur-sm"
      style={{ paddingBottom: 'calc(6px + env(safe-area-inset-bottom, 0px))' }}
    >
      <input
        type="text"
        value={jsonText}
        onChange={(e) => onJsonChange(e.target.value)}
        onFocus={(e) => {
          onJsonFocusChange(true);
          e.currentTarget.select();
        }}
        onBlur={() => onJsonFocusChange(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onApplyJson(jsonText);
            e.currentTarget.blur();
          }
        }}
        spellCheck={false}
        aria-label="Live coordinates and pose JSON"
        title="Canonical 43-joint RigStatePayload JSON · Paste and press Enter to apply · Double right-click canvas to copy"
        className="font-mono-tabular min-w-[48px] flex-1 rounded border border-[#2b2f36] bg-[#0e0f11] px-2 py-1 text-[11px] text-[#d6dae2] focus:border-[#a855f7] focus:outline-none"
      />
      {canonicalKeyCount > 0 && (
        <span
          className="font-mono-tabular hidden shrink-0 rounded border border-[#2b2f36] bg-[#121315] px-1.5 py-1 text-[10.5px] text-[#8b919c] sm:inline"
          title={`${canonicalKeyCount} track keyframes`}
        >
          {canonicalKeyCount}K
        </span>
      )}
      <button
        type="button"
        onClick={onCopyJson}
        title="Copy raw JSON (or double right-click canvas)"
        className="whitespace-nowrap shrink-0 rounded border border-[#2b2f36] bg-[#121315] px-1.5 py-1 text-[11px] font-medium text-[#e6e8ec] transition-colors hover:border-[#10b981] hover:text-[#34d399]"
      >
        Copy
      </button>
      <button
        type="button"
        onClick={() => onApplyJson(jsonText)}
        title="Apply JSON pose"
        className="whitespace-nowrap shrink-0 rounded border border-[#10b981]/50 bg-[#10b981]/15 px-1.5 py-1 text-[11px] font-medium text-[#34d399] transition-colors hover:bg-[#10b981]/25"
      >
        Apply
      </button>
      <span className="mx-0.5 h-4 w-px shrink-0 bg-[#2b2f36]" aria-hidden="true" />
      <button
        type="button"
        onClick={onExportJson}
        title="Download pose, keys and part rigs as .json"
        className="whitespace-nowrap shrink-0 rounded border border-[#2b2f36] bg-[#121315] px-1.5 py-1 text-[11px] font-medium text-[#e6e8ec] transition-colors hover:border-[#a855f7] hover:text-[#d8b4fe]"
      >
        JSON
      </button>
      <button
        type="button"
        onClick={onExportPng}
        title="Export pose as PNG (also: triple right-click)"
        className="whitespace-nowrap shrink-0 rounded border border-[#2b2f36] bg-[#121315] px-1.5 py-1 text-[11px] font-medium text-[#e6e8ec] transition-colors hover:border-[#10b981] hover:text-[#34d399]"
      >
        PNG
      </button>
      <button
        type="button"
        onClick={onToggleStats}
        title="Toggle frame & CPU stats"
        className={`whitespace-nowrap shrink-0 rounded border px-1.5 py-1 text-[11px] font-medium transition-colors ${
          showStats
            ? 'border-[#a855f7] bg-[#7e22ce] text-white'
            : 'border-[#2b2f36] bg-[#121315] text-[#c7cbd3] hover:border-[#a855f7]/70 hover:text-white'
        }`}
      >
        Stats
      </button>
    </footer>
  );
};
