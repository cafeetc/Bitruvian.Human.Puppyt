# Bitruvian Procedural Suite — App Reference v0.2

**Reference scope:** current source on the `procedural-project` branch. This document describes the application as two connected systems: a procedural mannequin and a posing workstation. “Version 0.2” identifies this reference, not the npm package version.

## Chapter navigation

This file is the complete, self-contained reference. The same material is also organized into focused GitHub pages for easier browsing:

1. [Model hierarchy, procedural assets, and proportions](MODEL_AND_ASSETS_v0.2.md)
2. [Application layout and every current feature](APP_FEATURES_v0.2.md)
3. [Data, source map, inactive code, and change map](DATA_AND_CHANGE_MAP_v0.2.md)
4. [Change setup worksheet](CHANGE_WORKSHEET.md) — questions and a fill-in brief for starting a design change.

The three chapter pages reproduce the corresponding sections below. Use this complete file when you want one document to read or save offline.

## 1. Product model

The app displays one 2D human-shaped mannequin in an SVG viewport. The figure is not a static illustration or imported rig: code defines its parts as SVG paths, dimensions, attachment points, and joint rotations. Runtime state composes those parts into a pose.

The **procedural model** controls the figure’s drawn parts, base proportions, overall scale, part visibility, and optional image masks. The **posing system** controls the rotations at its joints, lets the user manipulate the figure, and saves or transitions between poses. A saved pose contains both joint rotations and part proportions, so the two systems meet in the pose library.

The app is currently a single-figure, single-view editor. It does not expose a multi-character scene, 3D model, timeline editor, keyframe track, project file format, or user-facing IK target workflow.

## 2. Figure hierarchy, head to toe

### 2.1 Visible body hierarchy

Read the mannequin from top to bottom:

1. **Head.** A tall oval-like vector part sits at the top. Its rotation is controlled by the `neck` joint key. The head’s nominal length is 0.75 head units.
2. **Neck and collar.** The model does not draw a separate neck asset. A short collar part connects the head to the torso; the `collar` rotation moves the collar and its descendants. A 0.1 head-unit gap is recorded in anatomy constants but is not rendered as a distinct part.
3. **Torso.** A tapered upper-body shape connects collar to waist. Its nominal length is 1.2 head units. `torso` rotates this segment.
4. **Waist / pelvis.** A tapered lower-body shape sits under the torso and is the pose transform root in the active standard hierarchy. `waist` rotates it. The navel pin anchors this joint in the viewport.
5. **Upper legs / thighs.** Two tapered thigh parts branch downward from the waist. Each has a `l_hip` or `r_hip` rotation.
6. **Lower legs / calves.** Each calf begins at its knee and has a `l_knee` or `r_knee` rotation.
7. **Feet.** Each foot begins at the ankle and has a `l_foot` or `r_foot` rotation.
8. **Toes.** Each toe extends from the end of its foot and has a `l_toe` or `r_toe` rotation.

The arms form two branches from the collar/shoulder region:

- **Upper arm / shoulder shape:** left and right upper-arm assets attach at shoulder offsets on the collar. `l_shoulder` and `r_shoulder` control them.
- **Lower arm / forearm:** attaches at the end of each upper arm. `l_elbow` and `r_elbow` control it.
- **Hand:** attaches at the end of each forearm. `l_hand` and `r_hand` control it.

The left and right branches use mirrored names and share the same base shape dimensions. Their pose values are independent.

### 2.2 Transform and control hierarchy

The active render path calls `getMannequinWorldTransformsHelper` with `isReversed=false`. In this mode, the waist is positioned at local origin `(0, 0)`, the spine is built upward through torso and collar to head, the arms branch from collar, and the legs branch from waist. Despite historical “reversed hierarchy” comments and an alternate head-root branch in the helper, the current app renders the standard waist-root branch.

Each child’s world rotation is derived from its parent rotation plus the child’s local pivot offset. The arm roots have fixed horizontal offsets from the collar; the leg roots point down from the waist. The drawing uses SVG’s downward-positive Y coordinates. A joint mode can scale or suppress the local rotation contribution; it does not change the part’s base length.

The current app passes a `WalkingEnginePose` object to the mannequin, but the mannequin’s displayed transform calculations use `pivotOffsets`, proportions, base scale, and joint modes. The locomotion fields on `WalkingEnginePose` are compatibility data and do not currently drive a walking cycle.

### 2.3 Joint inventory

There are 18 independently keyed joint values:

| Region | Keys |
|---|---|
| Core and head | `waist`, `torso`, `collar`, `neck` |
| Left arm | `l_shoulder`, `l_elbow`, `l_hand` |
| Right arm | `r_shoulder`, `r_elbow`, `r_hand` |
| Left leg | `l_hip`, `l_knee`, `l_foot`, `l_toe` |
| Right leg | `r_hip`, `r_knee`, `r_foot`, `r_toe` |

The controls use degrees. Sliders show and set integer values from −180° to +180°. Direct drag rotation uses horizontal mouse movement at 0.5 degrees per pixel and is not clamped to the slider range.

## 3. Procedural asset and proportionality list

### 3.1 What counts as an asset

The built-in figure assets are 18 vector body-part instances generated by `Mannequin.tsx` and `Bone.tsx`. There are no bundled bitmap textures or model files. Shape variants are SVG path recipes selected by each part definition. Uploaded masks are user-provided images held in browser state.

The asset list below merges twin parts. “Width” and “length” are base values in units of the configured head unit, before global multipliers. These describe the procedural path’s nominal dimensions; some path variants have custom geometry that may extend differently from the nominal rectangle.

| Merged asset(s) | Instances | Base length (H units) | Base width (H units) | Shape recipe |
|---|---:|---:|---:|---|
| Head | 1 | 0.75 | 0.333 | Tall oval / tapered head path |
| Collar | 1 | 0.40 | 0.667 | Horizontal oval-like collar |
| Torso | 1 | 1.20 | 0.65 | Tapered torso, point-down form |
| Waist | 1 | 1.00 | 0.85 | Tapered waist, point-up form |
| Upper arm / shoulder | 2 | 1.80 | 0.22 | Deltoid shape |
| Lower arm / forearm | 2 | 1.40 | 0.18 | Tapered limb |
| Hand | 2 | 0.80 | 0.20 | Arrowhead form |
| Upper leg / thigh | 2 | 2.20 | 0.35 | Tapered limb |
| Lower leg / calf | 2 | 1.80 | 0.28 | Tapered limb |
| Foot | 2 | 0.64 | 0.25 | Block foot, wider at end |
| Toe | 2 | 0.36 | 0.25 | Rounded-cap / triangular toe form |

The stored constants also define `HEAD_NECK_GAP_OFFSET=0.1`, `SHOULDER_WIDTH=1.2`, `HIP_WIDTH=1.0`, and `GROUND_STRIP_HEIGHT_RAW_H_UNIT=0.4`. Shoulder attachment offsets use the collar width divided by 2.1; a distinct hip-width constant is not used by the current helper to offset the two legs laterally. Some width constants (such as shoulder and hip width) are reference values rather than dimensions directly consumed by the part renderer.

If the configured head unit is `H`, a base segment’s nominal length in SVG units is `length × H × part-height multiplier × global limb-length multiplier`. Width is `width × H × part-width multiplier × global limb-width multiplier`. The initial global scale is 94, so, for example, the default upper-arm length is `1.8 × 94 = 169.2` SVG units before any part-specific or global length multiplier. “Head unit” is a scale reference; it is not the rendered head’s full length.

### 3.2 Parameter ownership

- `ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT` in `constants.ts` contains the base lengths and widths.
- `partDefinitions` in `components/Mannequin.tsx` maps each part key to its base length, base width, SVG shape variant, label, and joint key.
- `WalkingEngineProportions` stores independent `w` and `h` multipliers for each of the 18 parts. Defaults are 1.0.
- The visible Proportions tab exposes three global controls only: scale, limb width, and limb length. There is no per-part editor in the current interface, although per-part values are represented in state and stored with poses.
- Global width and length controls rebuild all per-part values from defaults. They do not preserve independent per-part edits if such edits are introduced elsewhere.

### 3.3 Per-part mask assets

Each of the 18 part keys can hold one image mask with this state: data URL, cropped pixel dimensions, visibility, X offset, Y offset, and scale. The user selects a body-part tile, uploads an `image/*` file, and the app:

1. Reads the image in the browser.
2. Removes near-white pixels connected to the image border using a four-neighbor flood fill. Interior white regions remain.
3. Finds nontransparent bounds, adds a small crop margin, and stores a PNG data URL.
4. Sets a fit scale from the detected anatomical base value and image dimensions.
5. Draws the image centered on that body part’s joint transform, then applies its X/Y offsets and scale.

The selected mask’s X/Y sliders range from −500 to +500 SVG units; size ranges from 0.02× to 6×. Each mask tile has its own visibility toggle. Mask visibility is separate from vector-part visibility: turning a vector part off does not by itself suppress its mask in the mask render loop. Mask data is not included in saved pose entries and is not persisted to local storage.

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

## 6. Data and persistence boundaries

| Data | Initial source | Saved after browser reload? |
|---|---|---|
| Current joint offsets | Built-in `MOUNTAINVIEW` constant | No |
| Current proportions and global controls | Defaults and component state | No |
| Joint modes | All `standard` | No |
| Saved pose library | `localStorage` key `bitruvian_library` | Yes, per browser origin/profile |
| Uploaded masks and transforms | In-memory app state | No |
| Unit Tokens | In-memory app state | No |
| System log | In-memory app state, latest 50 entries | No |
| Current console/tab/zoom/pin state | Component state | No |

Mask processing and rendering happen in the browser. The current app does not call a backend or external API. The package includes `jszip` and `file-saver`, but the active source path shown here does not use them for app features.

## 7. Source and asset map

| File | Role in current app |
|---|---|
| `App.tsx` | Owns page layout, app state, handlers, tabs, masks, poses, and transitions |
| `components/Mannequin.tsx` | Computes/requests world transforms, defines the 18 vector part mappings, and renders vector parts and masks |
| `components/Bone.tsx` | Defines reusable SVG shape variants, labels, pivots, and drag hit targets |
| `components/FKControls.tsx` | Renders per-joint sliders and mode buttons |
| `components/SystemLogger.tsx` | Displays log entries and optional history controls |
| `components/SystemGrid.tsx` | Grid/guide render components; currently not mounted |
| `constants.ts` | Proportions, shoulder rigging offsets, ground-strip value, and four IK chain configurations |
| `types.ts` | Types for vectors, masks, joint modes, poses, proportions, and IK chains |
| `utils/kinematics.ts` | Linear/eased interpolation, rotation normalization/clamping, and world-rotation helper functions |
| `utils/fabrik.ts` | FABRIK chain solver; not called by the current app UI |
| `index.css`, `tailwind.config.js` | Theme and styling configuration |
| `index.tsx`, `index.html` | Browser entry point and document shell |

## 8. Present but disconnected or legacy code

These items should be treated as inactive until wired and verified:

- `solveFABRIK` and the four arm/leg chain configurations exist, but App’s imported solver and configurations are not used. The current user manipulates FK rotations.
- `SystemGrid` exists but is not rendered by `App.tsx`.
- `DraggablePanel.tsx`, `RotationWheelControl.tsx`, `utils/color-utils.ts`, `utils/pose-mirror.ts`, and `utils/pose-parser.ts` are empty export stubs.
- `WalkingEnginePose` contains fields for an older walking-oriented system. The active mannequin render uses `pivotOffsets` instead.
- `HistoryState`, hand-flash state, some pin helper state, and several imported types/configurations are not connected to current visible actions.
- `AUDIT_LOG.md` and earlier FK notes describe historical designs and may refer to modes or controls that are not present in this build. Use the current source and this reference to determine actual behavior.

This is the distinction that keeps procedural and posing work in one view: active model parameters define what gets drawn, active pose state defines how those shapes are articulated, and legacy or disconnected code is identified separately so it does not appear as a current feature.

## 9. Practical change map

| Desired change | Start with |
|---|---|
| Change a base part length, width, or built-in ratio | `constants.ts` and `components/Mannequin.tsx` `partDefinitions` |
| Change body-part path silhouette | `components/Bone.tsx` `getBonePath` |
| Change parent transforms, attachment points, or joint interpretation | `components/Mannequin.tsx` `getMannequinWorldTransformsHelper` |
| Change direct drag behavior, defaults, pinning, presets, or pose library | `App.tsx` |
| Change pose slider/mode layout | `components/FKControls.tsx` |
| Change which model parts or masks are displayed | `App.tsx` state and `components/Mannequin.tsx` render loops |
| Change image background cleanup or mask fitting | `App.tsx` `handleMaskUpload` |
| Add a real IK interaction | Connect target interaction, chain selection, transforms, joint modes, and `solveFABRIK`; do not assume the existing solver is active |
| Add persistent user projects or masks | Define a durable project schema and migration boundary; current local storage covers saved poses only |

## 10. Known documentation limits

This is a source-based reference. It records code behavior and visible control wiring; it does not certify accessibility, browser compatibility, performance, or correctness under every viewport and image input. The earlier build summary contains testing and readiness claims that are not treated as verified by this reference.
