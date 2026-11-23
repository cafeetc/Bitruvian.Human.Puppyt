# FK Controls Quick Reference

## Joints at a Glance

### Spine (5 joints)
| Joint | Default | Range | Effect |
|-------|---------|-------|--------|
| **Waist** | 0° | -45° to 45° | Body twist |
| **Torso** | 0° | -45° to 45° | Upper back bend |
| **Collar** | 0° | -30° to 30° | Shoulder yoke |
| **Neck** | 0° | -45° to 45° | Head rotation |

### Arms (6 joints)
| Joint | Default | Range | Effect |
|-------|---------|-------|--------|
| **R/L Shoulder** | 0° | -180° to 180° | Arm lift |
| **R/L Elbow** | 0° | -120° to 0° | Arm bend |
| **R/L Hand** | 0° | -180° to 180° | Wrist rotation |

### Legs (8 joints)
| Joint | Default | Range | Effect |
|-------|---------|-------|--------|
| **R/L Hip** | 180° | 120° to 240° | Leg forward/back |
| **R/L Knee** | 0° | -90° to 0° | Leg bend |
| **R/L Foot** | 0° | -45° to 45° | Ankle rotation |
| **R/L Toe** | 0° | -30° to 30° | Toe curl |

## Mode Indicators

```
Standard Mode (Default)       Bend Mode (B)              Stretch Mode (2)
━━━━━━━━━━━━━━━━━━━━━       ━━━━━━━━━━━━━━━━━━━━━     ━━━━━━━━━━━━━━━━━━━━━
1:1 Rotation Mapping         1.5x Amplification        0.5x Dampening
Perfect for accuracy         Expressive gestures       Fine-tuning details
```

## Common Angle Values

```
-180° / 180°  ← Behind (back)
  -90°        ← Left/Outer
   0°         ← Neutral/Forward
  90°         ← Right/Inner
  ±45°        ← Diagonal
```

## Control Panel Layout

```
┌─────────────────────────────┐
│ BITRUVIUS.CORE              │
├─────────────────────────────┤
│ [INITIALIZE ENGINE]         │
├─────────────────────────────┤
│ [T-POSE] [PIN FOOT] [REVERSE] │
│ [ANCHORS: OFF]              │
│                             │
│ IK CHAINS                   │
│ [RIGHT ARM IK] [LEFT ARM IK]│
│ [RIGHT LEG IK] [LEFT LEG IK]│
├─────────────────────────────┤
│ POSE | PROPORTIONS | LIBRARY│
├─────────────────────────────┤
│ ▼ Joint Sliders             │
│   (When POSE tab selected)  │
│                             │
│ • Waist: [|····|] 45°      │
│ • Torso: [|····|] 30°      │
│ • Collar: [|····|] 0°      │
│ • ... (16 more joints)      │
│                             │
│ [B] [2] buttons per joint   │
├─────────────────────────────┤
│ SYSTEM LOGGER               │
└─────────────────────────────┘
```

## Keyboard & Interaction Guide

| Action | Method | Result |
|--------|--------|--------|
| Adjust joint | Drag slider | Real-time update |
| Switch mode | Click B or 2 | Toggle joint behavior |
| Save pose | Click SAVE POSE | Store in library |
| Load pose | Hover → Click Load | Apply instantly |
| Animate to pose | Hover → Click Tween | Smooth animation |
| Activate IK | Click IK button | Override FK for chain |
| Pin foot | Click PIN FOOT | Anchor ankle position |
| Show joints | Click ANCHORS | Visualize joint positions |
| Reset to neutral | Click T-POSE | Back to T-Pose |

## Quick Poses

### Hands Up
```
R Shoulder: -90°
R Elbow: -90° (Mode: Bend for natural shape)
L Shoulder: 90°
L Elbow: -90° (Mode: Bend for natural shape)
```

### Arms Crossed
```
R Shoulder: 45°
R Elbow: -120°
L Shoulder: -45°
L Elbow: 120°
Torso: 15° (slight forward lean)
```

### Sitting
```
R Hip: 90°        L Hip: 90°
R Knee: 90°       L Knee: 90°
Torso: -15° (lean back slightly)
Neck: 0° or 15° (look forward/up)
```

### Walking Stride (R leg forward)
```
R Hip: 160°  (forward)   L Hip: 200°  (back)
R Knee: 20°  (bent)      L Knee: -20° (bent)
Waist: 15° (twist)       Torso: -10° (counter-rotate)
```

### Resting Idle
```
R Shoulder: -20°         L Shoulder: 20°
R Elbow: 30°            L Elbow: -30°
R Hand: 10°             L Hand: -10°
Waist: 0°               Torso: 0°
Neck: 5° (slight tilt)  Collar: 0°
```

### Action Pose
```
Waist: 20°               Torso: -15°
R Shoulder: -90°         L Shoulder: 45°
R Elbow: 0°              L Elbow: -60°
R Hand: -45°             L Hand: 20°
Collar: 10°              Neck: 30°
```

## Toggle Reference

| Toggle | OFF State | ON State | Purpose |
|--------|-----------|----------|---------|
| ANCHORS | Hidden | Visible | Show joint positions |
| REVERSE | Waist Root | Head Root | Change hierarchy |
| PIN FOOT | Free | Pinned | Lock ankle position |
| IK Chains | OFF | ON | Activate inverse kinematics |

## Color Coding

```
Active Button: Purple background, white text
Inactive Button: Light background, dark text
Hover State: Scale up 105%, slight shadow
Active Mode: Filled square with dark background
Inactive Mode: Outlined square, light color
```

## Performance Tips

✓ Use **Standard Mode** for normal poses  
✓ Use **Bend Mode (B)** for expressive gestures  
✓ Use **Stretch Mode (2)** for final tweaks  
✓ Save frequently to library as checkpoints  
✓ Use **T-POSE** to reset when stuck  
✓ Enable **ANCHORS** only when debugging  
✓ Use **IK chains** for end-effector targeting  

## Troubleshooting Quick Fixes

| Problem | Solution |
|---------|----------|
| Can't move joint | Check if IK is active or tweening |
| Puppet looks broken | Click T-POSE to reset |
| Movements too large | Switch to Stretch Mode (2) |
| Movements too small | Switch to Bend Mode (B) |
| Foot drifting | Click PIN FOOT to anchor |
| Position off | Click REVERSE to change hierarchy |
| Not seeing joints | Click ANCHORS: ON |

## Proportions Quick Access

Switch to **PROPORTIONS** tab to adjust:
- **Global Scale**: 50-250 (puppet size)
- **Limb Width**: 0.5-2.0x (bone thickness)
- **Limb Length**: 0.5-2.0x (limb proportions)

## Saving & Loading

**To Save:**
1. Adjust joints to desired pose
2. Go to LIBRARY tab
3. Click SAVE POSE
4. Enter name in prompt

**To Load:**
1. Go to LIBRARY tab
2. Hover over pose name
3. Click LOAD (instant) or TWEEN (animated)

## System Info Display

**Top Right Corner:**
- 🎖️ Unit Tokens counter
- Shows interaction history

**Bottom Left:**
- System Logger
- Displays pose state changes
- Shows interaction feedback

## Angle Reference Chart

```
Perfect Vertical (Down): 180° (for legs)
Perfect Vertical (Up):   0° (for arms)
Horizontal Right:        90°
Horizontal Left:         -90°
Behind/Back:             ±180°

For Natural Motion:
- Shoulder: -180° to 180° (full range)
- Elbow: -120° to 0° (don't extend beyond straight)
- Hip: 120° to 240° (forward to back)
- Knee: -90° to 0° (only bends)
```

## Mode Behavior Summary

```
Standard (S)         Bend (B)            Stretch (2)
-180° → -180°       -180° → -270°       -180° → -90°
-90° → -90°         -90° → -135°        -90° → -45°
0° → 0°             0° → 0°             0° → 0°
90° → 90°           90° → 135°          90° → 45°
180° → 180°         180° → 270°         180° → 90°

Multiplier: 1.0     Multiplier: 1.5     Multiplier: 0.5
```

## Hotkeys (Keyboard Shortcuts)

Currently available:
- Click any button for its function
- Drag sliders for joint control
- Hover for tooltips

Future enhancement: Custom key bindings

---

**For more details, see:**
- 📖 FK_USAGE_GUIDE.md (Complete user manual)
- ⚙️ FK_TECHNICAL_DOCS.md (Developer reference)
- 🎯 FK_IMPLEMENTATION.md (Feature overview)
