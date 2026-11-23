import React from 'react';
import { WalkingEnginePivotOffsets, JointMode } from '../types';

interface FKControlsProps {
  // Joint rotation data
  pivotOffsets: WalkingEnginePivotOffsets;
  onPivotOffsetChange: (key: keyof WalkingEnginePivotOffsets, value: number) => void;
  
  // Joint mode data
  jointModes: Record<keyof WalkingEnginePivotOffsets, JointMode>;
  onJointModeChange: (key: keyof WalkingEnginePivotOffsets, mode: JointMode) => void;
  
  // Visual feedback
  lastPoppedKey: string | null;
  isTweening: boolean;
  
  // Joint keys to display
  jointKeys: (keyof WalkingEnginePivotOffsets)[];
}

/**
 * FK Controls Component
 * Provides sliders and mode toggles for forward kinematics control of individual joints.
 * Each joint can be rotated independently and have its mode adjusted (standard, bend, stretch).
 */
export const FKControls: React.FC<FKControlsProps> = ({
  pivotOffsets,
  onPivotOffsetChange,
  jointModes,
  onJointModeChange,
  lastPoppedKey,
  isTweening,
  jointKeys,
}) => {
  return (
    <div className="flex flex-col gap-2 overflow-y-auto custom-scrollbar py-2 pr-1">
      {jointKeys.map(k => (
        <div key={k} className="p-2 border border-ridge/20 rounded hover:bg-white/30 transition-colors">
          <div className="flex justify-between items-center mb-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold text-ink">{k.replace(/_/g, ' ')}</span>
              <div className="flex gap-1">
                {((k === 'neck' ? ['bend', 'stretch', 'locked'] : ['bend', 'stretch']) as JointMode[]).map(m => (
                  <button 
                    key={m} 
                    onClick={() => !isTweening && onJointModeChange(k, m)}
                    title={m.toUpperCase()}
                    className={`w-5 h-5 flex items-center justify-center rounded-sm text-[8px] font-bold border transition-all hover:scale-110 active:scale-90 ${lastPoppedKey === `${k}-${m}` ? 'animate-pop' : ''} ${jointModes[k] === m ? 'bg-selection text-paper border-selection shadow-md translate-y-[-1px]' : 'border-ridge text-mono-mid opacity-40 hover:opacity-100'}`}
                  >
                    {m === 'bend' ? 'B' : m === 'stretch' ? '2' : 'L'}
                  </button>
                ))}
              </div>
            </div>
            <span className="text-[8px] font-mono text-mono-mid tabular-nums">{Math.round(pivotOffsets[k])}°</span>
          </div>
          <input 
            type="range" 
            min="-180" 
            max="180" 
            value={pivotOffsets[k]} 
            onChange={e => !isTweening && onPivotOffsetChange(k, parseInt(e.target.value))} 
            className="w-full accent-selection h-1 cursor-ew-resize" 
            disabled={isTweening || jointModes[k] === 'locked'}
          />
        </div>
      ))}
    </div>
  );
};
