# Data, implementation map, and change guide — v0.2

Part of the [complete app reference](APP_REFERENCE_v0.2.md), sections 6–10. This page can be read on its own; the complete reference contains all three chapters in one document.

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
