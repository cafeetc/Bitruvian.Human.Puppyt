# Application layout and feature reference — v0.2

Part of the [complete app reference](APP_REFERENCE_v0.2.md), sections 4–5. This page can be read on its own; the complete reference contains all three chapters in one document.

## 4. Application base behavior

The browser view has a full-window SVG mannequin viewport and a collapsible left control console. The console is hidden on initial render. Its menu button opens and closes the controls. The viewport uses a fixed `viewBox` of `-400 -500 800 1000` and preserves its aspect ratio while filling the available space.

On initial render:

- The app starts in the `MOUNTAINVIEW` pose, which is the straight T-pose with both hip values set to 0 in the current values. The T-POSE preset instead uses hip values of 180°, feet at −90°/+90°, and arms and other joints at 0°.
- Global scale is 94; global limb-width and limb-length multipliers are 1.0.
- Navel pinning is enabled and the console is hidden.
- All 18 parts and all mask slots are visible; mask slots are empty.
- The pose tab is selected. Joint modes start at `standard`.
- System log starts empty; Unit Tokens start at zero.
- Pivots are enabled internally, while labels are disabled internally. No interface control currently changes either setting.

The overall visual style uses a light paper background, dark vector parts, an olive collar, red joint anchors, and monospace system controls. The page is a single SVG figure editor, not a multi-panel or multi-viewport scene tool.

## 5. Detailed feature inventory

### 5.1 Console and engine controls

The menu button toggles the left console. Its engine section can be collapsed. Engine actions are:

- **T-POSE:** runs a tween toward a built-in preset, resets global scale to 94 and width/length multipliers to 1, and sets the preset’s standard joint modes.
- **NAVEL PINNED / PIN NAVEL:** toggles waist pinning. When on, the waist position is recomputed to stay at the mannequin’s local center as pose, scale, or proportions change. The current pinned-joint set is limited to waist.
- **ZOOM IN / ZOOM OUT:** toggles global scale between 94 and 188. This is a scale change, not a separate camera zoom transform.
- **INITIALIZE ENGINE:** code exists for initialization, but `isCalibrated` begins true and no current UI action sets it false. The button is therefore not reached in normal use.

The viewport also displays a Unit Tokens counter. Tokens are awarded by direct bone drag: the gain uses a chain-depth multiplier and doubles after more than 1.5 seconds without interaction or while a tween is running. The counter is in-memory only and is not a pose-editing currency or persisted value.

### 5.2 Direct posing in the viewport

When the pivots are shown, a user can start dragging a visible body part or its red joint anchor. Horizontal pointer displacement changes that part’s rotation by 0.5 degrees per pixel. The drag tracks mouse movement until mouse-up. The user cannot start a drag on a joint whose mode is `locked`, and drag edits are ignored during a tween.

The mannequin is passed `isPaused=true`, so the drag affordance is available. Part visibility can remove the vector shape that normally receives the mouse event; the joint anchor is only rendered when the part itself is visible.

### 5.3 Pose tab: forward-kinematic controls

The Pose tab lists all 18 joint keys. Each row has a rotation readout, a slider from −180° to +180°, and mode buttons. The slider is disabled during tweening and whenever the joint mode is `locked`.

Mode behavior in the current transform helper:

| Mode | Rotation contribution | UI |
|---|---|---|
| Standard | Parent rotation + local offset | Default; no explicit mode button |
| Bend | Parent rotation + 1.5 × local offset | `B` button |
| Stretch | Parent rotation + 0.5 × local offset | `2` button |
| Locked | Parent rotation only; local offset is ignored | `L` button shown only for `neck` |

Clicking an active mode button toggles it back to `standard`. The locked mode is only offered for the neck row in the current component. Direct drag checks for `locked`; the mode button and sliders are disabled during tweening.

The controls are forward kinematics: local joint values propagate through the parent-child transforms. The app does not currently provide a user-facing target handle or call the FABRIK solver during direct manipulation.

### 5.4 Proportions tab: procedural model controls

The Proportions tab has three sliders:

| Control | Range | Step | Initial value | Effect |
|---|---:|---:|---:|---|
| Global Scale | 50–250 | 1 | 94 | Changes the base head-unit scale for every part |
| Limb Width | 0.5×–2× | 0.05 | 1.0× | Applies a common width multiplier to all part definitions |
| Limb Length | 0.5×–2× | 0.05 | 1.0× | Applies a common height/length multiplier to all part definitions |

The control labels say “Limb” but the implementation multiplies every part’s corresponding width or height value, including the head, torso, collar, and waist. Separate per-part proportion values are present in the data model but have no visible controls in this tab.

### 5.5 Part mask hierarchy

The engine panel contains a diagram-like grid of all 18 model parts. Selecting a tile chooses the destination for the next upload. Each tile can toggle its mask’s visibility independently. The selected tile’s detail panel supports upload, replace, remove, and transform adjustment.

Supported behavior is browser-local. The app uses a file input accepting images, converts processed content to a data URL, and renders the image directly in SVG. There is no asset library, filesystem export, linked-pair operation, or mask persistence across reloads in the current source.

### 5.6 Part visibility

The Part Visibility grid contains one on/off button for every procedural body part. It changes the vector part’s rendering visibility. The control is independent for left and right limbs. As described above, this setting does not automatically hide a mask attached to the same part.

### 5.7 Pose library tab

The Library tab contains saved poses, a current-pose text block, and save/export actions.

- **Save Pose:** appends a pose named `Pose N`, where N is the current library length plus one. A record contains an ID based on the current time, name, all pivot offsets, all proportions, and joint modes.
- **Persistence:** saved pose records are loaded from and written to browser `localStorage` under `bitruvian_library`. This is local to the current browser profile and origin.
- **Load:** immediately replaces joint offsets and joint modes with the selected pose. It does not set proportions in the direct Load handler.
- **Tween:** animates pivot offsets and proportions to the saved record over 1000 ms with `easeInOutQuad` by default. Joint modes remain at the starting values during the tween and switch to the target values at completion. Rotation interpolation is linear between numeric values; it does not choose the shortest wrapped angular path.
- **Current Pose block:** displays rounded joint values and mode names. Clicking copies JSON containing `pivotOffsets` and `jointModes` to the clipboard; it does not include proportions.
- **Export Library:** copies generated TypeScript pose data to the clipboard and downloads a `pose-library.ts` file. The generated records include pivot offsets, modes, and proportions. It is disabled when the library is empty.

There is no rename, delete, reorder, import, per-pose preview, or project-wide save action in the current UI.

### 5.8 Tweening

The tween engine uses `requestAnimationFrame`, a default duration of 1000 ms, and the `easeInOutQuad` easing function. Other easing implementations (`linear`, `snapOut`) exist in code but there is no current interface for choosing them or changing duration. During a tween, the Pose tab’s sliders and mode buttons are disabled; direct dragging is ignored. The tween sets the final proportions and modes at completion and adds a log entry.

### 5.9 System log and status

The console contains a System Log panel. The app stores the latest 50 log entries with local-time timestamps and scrolls the panel to the newest entry. Log messages cover actions such as joint-mode changes, pinning, zoom, pose saves, and tween completion. **CLEAR LOG** clears this message list.

The logger component also renders Timelapse, JSON, and a trash-style clear-history button. In the current app these callbacks are not passed. The controls are disabled until `historyCount` is nonzero; the app passes Unit Tokens as that count. If tokens are earned, the logger controls become enabled-looking but have no connected action. They do not record or export pose history.

### 5.10 Other visual or state elements

- **Pivots and labels:** `showPivots` defaults true and `showLabels` defaults false. Their setters are not used by any visible controls. Part labels are therefore not enabled in normal operation; red pivots remain shown on visible parts.
- **Ground and grid:** constants for ground dimensions exist, and `SystemGrid.tsx` exports grid and guide renderers. The current `App.tsx` does not mount `SystemGrid`, and there is no rendered ground plane in the active viewport.
- **Anomaly / challenge state:** challenge pose data, token collection logic, and anomaly state exist in `App.tsx`, but `spawnAnomaly` is not called by the current UI. A conditional anomaly rectangle can render only if another code path sets its state.
- **Walking fields:** `WalkingEnginePose` includes stride phase and X/Y offsets, but no walking cycle is exposed or applied in the active render path.
