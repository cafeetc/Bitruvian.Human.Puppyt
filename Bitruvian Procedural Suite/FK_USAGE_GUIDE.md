# FK Controls Usage Guide

## Quick Start

### Step 1: Launch the Application
```bash
npm install
npm run dev
```
Then navigate to `http://localhost:3000/`

### Step 2: Initialize the Puppet
- Click the **"INITIALIZE ENGINE"** button to boot up the system
- The puppet will appear in the center canvas
- You'll see "Bitruvian Station" splash text

### Step 3: Access FK Controls
1. Look at the left control panel
2. Click the **"POSE"** tab at the top
3. You'll see all 18 joint sliders

## Joint Organization

### Spine & Head
- **Waist**: Root rotation
- **Torso**: Upper body rotation
- **Collar**: Shoulder yoke
- **Neck**: Head rotation

### Right Arm
- **R Shoulder**: Upper arm attachment
- **R Elbow**: Arm bend
- **R Hand**: Wrist/hand rotation

### Left Arm
- **L Shoulder**: Upper arm attachment
- **L Elbow**: Arm bend
- **L Hand**: Wrist/hand rotation

### Right Leg
- **R Hip**: Leg attachment
- **R Knee**: Leg bend
- **R Foot**: Ankle rotation
- **R Toe**: Toe rotation

### Left Leg
- **L Hip**: Leg attachment
- **L Knee**: Leg bend
- **L Foot**: Ankle rotation
- **L Toe**: Toe rotation

## Control Modes

Each joint has three modes accessible via the B and 2 buttons:

### Standard Mode (Default)
- **Button**: (Neither B nor 2 selected)
- **Effect**: Normal 1:1 rotation mapping
- **Use Case**: Precise anatomical poses
- **Behavior**: Slider value directly sets joint angle

### Bend Mode (B)
- **Button**: Click the "B" button
- **Effect**: 1.5x rotation amplification
- **Use Case**: Exaggerated expressions and gestures
- **Behavior**: Small slider movements create larger rotations

### Stretch Mode (2)
- **Button**: Click the "2" button
- **Effect**: 0.5x rotation dampening
- **Use Case**: Subtle, nuanced adjustments
- **Behavior**: Large slider movements create smaller rotations

## Common Poses

### Neutral/T-Pose
Click **"T-POSE"** button to instantly reset to anatomical neutral position.

### Raised Arms
1. Set **R Shoulder** to -90° (left mode B for exaggeration)
2. Set **L Shoulder** to 90°
3. Adjust elbows to 45° for relaxed pose or -90° for straight arms

### Walking Stride
1. **R Hip**: 160° (forward)
2. **R Knee**: 20° (slightly bent)
3. **L Hip**: 200° (back)
4. **L Knee**: -20° (bent)
5. Rotate **Waist** 15° for natural motion

### Looking Over Shoulder
1. Keep body still
2. Adjust **Neck** to ±45°
3. Use **Collar** for upper back twist if needed

### Sitting Position
1. **Waist**: 0° (neutral)
2. **R Hip**: 90° (down)
3. **R Knee**: 90° (bent)
4. **L Hip**: 90° (down)
5. **L Knee**: 90° (bent)

### Resting Idle
1. **R Shoulder**: -20° (relaxed)
2. **R Elbow**: 30° (bent)
3. **R Hand**: 10° (natural hand angle)
4. **L Shoulder**: 20° (relaxed)
5. **L Elbow**: -30° (bent)
6. **L Hand**: -10° (natural hand angle)

## Advanced Techniques

### Blending FK with IK
1. Use FK controls to create a base pose
2. Click an **IK** button to activate a chain (e.g., "RIGHT ARM IK")
3. Drag the hand anchor point to adjust the end effector
4. FK controls lock while IK is active
5. Deactivate IK to return to FK control

### Saving Custom Poses
1. Adjust joints to desired position
2. Scroll to **"LIBRARY"** tab
3. Click **"SAVE POSE"** button
4. Enter pose name in prompt
5. Pose is saved and appears in library list

### Loading Saved Poses
1. Go to **"LIBRARY"** tab
2. Hover over a saved pose
3. Click **"Load"** to instantly apply
4. Click **"Tween"** to smoothly animate to that pose

### Using Proportions with FK
1. Switch to **"PROPORTIONS"** tab
2. Adjust **Global Scale** for size
3. Adjust **Limb Width** for thickness
4. Adjust **Limb Length** for proportion
5. Return to **"POSE"** tab to pose the character

### Pinning Feet While Posing
1. Click **"PIN FOOT"** button (becomes "FOOT PINNED")
2. Right ankle locks in place
3. Adjust upper body with FK controls
4. Waist/hip movements will adjust the body position instead
5. Click **"FOOT PINNED"** again to unpin

## Angle Reference Guide

### Common Angles
- **0°**: Neutral/pointing down (for legs)
- **90°**: Right/east direction
- **-90°**: Left/west direction
- **180°**: Up/north direction
- **±45°**: Diagonal positions

### Joint-Specific Ranges
- **Shoulder**: -180° to 180° (full range)
- **Elbow**: -120° to 0° (typical bend range)
- **Hip**: 120° to 240° (forward/back)
- **Knee**: -90° to 0° (bend only)
- **Waist**: -45° to 45° (twist limit)

## Keyboard Shortcuts
- **Click "ANCHORS: OFF"** to toggle joint visualization
- **Click "REVERSE"** to toggle hierarchy root (head vs waist)
- **Console button (top-left)** to view system logs

## Troubleshooting

### Joints Not Moving
- Check if **tweening is active** (disable with save/load buttons)
- Ensure **IK chain is not active** for that limb
- Try refreshing the page

### Pose Looks Wrong
- Verify **joint mode** is appropriate (try Standard mode first)
- Check if **foot pinning** is causing unexpected movement
- Reset to **T-POSE** and build from neutral

### Performance Issues
- Reduce number of **ANCHORS** visualization
- Close **system logger** console if not needed
- Try reducing proportions **Global Scale**

## Tips & Tricks

1. **Use Bend Mode (B)** for expressive gestures and actions
2. **Use Stretch Mode (2)** for fine-tuning final details
3. **Save frequently** to library as checkpoints
4. **Use Tween** between poses for smooth animations
5. **Combine proportions adjustments** with poses for character design
6. **Study reference images** for accurate human anatomy
7. **Use T-POSE** as a starting point for new poses
8. **Enable ANCHORS** to see exact joint positions for debugging

## Common Pose Templates

You can quickly create these poses by adjusting specific joints:

```
STANDARD_IDLE = {
  waist: 0, torso: 0, collar: 0, neck: 0,
  l_shoulder: 20, l_elbow: -30, l_hand: -10,
  r_shoulder: -20, r_elbow: 30, r_hand: 10,
  l_hip: 180, l_knee: 0, l_foot: 0, l_toe: 0,
  r_hip: 180, r_knee: 0, r_foot: 0, r_toe: 0
}

DYNAMIC_ACTION = {
  waist: 20, torso: -15, collar: 10, neck: 30,
  l_shoulder: 45, l_elbow: -60, l_hand: 20,
  r_shoulder: -90, r_elbow: 0, r_hand: -45,
  l_hip: 170, l_knee: -15, l_foot: -20, l_toe: 0,
  r_hip: 190, r_knee: 15, r_foot: 20, r_toe: 0
}

RELAXED_SIT = {
  waist: 5, torso: -10, collar: 0, neck: 5,
  l_shoulder: 45, l_elbow: 60, l_hand: 45,
  r_shoulder: -45, r_elbow: -60, r_hand: -45,
  l_hip: 90, l_knee: 90, l_foot: 0, l_toe: 0,
  r_hip: 90, r_knee: 90, r_foot: 0, r_toe: 0
}
```

## Getting Help

- **Hover over any control** for tooltips and descriptions
- **Check the system logger** (bottom-left panel) for state information
- **Review AUDIT_LOG.md** in the project root for historical changes
- **Inspect the Mannequin component** source code for anatomical details
