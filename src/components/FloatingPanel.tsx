import React, { useRef } from 'react';
import type { PanelId } from '../engine/types';

export interface PanelLayoutState {
  open: boolean;
  collapsed: boolean;
  floating: boolean;
  x: number;
  y: number;
  zIndex: number;
}

interface FloatingPanelProps {
  id: PanelId;
  title: string;
  layout: PanelLayoutState;
  onFocus: (id: PanelId) => void;
  onToggleCollapse: (id: PanelId) => void;
  onClose: (id: PanelId) => void;
  onDragFloat: (id: PanelId, x: number, y: number) => void;
  onDock: (id: PanelId) => void;
  children: React.ReactNode;
}

export const FloatingPanel: React.FC<FloatingPanelProps> = ({
  id,
  title,
  layout,
  onFocus,
  onToggleCollapse,
  onClose,
  onDragFloat,
  onDock,
  children,
}) => {
  const dragRef = useRef<{ dx: number; dy: number; startX: number; startY: number; moved: boolean } | null>(null);

  if (!layout.open) return null;

  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    onFocus(id);
    const panelEl = e.currentTarget.parentElement;
    if (!panelEl) return;
    const rect = panelEl.getBoundingClientRect();
    dragRef.current = {
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
      startX: e.clientX,
      startY: e.clientY,
      moved: layout.floating,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 8) return;
      d.moved = true;
    }
    const maxW = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const maxH = typeof window !== 'undefined' ? window.innerHeight : 800;
    const nx = Math.max(8, Math.min(maxW - 180, e.clientX - d.dx));
    const ny = Math.max(8, Math.min(maxH - 48, e.clientY - d.dy));
    onDragFloat(id, nx, ny);
  };

  const handleHeaderPointerUp = () => {
    dragRef.current = null;
  };

  const clampedX =
    typeof window !== 'undefined' ? Math.max(8, Math.min(window.innerWidth - 220, layout.x)) : layout.x;
  const clampedY =
    typeof window !== 'undefined' ? Math.max(8, Math.min(window.innerHeight - 60, layout.y)) : layout.y;

  return (
    <section
      onPointerDown={() => onFocus(id)}
      style={{
        zIndex: layout.zIndex,
        ...(layout.floating
          ? {
              position: 'fixed',
              left: `${clampedX}px`,
              top: `${clampedY}px`,
              width: 'min(296px, calc(100vw - 16px))',
              maxHeight: 'min(74dvh, calc(100dvh - 104px))',
              overflowY: 'auto',
            }
          : {}),
      }}
      className="pointer-events-auto w-full flex-none rounded-lg border border-[#2b2f36] bg-[#191b1f]/95 shadow-[0_6px_22px_rgba(0,0,0,0.45)] backdrop-blur-sm"
    >
      <div
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={handleHeaderPointerUp}
        onPointerCancel={handleHeaderPointerUp}
        onDoubleClick={() => onDock(id)}
        title="Drag to float · Double-click to re-dock"
        className={`flex cursor-grab touch-none items-center justify-between px-2.5 py-1.5 select-none active:cursor-grabbing ${
          layout.collapsed ? '' : 'border-b border-[#2b2f36]'
        }`}
      >
        <span className="truncate text-[12.5px] font-semibold tracking-tight text-[#e6e8ec]">{title}</span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onToggleCollapse(id)}
            title={layout.collapsed ? 'Expand' : 'Collapse'}
            className="rounded border border-[#2b2f36] bg-[#121315] px-2 py-0.5 text-[11px] text-[#a7abb4] transition-colors hover:border-[#a855f7] hover:text-[#e6e8ec]"
          >
            {layout.collapsed ? '+' : '–'}
          </button>
          <button
            type="button"
            onClick={() => onClose(id)}
            title="Close panel"
            className="rounded border border-[#2b2f36] bg-[#121315] px-2 py-0.5 text-[11px] text-[#a7abb4] transition-colors hover:border-[#ff3b6b] hover:text-[#ff3b6b]"
          >
            ×
          </button>
        </div>
      </div>
      {!layout.collapsed && <div className="p-2.5 text-[12.5px]">{children}</div>}
    </section>
  );
};
