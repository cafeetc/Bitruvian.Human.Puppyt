

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { WalkingEnginePose, WalkingEnginePivotOffsets, WalkingEngineProportions, Vector2D, MaskTransform, JointMode, IKChainKey } from './types';
import { MaskData } from './components/Mannequin';
import { ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT, RIGGING, RIGHT_ARM_IK_CONFIG, RIGHT_LEG_IK_CONFIG, LEFT_ARM_IK_CONFIG, LEFT_LEG_IK_CONFIG } from './constants'; 
import { Mannequin, getMannequinWorldTransformsHelper } from './components/Mannequin'; // Import helper
import { SystemLogger } from './components/SystemLogger';
import { FKControls } from './components/FKControls'; // Import FK Controls
import { solveFABRIK } from './utils/fabrik'; // Import FABRIK solver

const MOUNTAINVIEW: WalkingEnginePivotOffsets = {
  waist: 0, neck: 0, collar: 0, torso: 0,
  l_shoulder: 0, r_shoulder: 0,
  l_elbow: 0, r_elbow: 0,
  l_hand: 0, r_hand: 0,
  l_hip: 180, r_hip: 180, // Legs pointing straight down
  l_knee: 0, r_knee: 0,
  l_foot: -90, r_foot: 90, // Horizontal feet pointing outward
  l_toe: 0, r_toe: 0
};

// Define RESTING_BASE_POSE with all fields of WalkingEnginePose
// Calibrated for reversed hierarchy to match visual positioning of MOUNTAINVIEW
const RESTING_BASE_POSE: WalkingEnginePose = {
  waist: 0, neck: 0, collar: 0, torso: 0,
  l_shoulder: 0, r_shoulder: 0,
  l_elbow: 0, r_elbow: 0,
  l_hand: 0, r_hand: 0,
  l_hip: 0, r_hip: 0, // Legs point straight down from waist in reversed hierarchy
  l_knee: 0, r_knee: 0,
  l_foot: 0, r_foot: 0,
  l_toe: 0, r_toe: 0,
  stride_phase: 0, // Default value for WalkingEnginePose
  y_offset: 0,     // Default value for WalkingEnginePose
  x_offset: 0,     // Default value for WalkingEnginePose
};

const INITIAL_CHALLENGE_POSE: WalkingEnginePivotOffsets = {
  waist: 0, torso: 0, collar: 0, neck: 0, // Reset these to 0 for a more "natural" starting point for challenges.
  l_shoulder: 0, l_elbow: 0, l_hand: 0,
  r_shoulder: 0, r_elbow: 0, r_hand: 0,
  l_hip: 180, l_knee: 0, l_foot: 0, l_toe: 0, // Legs start pointing down
  r_hip: 180, r_knee: 0, r_foot: 0, r_toe: 0
};

const WELCOME_POSE: WalkingEnginePivotOffsets = {
  waist: -180,
  torso: 0,
  collar: 0,
  neck: 179.5,
  l_shoulder: -100,
  l_elbow: -157.5,
  l_hand: -72,
  r_shoulder: 101,
  r_elbow: 158,
  r_hand: 74,
  l_hip: 8,
  l_knee: -169,
  l_foot: 0,
  l_toe: -134.5,
  r_hip: 352,
  r_knee: 168.5,
  r_foot: 0,
  r_toe: 129.5
};

const DEFAULT_PROPORTIONS: WalkingEngineProportions = {
  head: { w: 1, h: 1 }, collar: { w: 1, h: 1 }, torso: { w: 1, h: 1 }, waist: { w: 1, h: 1 },
  l_upper_arm: { w: 1, h: 1 }, l_lower_arm: { w: 1, h: 1 }, l_hand: { w: 1, h: 1 },
  r_upper_arm: { w: 1, h: 1 }, r_lower_arm: { w: 1, h: 1 }, r_hand: { w: 1, h: 1 },
  l_upper_leg: { w: 1, h: 1 }, l_lower_leg: { w: 1, h: 1 }, l_foot: { w: 1, h: 1 }, l_toe: { w: 1, h: 1 },
  r_upper_leg: { w: 1, h: 1 }, r_lower_leg: { w: 1, h: 1 }, r_foot: { w: 1, h: 1 }, r_toe: { w: 1, h: 1 }
};

const PROP_KEYS: (keyof WalkingEngineProportions)[] = [
  'head', 'collar', 'torso', 'waist',
  'l_upper_arm', 'l_lower_arm', 'l_hand',
  'r_upper_arm', 'r_lower_arm', 'r_hand',
  'l_upper_leg', 'l_lower_leg', 'l_foot', 'l_toe',
  'r_upper_leg', 'r_lower_leg', 'r_foot', 'r_toe'
];

const JOINT_KEYS: (keyof WalkingEnginePivotOffsets)[] = [
  'waist', 'torso', 'collar', 'neck',
  'l_shoulder', 'l_elbow', 'l_hand',
  'r_shoulder', 'r_elbow', 'r_hand',
  'l_hip', 'l_knee', 'l_foot', 'l_toe',
  'r_hip', 'r_knee', 'r_foot', 'r_toe'
];

const CHAIN_DEPTH: Record<string, number> = {
  waist: 0, torso: 1, collar: 2, neck: 3, head: 4,
  l_shoulder: 3, r_shoulder: 3, l_elbow: 4, r_elbow: 4, l_hand: 5, r_hand: 5,
  l_hip: 1, r_hip: 1, l_knee: 2, r_knee: 2, l_foot: 3, r_foot: 3, l_toe: 4, r_toe: 4
};

const snapOutEase = (t: number) => {
  const c4 = (2 * Math.PI) / 3;
  return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

const EASING_FUNCTIONS = {
  linear: (t: number) => t,
  easeInOutQuad: (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  snapOut: snapOutEase,
};

interface HistoryState {
  pivotOffsets: WalkingEnginePivotOffsets;
  props: WalkingEngineProportions;
  jointModes: Record<keyof WalkingEnginePivotOffsets, JointMode>;
  timestamp: number;
}

interface SavedPoseEntry {
  id: number;
  name: string;
  pivotOffsets: WalkingEnginePivotOffsets;
  props: WalkingEngineProportions;
  jointModes: Record<keyof WalkingEnginePivotOffsets, JointMode>;
}

const rotateVec = (vec: Vector2D, angleDeg: number): Vector2D => {
  const r = angleDeg * Math.PI / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: vec.x * c - vec.y * s, y: vec.x * s + vec.y * c };
};
const addVec = (v1: Vector2D, v2: Vector2D): Vector2D => ({ x: v1.x + v2.x, y: v1.y + v2.y });
const subVec = (v1: Vector2D, v2: Vector2D): Vector2D => ({ x: v1.x - v2.x, y: v1.y - v2.y });


const App: React.FC = () => {
  const [showPivots, setShowPivots] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const [baseH, setBaseH] = useState(150); // Now controlled by globalScale
    const [isConsoleVisible, setIsConsoleVisible] = useState(false);
    const [activeControlTab, setActiveControlTab] = useState<'pose' | 'proportions' | 'library'>('pose');
  const [systemLogs, setSystemLogs] = useState<{ timestamp: string; message: string }[]>([]);
    const [isCalibrated, setIsCalibrated] = useState(true);
  const [tokens, setTokens] = useState(0);
  const [lHandFlash, setLHandFlash] = useState(false);
  const [rHandFlash, setRHandFlash] = useState(false);
  const [saveConfirmation, setSaveConfirmation] = useState(false);
  
  const anomalySize = useMemo(() => 15, []);

  // Ground Plane Constants
  const GROUND_PLANE_Y = 550; // Fixed world Y position for ground plane
  const FOOT_HEIGHT = 25; // Approximate foot height in SVG units
  const GROUND_BUFFER = FOOT_HEIGHT; // Buffer zone above ground affecting non-foot parts

  // New State: Joint Modes (FK Only)
  const [jointModes, setJointModes] = useState<Record<keyof WalkingEnginePivotOffsets, JointMode>>(
    Object.fromEntries(JOINT_KEYS.map(k => [k, 'standard'])) as any
  );
  const [lastPoppedKey, setLastPoppedKey] = useState<string | null>(null);

  // Pinning State - Navel (Waist) Pin
  const [pinnedJoints, setPinnedJoints] = useState<Set<keyof WalkingEnginePivotOffsets>>(new Set(['waist'])); // Pin at navel
  const [pinOffset, setPinOffset] = useState<Vector2D>({ x: 0, y: 0 });
  const pinnedWorldPosRef = useRef<Vector2D | null>(null);

  // Tween Configuration State
  const [tweenDuration, setTweenDuration] = useState(1000);
  const [tweenEasing, setTweenEasing] = useState<'linear' | 'easeInOutQuad' | 'snapOut'>('easeInOutQuad');
  const [isTweening, setIsTweening] = useState(false);

  // Interaction Tracking
  const lastInteractionTimeRef = useRef(Date.now());
  const draggingBoneKeyRef = useRef<keyof WalkingEnginePivotOffsets | null>(null);

  // Core State
  const [pivotOffsets, setPivotOffsets] = useState<WalkingEnginePivotOffsets>(MOUNTAINVIEW);
  const [props, setProps] = useState<WalkingEngineProportions>(DEFAULT_PROPORTIONS);

  // Global Proportion Controls
  const [globalScale, setGlobalScale] = useState(94); // Controls baseUnitH - 25% bigger than half viewport
  const [globalBoneWidthMultiplier, setGlobalBoneWidthMultiplier] = useState(1);
  const [globalLimbLengthMultiplier, setGlobalLimbLengthMultiplier] = useState(1);
  const [mannequinOffsetY, setMannequinOffsetY] = useState(50); // Position ankles at ground level
  const [isZoomed, setIsZoomed] = useState(false); // Zoom state

  // Mask Upload State - changed to per-part masks
  const [partMasks, setPartMasks] = useState<Record<keyof WalkingEngineProportions, MaskData>>(
    Object.fromEntries(PROP_KEYS.map(k => [k, { image: null, dimensions: null, visible: true, offsetX: 0, offsetY: 0, scale: 1 }])) as Record<keyof WalkingEngineProportions, MaskData>
  );
  const [selectedMaskPart, setSelectedMaskPart] = useState<keyof WalkingEngineProportions>('head');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [partVisibility, setPartVisibility] = useState<Record<keyof WalkingEngineProportions, boolean>>(
    Object.fromEntries(PROP_KEYS.map(k => [k, true])) as Record<keyof WalkingEngineProportions, boolean>
  );

  // Console minimize state
  const [minimizedSections, setMinimizedSections] = useState<Record<string, boolean>>({});
  const toggleMinimize = (section: string) => {
    setMinimizedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const [savedPoses, setSavedPoses] = useState<SavedPoseEntry[]>([]);
  const [anomaly, setAnomaly] = useState<Vector2D | null>(null);
  const anomalyRef = useRef<Vector2D | null>(null);

  const [draggingBoneKey, setDraggingBoneKey] = useState<keyof WalkingEnginePivotOffsets | null>(null);
  const dragStartXRef = useRef(0);
  const dragStartPivotOffsetRef = useRef(0);

  const addLog = useCallback((message: string) => {
    setSystemLogs(prev => [...prev.slice(-49), { timestamp: new Date().toLocaleTimeString(), message }]);
  }, []);

  // Mask upload handler with edge-based white removal to preserve interior white
  const handleMaskUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Create canvas for processing
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        // Get image data for analysis
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        const data = imageData.data;

        const isNearWhite = (r: number, g: number, b: number, a: number) => {
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          return a > 10 && max > 230 && (max - min) < 20;
        };

        // Edge-based flood fill: find white pixels connected to image edges
        const isEdgeWhite = new Uint8Array(img.width * img.height);
        const queue: number[] = [];

        // Start from all edge pixels that are white
        for (let y = 0; y < img.height; y++) {
          for (let x = 0; x < img.width; x++) {
            if (x === 0 || x === img.width - 1 || y === 0 || y === img.height - 1) {
              const i = (y * img.width + x) * 4;
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];
              const a = data[i + 3];
              if (isNearWhite(r, g, b, a)) {
                const idx = y * img.width + x;
                isEdgeWhite[idx] = 1;
                queue.push(idx);
              }
            }
          }
        }

        // Flood fill to mark all white connected to edges
        while (queue.length > 0) {
          const idx = queue.shift()!;
          const y = Math.floor(idx / img.width);
          const x = idx - y * img.width;

          const neighbors = [idx - 1, idx + 1, idx - img.width, idx + img.width];
          for (const n of neighbors) {
            if (n < 0 || n >= img.width * img.height || isEdgeWhite[n]) continue;
            const ny = Math.floor(n / img.width);
            const nx = n - ny * img.width;
            if (nx < 0 || nx >= img.width || ny < 0 || ny >= img.height) continue;

            const i = n * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];
            if (isNearWhite(r, g, b, a)) {
              isEdgeWhite[n] = 1;
              queue.push(n);
            }
          }
        }

        // Create a new canvas with only edge-connected white removed
        const processedCanvas = document.createElement('canvas');
        processedCanvas.width = img.width;
        processedCanvas.height = img.height;
        const processedCtx = processedCanvas.getContext('2d');
        if (!processedCtx) return;

        processedCtx.drawImage(canvas, 0, 0);
        const processedImageData = processedCtx.getImageData(0, 0, img.width, img.height);
        const processedData = processedImageData.data;

        // Remove only edge-connected white background
        for (let y = 0; y < img.height; y++) {
          for (let x = 0; x < img.width; x++) {
            const idx = y * img.width + x;
            const i = idx * 4;
            if (isEdgeWhite[idx] === 1) {
              processedData[i + 3] = 0; // Make transparent
            }
          }
        }

        processedCtx.putImageData(processedImageData, 0, 0);

        // Find bounds of visible pixels
        let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
        
        for (let y = 0; y < img.height; y++) {
          for (let x = 0; x < img.width; x++) {
            const i = (y * img.width + x) * 4;
            const a = processedData[i + 3];
            
            if (a > 10) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }

        if (maxX < 0 || maxY < 0) {
          const maskData: MaskData = { image: e.target?.result as string, dimensions: { width: img.width, height: img.height }, visible: true, offsetX: 0, offsetY: 0, scale: 1 };
          setPartMasks(prev => ({ ...prev, [selectedMaskPart]: maskData }));
          addLog(`Mask uploaded to ${selectedMaskPart} (no visible subject detected after cleanup)`);
          return;
        }

        // Add minimal padding
        const padding = 2;
        minX = Math.max(0, minX - padding);
        minY = Math.max(0, minY - padding);
        maxX = Math.min(img.width, maxX + padding);
        maxY = Math.min(img.height, maxY + padding);

        const cropWidth = maxX - minX;
        const cropHeight = maxY - minY;

        // Create cropped canvas
        const croppedCanvas = document.createElement('canvas');
        croppedCanvas.width = cropWidth;
        croppedCanvas.height = cropHeight;
        const croppedCtx = croppedCanvas.getContext('2d');
        if (!croppedCtx) return;

        croppedCtx.drawImage(processedCanvas, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

        const croppedDataUrl = croppedCanvas.toDataURL('image/png');
        const partPropKey = selectedMaskPart;
        const partH = ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT[Object.keys(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT).find(k => k.includes(partPropKey.split('_')[partPropKey.split('_').length - 1].toUpperCase())) as keyof typeof ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT] || 1;
        const scaleToFit = Math.min(1, (partH * baseH) / Math.max(cropWidth, cropHeight));

        const maskData: MaskData = {
          image: croppedDataUrl,
          dimensions: { width: cropWidth, height: cropHeight },
          visible: true,
          offsetX: 0,
          offsetY: 0,
          scale: Number.isFinite(scaleToFit) ? Number(scaleToFit.toFixed(3)) : 1
        };

        setPartMasks(prev => ({ ...prev, [selectedMaskPart]: maskData }));
        addLog(`Mask uploaded to ${selectedMaskPart}: ${cropWidth}x${cropHeight}px - auto fit ${maskData.scale.toFixed(2)}x`);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, [addLog, baseH, props, selectedMaskPart]);

  const removeMask = useCallback(() => {
    const maskData: MaskData = { image: null, dimensions: null, visible: true, offsetX: 0, offsetY: 0, scale: 1 };
    setPartMasks(prev => ({ ...prev, [selectedMaskPart]: maskData }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    addLog(`Mask removed from ${selectedMaskPart}`);
  }, [addLog, selectedMaskPart]);

  // Effect to update baseH when globalScale changes
  useEffect(() => {
    setBaseH(globalScale);
  }, [globalScale]);

  // Effect to update props when global multipliers change
  useEffect(() => {
    setProps(prevProps => {
      const newProps: WalkingEngineProportions = {} as WalkingEngineProportions;
      PROP_KEYS.forEach(key => {
        newProps[key] = {
          w: (DEFAULT_PROPORTIONS[key]?.w || 1) * globalBoneWidthMultiplier,
          h: (DEFAULT_PROPORTIONS[key]?.h || 1) * globalLimbLengthMultiplier,
        };
      });
      return newProps;
    });
  }, [globalBoneWidthMultiplier, globalLimbLengthMultiplier]);


  useEffect(() => {
    try {
      const storedPoses = localStorage.getItem('bitruvian_library');
      if (storedPoses) {
        const parsed = JSON.parse(storedPoses);
        if (Array.isArray(parsed)) setSavedPoses(parsed);
      }
    } catch (e) { console.error("Error loading library", e); }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('bitruvian_library', JSON.stringify(savedPoses));
    } catch (e) { console.error("Error saving library", e); }
  }, [savedPoses]);

  const awardTokens = useCallback((sourceBone: string) => {
    const timeSinceLastInteraction = Date.now() - lastInteractionTimeRef.current;
    let passiveMultiplier = (timeSinceLastInteraction > 1500 || isTweening) ? 2 : 1;
    let limbBonus = CHAIN_DEPTH[sourceBone] || 1;
    const gain = Math.floor(limbBonus * passiveMultiplier);
    setTokens(prev => prev + gain);
    addLog(`[SYSTEM]: POSE_PICKUP - UNIT TOKENS UPDATED (+${gain}) ${passiveMultiplier > 1 ? '[PASSIVE BONUS]' : ''} [${sourceBone.toUpperCase()} DEPTH: ${limbBonus}X]`);
  }, [addLog, isTweening]);

  const spawnAnomaly = useCallback(() => {
    const angle = Math.random() * Math.PI * 2;
    const distance = 150 + Math.random() * 350;
    const newAnom = { x: Math.cos(angle) * distance, y: -250 + Math.sin(angle) * distance };
    setAnomaly(newAnom);
    anomalyRef.current = newAnom;
  }, []);

  const calculateAnklePos = useCallback((currentPivotOffsets: WalkingEnginePivotOffsets, currentProps: WalkingEngineProportions) => {
    const getRot = (key: string) => ((currentPivotOffsets as any)[key] || 0);
    const getDim = (raw: number, key: keyof WalkingEngineProportions) => raw * baseH * (currentProps[key]?.h || 1);
    const waistRot = getRot('waist');
    // For calculating ankle position, we still assume legs generally point downwards from hip
    const hipRot = waistRot + getRot('r_hip'); 
    const thighLen = getDim(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LEG_UPPER, 'r_upper_leg');
    const kneeRot = hipRot + getRot('r_knee');
    const kneePos = rotateVec({ x: 0, y: thighLen }, hipRot);
    const calfLen = getDim(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LEG_LOWER, 'r_lower_leg');
    const anklePos = addVec(kneePos, rotateVec({ x: 0, y: calfLen }, kneeRot));
    return anklePos;
  }, [baseH]);

  const togglePinning = useCallback(() => {
    setLastPoppedKey('pin-waist');
    setTimeout(() => setLastPoppedKey(null), 300);
    setPinnedJoints(prev => {
      const next = new Set(prev);
      if (next.has('waist')) {
        next.delete('waist');
        setPinOffset({ x: 0, y: 0 });
        addLog(`[SYSTEM]: PINNING DISABLED.`);
      } else {
        next.clear();
        next.add('waist');
        addLog(`[SYSTEM]: PINNING ENABLED - NAVEL ANCHORED.`);
      }
      return next;
    });
  }, [addLog]);

  // Function to calculate a temporary Mannequin's global transforms for pin calculation
  const getMannequinGlobalTransforms = useCallback(() => {
    // Pure FK mode with standard hierarchy (waist as root)
    return getMannequinWorldTransformsHelper(pivotOffsets, props, baseH, false, jointModes);
  }, [baseH, props, pivotOffsets, jointModes]);

  const computePinOffsetForPose = useCallback((pose: WalkingEnginePivotOffsets) => {
    const transforms = getMannequinWorldTransformsHelper(pose, props, baseH, false, jointModes);
    const waistTransform = transforms.waist;
    if (waistTransform && 'position' in waistTransform) {
      const anchorX = 0; // Center horizontally
      const anchorY = 0; // Center vertically (in mannequin coordinate space)
      return {
        x: anchorX - waistTransform.position.x,
        y: anchorY - waistTransform.position.y,
      };
    }
    return null;
  }, [baseH, props, jointModes]);

  const updatePinOffset = useCallback(() => {
    if (pinnedJoints.size === 0) return;
    
    // Waist is pinned to center screen
    if (pinnedJoints.has('waist')) {
      const transforms = getMannequinGlobalTransforms();
      const waistTransform = transforms.waist;
      if (waistTransform && 'position' in waistTransform) {
        const anchorX = 0; // Center horizontally
        const anchorY = 0; // Center vertically (in mannequin coordinate space)
        const nextX = anchorX - waistTransform.position.x;
        const nextY = anchorY - waistTransform.position.y;
        setPinOffset({ x: nextX, y: nextY });
      }
    }
  }, [pinnedJoints, getMannequinGlobalTransforms]);

  useEffect(() => {
    if (pinnedJoints.size > 0) updatePinOffset();
  }, [pivotOffsets, props, mannequinOffsetY, updatePinOffset]);

  // Effect to initialize pin when calibrated
  useEffect(() => {
    if (isCalibrated && pinnedJoints.has('waist')) {
      updatePinOffset();
    }
  }, [isCalibrated, pinnedJoints, updatePinOffset]);

  // Effect to maintain position during zoom (scale changes)
  useEffect(() => {
    if (pinnedJoints.size > 0) {
      updatePinOffset();
    }
  }, [baseH, updatePinOffset]);

  const handleAnchorMouseDown = useCallback((boneKey: keyof WalkingEnginePivotOffsets, clientX: number, clientY: number) => {
    // Pure FK mode - no IK handling needed
    if (jointModes[boneKey] === 'locked') return;
    setDraggingBoneKey(boneKey);
    dragStartXRef.current = clientX;
    dragStartPivotOffsetRef.current = pivotOffsets[boneKey];
  }, [jointModes, pivotOffsets]);


  const handleDrag = useCallback((e: MouseEvent) => {
    lastInteractionTimeRef.current = Date.now();

    if (draggingBoneKey && !isTweening) { // Pure FK drag
      const delta = (e.clientX - dragStartXRef.current) * 0.5;
      setPivotOffsets(p => ({ ...p, [draggingBoneKey]: dragStartPivotOffsetRef.current + delta }));
      awardTokens(draggingBoneKey);
    }
  }, [draggingBoneKey, isTweening, awardTokens]);

  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const hu = () => { 
      setDraggingBoneKey(null); 
      draggingBoneKeyRef.current = null;
    };
    const moveHandler = (e: MouseEvent) => handleDrag(e);

    if (draggingBoneKey) {
      draggingBoneKeyRef.current = draggingBoneKey;
      window.addEventListener('mousemove', moveHandler);
      window.addEventListener('mouseup', hu);
    }
    return () => { 
      window.removeEventListener('mousemove', moveHandler); 
      window.removeEventListener('mouseup', hu); 
    };
  }, [draggingBoneKey, handleDrag]);

  const setJointMode = (key: keyof WalkingEnginePivotOffsets, mode: JointMode) => {
    setLastPoppedKey(`${key}-${mode}`);
    setTimeout(() => setLastPoppedKey(null), 300);
    // If clicking an already active mode, toggle it back to standard
    const nextMode = jointModes[key] === mode ? 'standard' : mode;
    setJointModes(prev => ({ ...prev, [key]: nextMode }));
    addLog(`[SYSTEM]: JOINT_MODE_UPDATE - ${key.toUpperCase()} SET TO ${nextMode.toUpperCase()}`);
  };

  const runTween = useCallback((target: SavedPoseEntry) => {
    if (isTweening) return;
    setIsTweening(true);
    const startPivot = { ...pivotOffsets };
    const startProps = { ...props };
    const startJointModes = { ...jointModes };
    let startTime: number | null = null; // Reset startTime for each new tween

    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / tweenDuration, 1);
      const easedProgress = EASING_FUNCTIONS[tweenEasing](progress);

      const nextPivot = { ...startPivot };
      JOINT_KEYS.forEach(key => {
        const startValue = startPivot[key];
        const endValue = target.pivotOffsets[key];
        nextPivot[key] = startValue + (endValue - startValue) * easedProgress;
      });

      const nextProps: WalkingEngineProportions = {} as WalkingEngineProportions;
      PROP_KEYS.forEach(key => {
        const startW = startProps[key]?.w || 1;
        const endW = target.props[key]?.w || 1;
        const startH = startProps[key]?.h || 1;
        const endH = target.props[key]?.h || 1;
        nextProps[key] = {
          w: startW + (endW - startW) * easedProgress,
          h: startH + (endH - startH) * easedProgress,
        };
      });

      setPivotOffsets(nextPivot);
      setProps(nextProps);
      setJointModes(startJointModes); // Joint modes don't tween, they snap at the end.

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setIsTweening(false);
        setJointModes(target.jointModes); // Set final joint modes
        setProps(target.props); // Set final props in case of rounding errors during tweening
        addLog(`[SYSTEM]: TWEEN_COMPLETE - POSE "${target.name.toUpperCase()}" LOADED.`);
      }
    };

    requestAnimationFrame(animate);
  }, [isTweening, pivotOffsets, props, jointModes, tweenDuration, tweenEasing, addLog]);

  const saveCurrentPose = useCallback(() => {
    const newEntry: SavedPoseEntry = {
      id: Date.now(),
      name: `Pose ${savedPoses.length + 1}`,
      pivotOffsets: { ...pivotOffsets },
      props: { ...props },
      jointModes: { ...jointModes }
    };
    setSavedPoses(prev => [...prev, newEntry]);
    setSaveConfirmation(true);
    addLog(`[SYSTEM]: POSE_SAVED - ENTITY ID: ${newEntry.id}`);
    setTimeout(() => setSaveConfirmation(false), 2000);
  }, [savedPoses, pivotOffsets, props, jointModes, addLog]);

  const exportPosesAsCode = useCallback(() => {
    if (savedPoses.length === 0) {
      addLog('[SYSTEM]: No poses to export');
      return;
    }
    
    const poseCode = `// Auto-generated pose library - ${new Date().toISOString()}
export const POSE_LIBRARY = {
${savedPoses.map(pose => `  '${pose.name.replace(/'/g, "\\'")}': {
    pivotOffsets: ${JSON.stringify(pose.pivotOffsets, null, 6).split('\n').join('\n    ')},
    jointModes: ${JSON.stringify(pose.jointModes, null, 6).split('\n').join('\n    ')},
    props: ${JSON.stringify(pose.props, null, 6).split('\n').join('\n    ')}
  }`).join(',\n')}
} as const;`;

    // Copy to clipboard
    navigator.clipboard.writeText(poseCode);
    addLog('[SYSTEM]: Pose library exported to clipboard!');
    
    // Also download as file
    const blob = new Blob([poseCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pose-library.ts';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [savedPoses, addLog]);

  return (
    <div className="flex h-full w-full bg-paper font-mono text-ink overflow-hidden select-none">
      {isConsoleVisible && (
        <div className="w-80 border-r border-ridge bg-mono-darker p-4 flex flex-col gap-4 custom-scrollbar overflow-y-auto z-50">
          <div className="flex justify-between items-center border-b border-ridge pb-2">
            <h1 className="text-xl font-archaic tracking-widest uppercase italic">Bitruvius.Core</h1>
          </div>
          
          <div className="flex flex-col gap-2">
            {!isCalibrated ? (
              <button onClick={() => {
                setPivotOffsets(MOUNTAINVIEW);
                setJointModes(Object.fromEntries(JOINT_KEYS.map(k => [k, 'standard'])) as any);
                setPinnedJoints(new Set(['waist']));
                setPinOffset({ x: 0, y: 0 });
                setIsCalibrated(true);
                addLog('[SYSTEM]: CORE_INITIALIZED - T-POSE LOCKED, NAVEL PINNED');
              }} className="text-[9px] px-3 py-2 border border-selection bg-selection text-paper font-bold uppercase">INITIALIZE ENGINE</button>
            ) : (
              <div className="flex flex-col gap-2">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <div className="text-[8px] uppercase tracking-wider text-mono-mid font-bold">ENGINE CONTROLS</div>
                    <button
                      onClick={() => toggleMinimize('engine')}
                      className="text-[10px] text-mono-mid hover:text-ink transition-colors"
                    >
                      {minimizedSections.engine ? '▶' : '▼'}
                    </button>
                  </div>
                  {!minimizedSections.engine && (
                    <div className="flex flex-col gap-2">
                <button 
                  onClick={() => {
                    setLastPoppedKey('mountainview');
                    setTimeout(() => setLastPoppedKey(null), 300);
                    runTween({ id: 0, name: 'MOUNTAINVIEW', pivotOffsets: MOUNTAINVIEW, props: DEFAULT_PROPORTIONS, jointModes: Object.fromEntries(JOINT_KEYS.map(k => [k, 'standard'])) as any });
                    setGlobalScale(94);
                    setGlobalBoneWidthMultiplier(1);
                    setGlobalLimbLengthMultiplier(1);
                  }} 
                  className="text-[9px] px-3 py-2 border border-selection bg-selection text-paper font-bold uppercase"
                >
                  T-POSE
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={togglePinning} 
                    className={`text-[9px] px-3 py-2 border font-bold uppercase ${pinnedJoints.has('waist') ? 'bg-accent-purple text-paper border-accent-purple shadow-lg' : 'bg-paper/10 border-ridge text-mono-light'}`}
                  >
                    {pinnedJoints.has('waist') ? 'NAVEL PINNED' : 'PIN NAVEL'}
                  </button>
                  <button 
                    onClick={() => {
                      setIsZoomed(!isZoomed);
                      setGlobalScale(isZoomed ? 94 : 188);
                      addLog(`[SYSTEM]: ZOOM ${isZoomed ? 'OUT' : 'IN'} - SCALE: ${isZoomed ? '94' : '188'}`);
                    }} 
                    className={`text-[9px] px-3 py-2 border font-bold uppercase ${isZoomed ? 'bg-accent-green text-paper border-accent-green shadow-lg' : 'bg-paper/10 border-ridge text-mono-light'}`}
                  >
                    {isZoomed ? 'ZOOM OUT' : 'ZOOM IN'}
                  </button>
                </div>
                    </div>
                  )}
                </div>

                {/* Mask Upload */}
                <div className="border-t border-ridge/20 pt-3 mt-3">
                  <div className="flex justify-between items-center mb-2">
                    <div className="text-[8px] uppercase tracking-wider text-mono-mid">PART MASK HIERARCHY</div>
                    <button
                      onClick={() => toggleMinimize('mask')}
                      className="text-[10px] text-mono-mid hover:text-ink transition-colors"
                    >
                      {minimizedSections.mask ? '▶' : '▼'}
                    </button>
                  </div>
                  
                  {!minimizedSections.mask && (
                    <>
                      <input 
                        ref={fileInputRef}
                        type="file" 
                        accept="image/*" 
                        onChange={handleMaskUpload}
                        className="hidden"
                        id="mask-upload"
                      />

                      {/* Hierarchical Part Grid */}
                      <div className="max-h-64 overflow-y-auto bg-paper/10 p-2 rounded border border-ridge/20 space-y-2">
                        {/* HEAD */}
                        <div className="text-center">
                          <button
                            onClick={() => setSelectedMaskPart('head')}
                            className={`w-16 h-16 mx-auto flex flex-col items-center justify-center border-2 transition-all relative ${selectedMaskPart === 'head' ? 'border-selection bg-selection/20' : 'border-ridge/50 hover:border-ridge'}`}
                            title="head"
                          >
                            {partMasks.head?.image && partMasks.head?.visible ? (
                              <img src={partMasks.head.image} alt="head" className="w-full h-full object-cover" />
                            ) : (
                              <div className="text-[24px] text-mono-mid text-center">HEAD</div>
                            )}
                          </button>
                          <button
                            onClick={() => setPartMasks(prev => ({ ...prev, head: { ...prev.head, visible: !prev.head.visible } }))}
                            className={`text-[20px] mt-1 w-16 py-0.5 font-bold uppercase transition-colors ${partMasks.head?.visible ? 'text-accent-green' : 'text-accent-red'}`}
                          >
                            {partMasks.head?.visible ? '●' : '○'} VIEW
                          </button>
                        </div>

                        {/* ARMS + COLLAR + TORSO LEVEL */}
                        <div className="flex justify-center items-start gap-4 py-2">
                          {/* LEFT ARM */}
                          <div className="flex flex-col items-center gap-1">
                            <button
                              onClick={() => setSelectedMaskPart('l_upper_arm')}
                              className={`w-12 h-16 flex flex-col items-center justify-center border-2 transition-all ${selectedMaskPart === 'l_upper_arm' ? 'border-selection bg-selection/20' : 'border-ridge/50 hover:border-ridge'}`}
                              title="l_upper_arm"
                            >
                              {partMasks.l_upper_arm?.image && partMasks.l_upper_arm?.visible ? (
                                <img src={partMasks.l_upper_arm.image} alt="l_upper_arm" className="w-full h-full object-cover" />
                              ) : (
                                <div className="text-[20px] text-mono-mid text-center">L<br/>ARM</div>
                              )}
                            </button>
                            <button
                              onClick={() => setPartMasks(prev => ({ ...prev, l_upper_arm: { ...prev.l_upper_arm, visible: !prev.l_upper_arm.visible } }))}
                              className={`text-[16px] w-12 py-0.5 font-bold uppercase transition-colors ${partMasks.l_upper_arm?.visible ? 'text-accent-green' : 'text-accent-red'}`}
                            >
                              {partMasks.l_upper_arm?.visible ? '●' : '○'}
                            </button>
                          </div>

                          {/* COLLAR */}
                          <div className="flex flex-col items-center gap-1">
                            <button
                              onClick={() => setSelectedMaskPart('collar')}
                              className={`w-12 h-12 flex flex-col items-center justify-center border-2 transition-all ${selectedMaskPart === 'collar' ? 'border-selection bg-selection/20' : 'border-ridge/50 hover:border-ridge'}`}
                              title="collar"
                            >
                              {partMasks.collar?.image && partMasks.collar?.visible ? (
                                <img src={partMasks.collar.image} alt="collar" className="w-full h-full object-cover" />
                              ) : (
                                <div className="text-[20px] text-mono-mid text-center">COL</div>
                              )}
                            </button>
                            <button
                              onClick={() => setPartMasks(prev => ({ ...prev, collar: { ...prev.collar, visible: !prev.collar.visible } }))}
                              className={`text-[16px] w-12 py-0.5 font-bold uppercase transition-colors ${partMasks.collar?.visible ? 'text-accent-green' : 'text-accent-red'}`}
                            >
                              {partMasks.collar?.visible ? '●' : '○'}
                            </button>
                          </div>

                          {/* RIGHT ARM */}
                          <div className="flex flex-col items-center gap-1">
                            <button
                              onClick={() => setSelectedMaskPart('r_upper_arm')}
                              className={`w-12 h-16 flex flex-col items-center justify-center border-2 transition-all ${selectedMaskPart === 'r_upper_arm' ? 'border-selection bg-selection/20' : 'border-ridge/50 hover:border-ridge'}`}
                              title="r_upper_arm"
                            >
                              {partMasks.r_upper_arm?.image && partMasks.r_upper_arm?.visible ? (
                                <img src={partMasks.r_upper_arm.image} alt="r_upper_arm" className="w-full h-full object-cover" />
                              ) : (
                                <div className="text-[20px] text-mono-mid text-center">R<br/>ARM</div>
                              )}
                            </button>
                            <button
                              onClick={() => setPartMasks(prev => ({ ...prev, r_upper_arm: { ...prev.r_upper_arm, visible: !prev.r_upper_arm.visible } }))}
                              className={`text-[16px] w-12 py-0.5 font-bold uppercase transition-colors ${partMasks.r_upper_arm?.visible ? 'text-accent-green' : 'text-accent-red'}`}
                            >
                              {partMasks.r_upper_arm?.visible ? '●' : '○'}
                            </button>
                          </div>
                        </div>

                        {/* FOREARMS + TORSO + FOREARMS LEVEL */}
                        <div className="flex justify-center items-start gap-4 py-2">
                          <div className="flex flex-col items-center gap-1">
                            <button
                              onClick={() => setSelectedMaskPart('l_lower_arm')}
                              className={`w-10 h-14 flex flex-col items-center justify-center border-2 transition-all ${selectedMaskPart === 'l_lower_arm' ? 'border-selection bg-selection/20' : 'border-ridge/50 hover:border-ridge'}`}
                              title="l_lower_arm"
                            >
                              {partMasks.l_lower_arm?.image && partMasks.l_lower_arm?.visible ? (
                                <img src={partMasks.l_lower_arm.image} alt="l_lower_arm" className="w-full h-full object-cover" />
                              ) : (
                                <div className="text-[16px] text-mono-mid">LA</div>
                              )}
                            </button>
                            <button
                              onClick={() => setPartMasks(prev => ({ ...prev, l_lower_arm: { ...prev.l_lower_arm, visible: !prev.l_lower_arm.visible } }))}
                              className={`text-[16px] w-10 py-0.5 font-bold uppercase transition-colors ${partMasks.l_lower_arm?.visible ? 'text-accent-green' : 'text-accent-red'}`}
                            >
                              {partMasks.l_lower_arm?.visible ? '●' : '○'}
                            </button>
                          </div>

                          <div className="flex flex-col items-center gap-1">
                            <button
                              onClick={() => setSelectedMaskPart('torso')}
                              className={`w-14 h-20 flex flex-col items-center justify-center border-2 transition-all ${selectedMaskPart === 'torso' ? 'border-selection bg-selection/20' : 'border-ridge/50 hover:border-ridge'}`}
                              title="torso"
                            >
                              {partMasks.torso?.image && partMasks.torso?.visible ? (
                                <img src={partMasks.torso.image} alt="torso" className="w-full h-full object-cover" />
                              ) : (
                                <div className="text-[20px] text-mono-mid text-center">TOR</div>
                              )}
                            </button>
                            <button
                              onClick={() => setPartMasks(prev => ({ ...prev, torso: { ...prev.torso, visible: !prev.torso.visible } }))}
                              className={`text-[16px] w-14 py-0.5 font-bold uppercase transition-colors ${partMasks.torso?.visible ? 'text-accent-green' : 'text-accent-red'}`}
                            >
                              {partMasks.torso?.visible ? '●' : '○'}
                            </button>
                          </div>

                          <div className="flex flex-col items-center gap-1">
                            <button
                              onClick={() => setSelectedMaskPart('r_lower_arm')}
                              className={`w-10 h-14 flex flex-col items-center justify-center border-2 transition-all ${selectedMaskPart === 'r_lower_arm' ? 'border-selection bg-selection/20' : 'border-ridge/50 hover:border-ridge'}`}
                              title="r_lower_arm"
                            >
                              {partMasks.r_lower_arm?.image && partMasks.r_lower_arm?.visible ? (
                                <img src={partMasks.r_lower_arm.image} alt="r_lower_arm" className="w-full h-full object-cover" />
                              ) : (
                                <div className="text-[16px] text-mono-mid">RA</div>
                              )}
                            </button>
                            <button
                              onClick={() => setPartMasks(prev => ({ ...prev, r_lower_arm: { ...prev.r_lower_arm, visible: !prev.r_lower_arm.visible } }))}
                              className={`text-[16px] w-10 py-0.5 font-bold uppercase transition-colors ${partMasks.r_lower_arm?.visible ? 'text-accent-green' : 'text-accent-red'}`}
                            >
                              {partMasks.r_lower_arm?.visible ? '●' : '○'}
                            </button>
                          </div>
                        </div>

                        {/* HANDS + WAIST + HANDS LEVEL */}
                        <div className="flex justify-center items-start gap-4 py-2">
                          <div className="flex flex-col items-center gap-1">
                            <button
                              onClick={() => setSelectedMaskPart('l_hand')}
                              className={`w-8 h-10 flex flex-col items-center justify-center border-2 transition-all ${selectedMaskPart === 'l_hand' ? 'border-selection bg-selection/20' : 'border-ridge/50 hover:border-ridge'}`}
                              title="l_hand"
                            >
                              {partMasks.l_hand?.image && partMasks.l_hand?.visible ? (
                                <img src={partMasks.l_hand.image} alt="l_hand" className="w-full h-full object-cover" />
                              ) : (
                                <div className="text-[12px] text-mono-mid">LH</div>
                              )}
                            </button>
                            <button
                              onClick={() => setPartMasks(prev => ({ ...prev, l_hand: { ...prev.l_hand, visible: !prev.l_hand.visible } }))}
                              className={`text-[16px] w-8 py-0.5 font-bold uppercase transition-colors ${partMasks.l_hand?.visible ? 'text-accent-green' : 'text-accent-red'}`}
                            >
                              {partMasks.l_hand?.visible ? '●' : '○'}
                            </button>
                          </div>

                          <div className="flex flex-col items-center gap-1">
                            <button
                              onClick={() => setSelectedMaskPart('waist')}
                              className={`w-12 h-14 flex flex-col items-center justify-center border-2 transition-all ${selectedMaskPart === 'waist' ? 'border-selection bg-selection/20' : 'border-ridge/50 hover:border-ridge'}`}
                              title="waist"
                            >
                              {partMasks.waist?.image && partMasks.waist?.visible ? (
                                <img src={partMasks.waist.image} alt="waist" className="w-full h-full object-cover" />
                              ) : (
                                <div className="text-[20px] text-mono-mid text-center">WA</div>
                              )}
                            </button>
                            <button
                              onClick={() => setPartMasks(prev => ({ ...prev, waist: { ...prev.waist, visible: !prev.waist.visible } }))}
                              className={`text-[16px] w-12 py-0.5 font-bold uppercase transition-colors ${partMasks.waist?.visible ? 'text-accent-green' : 'text-accent-red'}`}
                            >
                              {partMasks.waist?.visible ? '●' : '○'}
                            </button>
                          </div>

                          <div className="flex flex-col items-center gap-1">
                            <button
                              onClick={() => setSelectedMaskPart('r_hand')}
                              className={`w-8 h-10 flex flex-col items-center justify-center border-2 transition-all ${selectedMaskPart === 'r_hand' ? 'border-selection bg-selection/20' : 'border-ridge/50 hover:border-ridge'}`}
                              title="r_hand"
                            >
                              {partMasks.r_hand?.image && partMasks.r_hand?.visible ? (
                                <img src={partMasks.r_hand.image} alt="r_hand" className="w-full h-full object-cover" />
                              ) : (
                                <div className="text-[12px] text-mono-mid">RH</div>
                              )}
                            </button>
                            <button
                              onClick={() => setPartMasks(prev => ({ ...prev, r_hand: { ...prev.r_hand, visible: !prev.r_hand.visible } }))}
                              className={`text-[16px] w-8 py-0.5 font-bold uppercase transition-colors ${partMasks.r_hand?.visible ? 'text-accent-green' : 'text-accent-red'}`}
                            >
                              {partMasks.r_hand?.visible ? '●' : '○'}
                            </button>
                          </div>
                        </div>

                        {/* LEFT LEG */}
                        <div className="flex justify-center gap-8 py-2">
                          <div className="flex flex-col items-center gap-2">
                            <div className="text-[20px] text-mono-mid font-bold">L LEG</div>
                            <div className="flex flex-col items-center gap-1">
                              <button
                                onClick={() => setSelectedMaskPart('l_upper_leg')}
                                className={`w-10 h-14 flex flex-col items-center justify-center border-2 transition-all ${selectedMaskPart === 'l_upper_leg' ? 'border-selection bg-selection/20' : 'border-ridge/50 hover:border-ridge'}`}
                                title="l_upper_leg"
                              >
                                {partMasks.l_upper_leg?.image && partMasks.l_upper_leg?.visible ? (
                                  <img src={partMasks.l_upper_leg.image} alt="l_upper_leg" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="text-[16px] text-mono-mid">LU</div>
                                )}
                              </button>
                              <button
                                onClick={() => setPartMasks(prev => ({ ...prev, l_upper_leg: { ...prev.l_upper_leg, visible: !prev.l_upper_leg.visible } }))}
                                className={`text-[16px] w-10 py-0.5 font-bold uppercase transition-colors ${partMasks.l_upper_leg?.visible ? 'text-accent-green' : 'text-accent-red'}`}
                              >
                                {partMasks.l_upper_leg?.visible ? '●' : '○'}
                              </button>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                              <button
                                onClick={() => setSelectedMaskPart('l_lower_leg')}
                                className={`w-10 h-14 flex flex-col items-center justify-center border-2 transition-all ${selectedMaskPart === 'l_lower_leg' ? 'border-selection bg-selection/20' : 'border-ridge/50 hover:border-ridge'}`}
                                title="l_lower_leg"
                              >
                                {partMasks.l_lower_leg?.image && partMasks.l_lower_leg?.visible ? (
                                  <img src={partMasks.l_lower_leg.image} alt="l_lower_leg" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="text-[16px] text-mono-mid">LL</div>
                                )}
                              </button>
                              <button
                                onClick={() => setPartMasks(prev => ({ ...prev, l_lower_leg: { ...prev.l_lower_leg, visible: !prev.l_lower_leg.visible } }))}
                                className={`text-[16px] w-10 py-0.5 font-bold uppercase transition-colors ${partMasks.l_lower_leg?.visible ? 'text-accent-green' : 'text-accent-red'}`}
                              >
                                {partMasks.l_lower_leg?.visible ? '●' : '○'}
                              </button>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                              <button
                                onClick={() => setSelectedMaskPart('l_foot')}
                                className={`w-9 h-8 flex flex-col items-center justify-center border-2 transition-all ${selectedMaskPart === 'l_foot' ? 'border-selection bg-selection/20' : 'border-ridge/50 hover:border-ridge'}`}
                                title="l_foot"
                              >
                                {partMasks.l_foot?.image && partMasks.l_foot?.visible ? (
                                  <img src={partMasks.l_foot.image} alt="l_foot" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="text-[12px] text-mono-mid">LF</div>
                                )}
                              </button>
                              <button
                                onClick={() => setPartMasks(prev => ({ ...prev, l_foot: { ...prev.l_foot, visible: !prev.l_foot.visible } }))}
                                className={`text-[16px] w-9 py-0.5 font-bold uppercase transition-colors ${partMasks.l_foot?.visible ? 'text-accent-green' : 'text-accent-red'}`}
                              >
                                {partMasks.l_foot?.visible ? '●' : '○'}
                              </button>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                              <button
                                onClick={() => setSelectedMaskPart('l_toe')}
                                className={`w-8 h-6 flex flex-col items-center justify-center border-2 transition-all ${selectedMaskPart === 'l_toe' ? 'border-selection bg-selection/20' : 'border-ridge/50 hover:border-ridge'}`}
                                title="l_toe"
                              >
                                {partMasks.l_toe?.image && partMasks.l_toe?.visible ? (
                                  <img src={partMasks.l_toe.image} alt="l_toe" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="text-[12px] text-mono-mid">LT</div>
                                )}
                              </button>
                              <button
                                onClick={() => setPartMasks(prev => ({ ...prev, l_toe: { ...prev.l_toe, visible: !prev.l_toe.visible } }))}
                                className={`text-[16px] w-8 py-0.5 font-bold uppercase transition-colors ${partMasks.l_toe?.visible ? 'text-accent-green' : 'text-accent-red'}`}
                              >
                                {partMasks.l_toe?.visible ? '●' : '○'}
                              </button>
                            </div>
                          </div>

                          {/* RIGHT LEG */}
                          <div className="flex flex-col items-center gap-2">
                            <div className="text-[20px] text-mono-mid font-bold">R LEG</div>
                            <div className="flex flex-col items-center gap-1">
                              <button
                                onClick={() => setSelectedMaskPart('r_upper_leg')}
                                className={`w-10 h-14 flex flex-col items-center justify-center border-2 transition-all ${selectedMaskPart === 'r_upper_leg' ? 'border-selection bg-selection/20' : 'border-ridge/50 hover:border-ridge'}`}
                                title="r_upper_leg"
                              >
                                {partMasks.r_upper_leg?.image && partMasks.r_upper_leg?.visible ? (
                                  <img src={partMasks.r_upper_leg.image} alt="r_upper_leg" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="text-[16px] text-mono-mid">RU</div>
                                )}
                              </button>
                              <button
                                onClick={() => setPartMasks(prev => ({ ...prev, r_upper_leg: { ...prev.r_upper_leg, visible: !prev.r_upper_leg.visible } }))}
                                className={`text-[16px] w-10 py-0.5 font-bold uppercase transition-colors ${partMasks.r_upper_leg?.visible ? 'text-accent-green' : 'text-accent-red'}`}
                              >
                                {partMasks.r_upper_leg?.visible ? '●' : '○'}
                              </button>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                              <button
                                onClick={() => setSelectedMaskPart('r_lower_leg')}
                                className={`w-10 h-14 flex flex-col items-center justify-center border-2 transition-all ${selectedMaskPart === 'r_lower_leg' ? 'border-selection bg-selection/20' : 'border-ridge/50 hover:border-ridge'}`}
                                title="r_lower_leg"
                              >
                                {partMasks.r_lower_leg?.image && partMasks.r_lower_leg?.visible ? (
                                  <img src={partMasks.r_lower_leg.image} alt="r_lower_leg" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="text-[16px] text-mono-mid">RL</div>
                                )}
                              </button>
                              <button
                                onClick={() => setPartMasks(prev => ({ ...prev, r_lower_leg: { ...prev.r_lower_leg, visible: !prev.r_lower_leg.visible } }))}
                                className={`text-[16px] w-10 py-0.5 font-bold uppercase transition-colors ${partMasks.r_lower_leg?.visible ? 'text-accent-green' : 'text-accent-red'}`}
                              >
                                {partMasks.r_lower_leg?.visible ? '●' : '○'}
                              </button>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                              <button
                                onClick={() => setSelectedMaskPart('r_foot')}
                                className={`w-9 h-8 flex flex-col items-center justify-center border-2 transition-all ${selectedMaskPart === 'r_foot' ? 'border-selection bg-selection/20' : 'border-ridge/50 hover:border-ridge'}`}
                                title="r_foot"
                              >
                                {partMasks.r_foot?.image && partMasks.r_foot?.visible ? (
                                  <img src={partMasks.r_foot.image} alt="r_foot" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="text-[12px] text-mono-mid">RF</div>
                                )}
                              </button>
                              <button
                                onClick={() => setPartMasks(prev => ({ ...prev, r_foot: { ...prev.r_foot, visible: !prev.r_foot.visible } }))}
                                className={`text-[16px] w-9 py-0.5 font-bold uppercase transition-colors ${partMasks.r_foot?.visible ? 'text-accent-green' : 'text-accent-red'}`}
                              >
                                {partMasks.r_foot?.visible ? '●' : '○'}
                              </button>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                              <button
                                onClick={() => setSelectedMaskPart('r_toe')}
                                className={`w-8 h-6 flex flex-col items-center justify-center border-2 transition-all ${selectedMaskPart === 'r_toe' ? 'border-selection bg-selection/20' : 'border-ridge/50 hover:border-ridge'}`}
                                title="r_toe"
                              >
                                {partMasks.r_toe?.image && partMasks.r_toe?.visible ? (
                                  <img src={partMasks.r_toe.image} alt="r_toe" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="text-[12px] text-mono-mid">RT</div>
                                )}
                              </button>
                              <button
                                onClick={() => setPartMasks(prev => ({ ...prev, r_toe: { ...prev.r_toe, visible: !prev.r_toe.visible } }))}
                                className={`text-[16px] w-8 py-0.5 font-bold uppercase transition-colors ${partMasks.r_toe?.visible ? 'text-accent-green' : 'text-accent-red'}`}
                              >
                                {partMasks.r_toe?.visible ? '●' : '○'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Detail Panel for Selected Part */}
                      {selectedMaskPart && (
                        <div className="mt-2 p-2 bg-paper/10 rounded border border-ridge/20 space-y-2">
                          <div className="text-[8px] font-bold uppercase text-mono-mid">{selectedMaskPart}</div>
                          {!partMasks[selectedMaskPart]?.image ? (
                            <label 
                              htmlFor="mask-upload"
                              className="block w-full py-2 text-[8px] font-bold uppercase text-center cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] bg-mono-mid text-paper shadow-md"
                            >
                              UPLOAD MASK
                            </label>
                          ) : (
                            <div className="space-y-2">
                              <div className="text-[7px] text-ink bg-ridge p-1 rounded text-center">
                                {partMasks[selectedMaskPart]?.dimensions?.width}×{partMasks[selectedMaskPart]?.dimensions?.height}px
                              </div>
                              <div className="bg-paper/10 p-2 rounded border border-ridge/20 space-y-2">
                                <div className="text-[7px] uppercase tracking-wider text-mono-mid">Transform</div>
                                <div className="flex items-center gap-2">
                                  <label className="text-[6px] font-bold uppercase w-5">X:</label>
                                  <input 
                                    type="range" 
                                    min="-500" 
                                    max="500" 
                                    value={partMasks[selectedMaskPart]?.offsetX || 0}
                                    onChange={(e) => setPartMasks(prev => ({ ...prev, [selectedMaskPart]: { ...prev[selectedMaskPart], offsetX: Number(e.target.value) } }))}
                                    className="flex-1 h-2 bg-ridge rounded cursor-pointer"
                                  />
                                  <span className="text-[6px] w-6 text-right">{partMasks[selectedMaskPart]?.offsetX || 0}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <label className="text-[6px] font-bold uppercase w-5">Y:</label>
                                  <input 
                                    type="range" 
                                    min="-500" 
                                    max="500" 
                                    value={partMasks[selectedMaskPart]?.offsetY || 0}
                                    onChange={(e) => setPartMasks(prev => ({ ...prev, [selectedMaskPart]: { ...prev[selectedMaskPart], offsetY: Number(e.target.value) } }))}
                                    className="flex-1 h-2 bg-ridge rounded cursor-pointer"
                                  />
                                  <span className="text-[6px] w-6 text-right">{partMasks[selectedMaskPart]?.offsetY || 0}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <label className="text-[6px] font-bold uppercase w-5">SZ:</label>
                                  <input 
                                    type="range" 
                                    min="0.02" 
                                    max="6" 
                                    step="0.02"
                                    value={partMasks[selectedMaskPart]?.scale || 1}
                                    onChange={(e) => setPartMasks(prev => ({ ...prev, [selectedMaskPart]: { ...prev[selectedMaskPart], scale: Number(e.target.value) } }))}
                                    className="flex-1 h-2 bg-ridge rounded cursor-pointer"
                                  />
                                  <span className="text-[6px] w-6 text-right">{(partMasks[selectedMaskPart]?.scale || 1).toFixed(1)}x</span>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-1">
                                <label 
                                  htmlFor="mask-upload"
                                  className="block py-2 text-[7px] font-bold uppercase text-center cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] bg-mono-mid text-paper shadow-md"
                                >
                                  REPLACE
                                </label>
                                <button 
                                  onClick={removeMask}
                                  className="py-2 text-[7px] font-bold uppercase transition-all hover:scale-[1.02] active:scale-[0.98] bg-accent-red text-paper shadow-md"
                                >
                                  REMOVE
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="border-t border-ridge/20 pt-3 mt-3">
                  <div className="flex justify-between items-center mb-2">
                    <div className="text-[8px] uppercase tracking-wider text-mono-mid">PART VISIBILITY</div>
                    <button
                      onClick={() => toggleMinimize('visibility')}
                      className="text-[10px] text-mono-mid hover:text-ink transition-colors"
                    >
                      {minimizedSections.visibility ? '▶' : '▼'}
                    </button>
                  </div>
                  {!minimizedSections.visibility && (
                    <div className="max-h-40 overflow-y-auto custom-scrollbar grid grid-cols-2 gap-1">
                      {PROP_KEYS.map(k => (
                        <button
                          key={k}
                          onClick={() => setPartVisibility(prev => ({ ...prev, [k]: !prev[k] }))}
                          className={`py-2 text-[8px] font-bold uppercase transition-all hover:scale-[1.02] active:scale-[0.98] ${partVisibility[k] ? 'bg-accent-green text-paper' : 'bg-mono-mid text-paper'} shadow-md`}
                        >
                          {k.replace(/_/g, ' ')} {partVisibility[k] ? 'ON' : 'OFF'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex border-b border-ridge">
            {(['pose', 'proportions', 'library'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveControlTab(tab)} className={`flex-1 text-[9px] py-2 font-bold transition-all ${activeControlTab === tab ? 'text-selection border-b-2 border-selection bg-white/40' : 'opacity-40 hover:opacity-100'}`}>{tab.toUpperCase()}</button>
            ))}
          </div>

          <div className="flex-grow flex flex-col min-h-0">
            {activeControlTab === 'pose' && (
              <FKControls
                pivotOffsets={pivotOffsets}
                onPivotOffsetChange={(key, value) => !isTweening && setPivotOffsets(p => ({...p, [key]: value}))}
                jointModes={jointModes}
                onJointModeChange={(key, mode) => setJointMode(key, mode)}
                lastPoppedKey={lastPoppedKey}
                isTweening={isTweening}
                jointKeys={JOINT_KEYS}
              />
            )}
            {activeControlTab === 'proportions' && (
                <div className="flex flex-col gap-4 overflow-y-auto custom-scrollbar py-2 pr-1">
                    <div className="p-2 border border-ridge/20 rounded">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] uppercase font-bold text-ink">Global Scale</span>
                            <span className="text-[8px] font-mono text-mono-mid tabular-nums">{Math.round(globalScale)}</span>
                        </div>
                        <input type="range" min="50" max="250" value={globalScale} onChange={e => setGlobalScale(parseInt(e.target.value))} className="w-full accent-selection h-1 cursor-ew-resize" />
                    </div>
                    <div className="p-2 border border-ridge/20 rounded">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] uppercase font-bold text-ink">Limb Width</span>
                            <span className="text-[8px] font-mono text-mono-mid tabular-nums">{(globalBoneWidthMultiplier).toFixed(2)}x</span>
                        </div>
                        <input type="range" min="0.5" max="2" step="0.05" value={globalBoneWidthMultiplier} onChange={e => setGlobalBoneWidthMultiplier(parseFloat(e.target.value))} className="w-full accent-selection h-1 cursor-ew-resize" />
                    </div>
                    <div className="p-2 border border-ridge/20 rounded">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] uppercase font-bold text-ink">Limb Length</span>
                            <span className="text-[8px] font-mono text-mono-mid tabular-nums">{(globalLimbLengthMultiplier).toFixed(2)}x</span>
                        </div>
                        <input type="range" min="0.5" max="2" step="0.05" value={globalLimbLengthMultiplier} onChange={e => setGlobalLimbLengthMultiplier(parseFloat(e.target.value))} className="w-full accent-selection h-1 cursor-ew-resize" />
                    </div>
                </div>
            )}
            {activeControlTab === 'library' && (
              <div className="flex flex-col h-full gap-0">
                {/* Saved Poses - fixed max height */}
                <div className="max-h-[200px] overflow-y-auto custom-scrollbar border-b border-ridge">
                  {savedPoses.length > 0 && <div className="text-[9px] uppercase font-bold text-mono-mid px-2 py-1 sticky top-0 bg-white/10">SAVED POSES</div>}
                  {savedPoses.map(pe => (
                    <div key={pe.id} className="flex items-center justify-between p-2 border-b border-ridge hover:bg-white/40 group transition-colors">
                      <span className="text-[10px] uppercase font-bold">{pe.name}</span>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setPivotOffsets({ ...pe.pivotOffsets }); setJointModes({ ...pe.jointModes }); }} className="text-[8px] px-2 py-1 bg-selection text-paper uppercase hover:scale-105 active:scale-95 transition-transform">Load</button>
                        <button onClick={() => runTween(pe)} className="text-[8px] px-2 py-1 bg-mono-mid text-paper uppercase hover:scale-105 active:scale-95 transition-transform">Tween</button>
                      </div>
                    </div>
                  ))}
                  {savedPoses.length === 0 && (
                    <div className="p-4 text-center text-[9px] text-mono-mid">No saved poses yet</div>
                  )}
                </div>

                {/* Current Pose Info - fixed max height */}
                <div className="max-h-[200px] overflow-y-auto border-b border-ridge p-2 bg-white/20">
                  <div className="text-[10px] uppercase font-bold text-ink mb-2">CURRENT POSE (click to copy)</div>
                  <pre 
                    onClick={() => {
                      const poseCode = JSON.stringify({ pivotOffsets, jointModes }, null, 2);
                      navigator.clipboard.writeText(poseCode);
                      addLog('Pose code copied to clipboard');
                    }}
                    className="text-[7px] font-mono bg-paper p-2 rounded border border-ink/20 overflow-x-auto cursor-pointer hover:bg-selection/20 active:scale-95 transition-all"
                  >
{`pivotOffsets: {
${Object.entries(pivotOffsets).map(([k, v]) => `  ${k}: ${(v as number).toFixed(0)},`).join('\n')}
}

jointModes: {
${Object.entries(jointModes).map(([k, v]) => `  ${k}: '${v}',`).join('\n')}
}`}
                  </pre>
                </div>

                {/* Save Pose Button - fixed height */}
                <button 
                  onClick={saveCurrentPose} 
                  className={`w-full py-3 text-[10px] font-bold uppercase transition-all hover:scale-[1.02] active:scale-[0.98] ${saveConfirmation ? 'bg-accent-green text-paper scale-[1.02] shadow-lg' : 'bg-selection text-paper shadow-md'}`}
                >
                  {saveConfirmation ? '✓ SAVED' : 'SAVE POSE'}
                </button>

                {/* Export Poses Button */}
                <button 
                  onClick={exportPosesAsCode}
                  disabled={savedPoses.length === 0}
                  className="w-full py-2 text-[9px] font-bold uppercase transition-all hover:scale-[1.02] active:scale-[0.98] bg-mono-mid text-paper shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  EXPORT LIBRARY ({savedPoses.length})
                </button>
              </div>
            )}
          </div>

          {/* System Log - strictly at the bottom */}
          <div className="border-t border-ridge pt-2 flex flex-col gap-2 max-h-[200px] overflow-y-auto">
            <SystemLogger logs={systemLogs} isVisible={true} historyCount={tokens} />
            <button 
              onClick={() => setSystemLogs([])}
              className="w-full py-2 text-[8px] font-bold uppercase bg-ridge text-ink hover:bg-ink hover:text-paper transition-all active:scale-95"
            >
              CLEAR LOG
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 relative bg-paper flex items-center justify-center overflow-hidden">
        <div className="absolute top-4 right-4 z-50 text-right">
          <div className="text-[10px] text-mono-mid uppercase tracking-widest">Unit Tokens</div>
          <div className="text-2xl font-archaic text-ink">{tokens.toLocaleString()}</div>
        </div>

        <button onClick={() => setIsConsoleVisible(!isConsoleVisible)} className="absolute top-4 left-4 z-50 p-2 border border-ridge bg-white rounded-full transition-all hover:scale-110 active:scale-95 shadow-lg"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" /></svg></button>

        {/* Title screen removed */}
        
        <svg viewBox="-400 -500 800 1000" preserveAspectRatio="xMidYMid meet" className="w-full h-full overflow-visible relative z-10 drop-shadow-2xl" ref={svgRef}>
          {/* Single Mannequin render - all parts visible */}
          <g transform={`translate(${pinOffset.x}, ${mannequinOffsetY + pinOffset.y})`}>
            <Mannequin 
              pose={RESTING_BASE_POSE} 
              pivotOffsets={{...pivotOffsets, l_hand_flash: lHandFlash, r_hand_flash: rHandFlash} as any} 
              props={props} 
              showPivots={showPivots && isCalibrated} 
              showLabels={showLabels} 
              baseUnitH={baseH} 
              onAnchorMouseDown={(k, clientX, clientY) => handleAnchorMouseDown(k, clientX, clientY)} 
              draggingBoneKey={draggingBoneKey} 
              isPaused={true} 
              pinnedJoints={pinnedJoints} 
              partVisibility={partVisibility}
              partMasks={partMasks}
              offset={pinOffset} 
              jointModes={jointModes}
            />
          </g>
          
          {anomaly && (
            <g transform={`translate(${anomaly.x}, ${anomaly.y})`}>
              <rect x={-anomalySize / 2} y={-anomalySize / 2} width={anomalySize} height={anomalySize} className="fill-ink hover:fill-accent-red cursor-crosshair transition-all hover:scale-150 active:scale-90" />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
};

export default App;