# FK System Technical Documentation

## Architecture Overview

### Component Hierarchy
```
App
├── Control Panel
│   ├── Calibration Controls
│   ├── Tab Navigation (pose, proportions, library)
│   └── Active Tab Content
│       └── FKControls (POSE tab)
├── Main Canvas
│   ├── System Grid/Guides
│   ├── SVG Viewport
│   │   └── Mannequin
│   │       ├── Bone Components
│   │       ├── Joint Visualizations
│   │       └── IK Target Indicators
│   └── Token Counter
└── Console/Logger
```

## Data Flow Diagram

```
User Interaction
    ↓
FKControls.tsx receives event
    ↓
onPivotOffsetChange callback fired
    ↓
App.tsx setPivotOffsets hook updates
    ↓
React re-renders with new props
    ↓
Mannequin.tsx receives updated pivotOffsets
    ↓
getMannequinWorldTransformsHelper calculates new transforms
    ↓
Bone components render with new positions
    ↓
Visual puppet updates on screen
```

## State Management

### Key State Variables
```typescript
// Joint rotation state (18 values: -180 to 180 degrees)
const [pivotOffsets, setPivotOffsets] = useState<WalkingEnginePivotOffsets>({...});

// Joint control modes (18 values: 'standard' | 'bend' | 'stretch')
const [jointModes, setJointModes] = useState<Record<keyof WalkingEnginePivotOffsets, JointMode>>({...});

// Currently tweening animation
const [isTweening, setIsTweening] = useState(false);

// Last interacted control (for pop animation)
const [lastPoppedKey, setLastPoppedKey] = useState<string | null>(null);
```

### State Update Flow
1. User adjusts slider → `onPivotOffsetChange` callback
2. Callback updates `pivotOffsets` state
3. React detects state change
4. Mannequin component re-renders with new values
5. SVG updates with calculated transforms

## Component Details

### FKControls.tsx
**Purpose**: Render joint control sliders and mode toggles

**Props**:
- `pivotOffsets`: Current joint rotation values
- `onPivotOffsetChange`: Callback for rotation changes
- `jointModes`: Current joint control modes
- `onJointModeChange`: Callback for mode changes
- `lastPoppedKey`: Track last clicked control for animations
- `isTweening`: Disable controls during animation
- `jointKeys`: Array of all controllable joints

**Key Features**:
- Lazy rendering of joint controls
- Real-time angle display
- Mode toggle buttons (B, 2)
- Disabled state during tweening
- Smooth hover effects and transitions

### Mannequin.tsx
**Purpose**: Calculate and render puppet skeleton

**Key Functions**:
- `getMannequinWorldTransformsHelper()`: Calculate world-space transforms
- Renders hierarchy of bones based on parent-child relationships
- Applies joint modes (bend/stretch modifiers)
- Handles both standard and reversed hierarchies

**Transform Calculation**:
```typescript
// For each bone:
1. Get local pivot rotation from pivotOffsets
2. Apply joint mode modifier (standard/bend/stretch)
3. Calculate world rotation = parent rotation + local + offset
4. Calculate position = parent position + rotated bone vector
5. Store in transform object for rendering
```

## FK vs IK Integration

### FK System
- Direct joint control
- No constraints
- Instant response
- User has full control
- End-effector position depends on chain

### IK System
- End-effector targeting
- Automatic joint adjustment
- Uses FABRIK solver
- User positions the hand/foot
- Joint angles calculated to reach target

### Coexistence
```
// When IK is active for a chain:
- That chain's joints are locked from FK control
- IK solver overrides pivotOffsets for those joints
- Other joints remain under FK control
- Deactivating IK returns control to FK
```

## Kinematics Utilities

### `clampRotation(angle: number): number`
Constrains rotation to [-180°, 180°] range
```typescript
clampRotation(270) // → -90
clampRotation(-270) // → 90
clampRotation(45) // → 45
```

### `normalizeRotation(angle: number): number`
Normalizes rotation to [0°, 360°) range
```typescript
normalizeRotation(-45) // → 315
normalizeRotation(450) // → 90
normalizeRotation(35) // → 35
```

### `lerpRotation(start, end, t): number`
Interpolates between rotations via shortest path
```typescript
// Avoids wrapping issues when crossing 180/-180 boundary
lerpRotation(170, -170, 0.5) // → 180 (shortest path)
// Rather than:
lerp(170, -170, 0.5) // → 0 (long way around)
```

### `getWorldRotation(parentRot, localRot, offset): number`
Converts local rotation to world space
```typescript
getWorldRotation(45, 30, 0) // → 75
getWorldRotation(45, 30, -90) // → -15 (with parent offset)
```

## Joint Modes Implementation

### Mode Calculation in Mannequin.tsx
```typescript
const calculateJointRotation = (boneKey: string, parentRot: number) => {
  const local = pivotOffsets[boneKey];
  const mode = jointModes[boneKey];
  
  switch(mode) {
    case 'bend': 
      return parentRot + (local * 1.5); // 1.5x amplification
    case 'stretch': 
      return parentRot + (local * 0.5); // 0.5x dampening
    default: 
      return parentRot + local; // 1:1 mapping
  }
};
```

### Visual Feedback
- Selected mode button shows: filled background + shadow + slight lift
- Unselected modes show: outlined style + reduced opacity
- Hover effect scales button for better feedback
- Click triggers pop animation

## Performance Optimizations

### Rendering
1. **Lazy Evaluation**: World transforms only calculated when pivotOffsets changes
2. **Memoization**: `useMemo` caches transform calculations
3. **Callback Memoization**: `useCallback` prevents unnecessary re-renders
4. **Key Props**: Proper React keys for list rendering

### State Updates
1. **Batched Updates**: React automatically batches state changes
2. **Controlled Re-renders**: Only Mannequin component re-renders on pivot changes
3. **Early Returns**: Guard clauses prevent unnecessary calculations

### DOM Updates
1. **SVG Rendering**: Only affected elements update
2. **Transform Attributes**: Direct SVG attribute updates
3. **CSS Classes**: Minimal CSS recalculations

## Type Definitions

### WalkingEnginePivotOffsets
```typescript
type WalkingEnginePivotOffsets = {
  // Spine (5 joints)
  waist: number;
  torso: number;
  collar: number;
  neck: number;
  
  // Right Arm (3 joints)
  r_shoulder: number;
  r_elbow: number;
  r_hand: number;
  
  // Left Arm (3 joints)
  l_shoulder: number;
  l_elbow: number;
  l_hand: number;
  
  // Right Leg (4 joints)
  r_hip: number;
  r_knee: number;
  r_foot: number;
  r_toe: number;
  
  // Left Leg (4 joints)
  l_hip: number;
  l_knee: number;
  l_foot: number;
  l_toe: number;
};
```

### JointMode
```typescript
type JointMode = 'standard' | 'bend' | 'stretch';
```

## Hierarchical Structure

### Kinematic Chain
The puppet follows a hierarchical structure for calculating rotations:

```
Waist (root)
├── Torso
│   ├── Collar
│   │   ├── Neck → Head
│   │   ├── R Shoulder → R Elbow → R Hand
│   │   └── L Shoulder → L Elbow → L Hand
├── R Hip → R Knee → R Foot → R Toe
└── L Hip → L Knee → L Foot → L Toe
```

### Rotation Propagation
```
Parent World Rotation
    ↓
+ Local Pivot Offset (from slider)
    ↓
× Joint Mode Multiplier (1.0, 1.5, or 0.5)
    ↓
+ Parent Offset Angle (fixed for limb direction)
    ↓
= Child World Rotation
    ↓
Use Child Rotation to Position Child Bone
```

## Browser APIs Used

### SVG Transforms
- `transform` attribute with `translate()` and `rotate()`
- Direct DOM element manipulation via refs

### React Hooks
- `useState`: State management
- `useEffect`: Side effects (localStorage, IK solving)
- `useRef`: Persistent object references
- `useCallback`: Memoized callbacks
- `useMemo`: Memoized values

### DOM Events
- Mouse events (onMouseDown, onMouseMove, onMouseUp)
- Input events (onChange on sliders)
- Click events on buttons

## Integration Points

### With Mannequin Component
- FKControls provides pivotOffsets
- Mannequin receives and applies rotations
- Bone components render visual representation

### With IK System
- IK chains override FK when active
- Shared pivotOffsets state
- Separate control activation logic

### With Pose Library
- Saved poses include pivotOffsets and jointModes
- Loading applies FK state
- Tweening interpolates FK values

### With Proportions System
- FK independent of proportions
- Both affect visual size/shape
- Work together for character design

## Error Handling

### Boundary Conditions
```typescript
// Angle clamping prevents invalid values
if (angle > 180) angle -= 360;
if (angle < -180) angle += 360;

// Zero division prevention in vector math
const d = Math.sqrt(v.x*v.x + v.y*v.y);
return d > 0 ? {...} : {x: 0, y: 0};
```

### State Validation
- Default values provided for all joint modes
- Type checking via TypeScript
- Null/undefined checks before calculations

## Testing Strategy

### Unit Tests (Recommended)
```typescript
// Test kinematics utilities
test('clampRotation wraps angles correctly')
test('lerpRotation takes shortest path')
test('getWorldRotation composes transforms')

// Test FKControls
test('FKControls renders all joint sliders')
test('FKControls calls onPivotOffsetChange')
test('FKControls disables during tweening')

// Test Mannequin
test('Mannequin calculates correct transforms')
test('Mannequin applies joint modes')
test('Mannequin handles reversed hierarchy')
```

### Integration Tests
- Verify FK controls update puppet visually
- Test joint mode switching
- Verify pose saving/loading works
- Test FK + IK interaction

### Manual Tests
- Visual inspection of poses
- Performance benchmarking
- Cross-browser compatibility
- Responsiveness testing

## Future Enhancement Hooks

### Constraint System
```typescript
interface JointConstraint {
  key: keyof WalkingEnginePivotOffsets;
  min: number;
  max: number;
}
// Add min/max range validation per joint
```

### Animation Recording
```typescript
type KeyFrame = {
  time: number;
  pivotOffsets: WalkingEnginePivotOffsets;
};
// Record and playback FK animations
```

### Gesture Recognition
```typescript
// Detect common poses (idle, walk, jump, etc.)
// Auto-suggest similar saved poses
```

### Skeletal Presets
```typescript
interface SkeletalPreset {
  proportions: WalkingEngineProportions;
  poses: SavedPoseEntry[];
}
// Save and load complete character designs
```

## Debugging Tips

### Using Browser DevTools
1. Open Console tab
2. Inspect React state in React DevTools
3. Check SVG elements in Elements tab
4. Use Network tab to monitor state changes

### Checking State Values
```javascript
// In browser console:
// Inspect current pivotOffsets
console.log(pivotOffsets);

// Test angle conversion
console.log(lerpRotation(170, -170, 0.5));
```

### Visual Debugging
1. Enable "ANCHORS: ON" to see joint positions
2. Watch system logger for state changes
3. Check token counter for interaction feedback
4. Review pose values after loading

## Performance Metrics

### Target Performance
- **Render time**: < 16ms per frame (60 FPS)
- **Slider response**: < 50ms perceived latency
- **IK solve time**: < 100ms for 3-bone chain
- **Memory usage**: < 50MB for full app

### Optimization Strategies
1. Memoize expensive calculations
2. Batch state updates
3. Use CSS transforms for animations
4. Lazy load components
5. Optimize re-render triggers

## Conclusion

The FK system is designed to be:
- **Intuitive**: Direct joint control with visual feedback
- **Performant**: Optimized calculations and rendering
- **Extensible**: Hook points for IK, constraints, and presets
- **Maintainable**: Clear separation of concerns
- **Compatible**: Works seamlessly with existing systems
