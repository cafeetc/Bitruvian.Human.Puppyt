# Bitruvius Puppyt FK/IK Studio — Plain-English Feature Notes

These notes describe how every feature in Bitruvius works in plain language, why it behaves the way it does, and how it updates as we build. Keep this as a living notebook for every part of the studio.

---

## 1. Core Rig & Bones
- **43-Joint Forward Kinematics (`fkEngine.ts`)**: Moving a parent bone rotates all child bones below it, starting from the Pelvis (`root`) up through the dual spine (`lumbar` and `thorax`), out to the shoulders, arms, hands, legs, feet, and skull.
- **Closed-Chain Shoulder Bond**: The collarbone (`brace`), shoulder swivel (`swivel`), shoulder tip (`acromion`), and shoulder tendon (`tendon`) stay linked together in a closed triangle. Pulling a shoulder lets it stretch cleanly without popping inside-out or crossing through the torso.
- **Procedural Safeguards**: Tiny micro-scale cushions and angle soft stops keep joint math from dividing by zero or snapping at singularities, making the rig feel like a reliable cardboard/thin-metal physical puppet.
- **Soft Limits vs. Free Rotation**: When Soft Limits are turned on, each bone stops gently at natural anatomical angles (and shows a tension tint near the end of its range). When turned off, joints can rotate freely 360°.

## 2. Dual Spine, Anti-Phallic Engine, Rib Anchors & Chungus / Promethean Modes
- **Upper & Lower Spine (`lumbar` + `thorax`)**: The torso bends at both the lower lumbar waist and the upper thoracic ribcage instead of acting like a single stiff stick.
- **Anti-Phallic Lower Spine Engine (`applyAntiPhallicLowerSpine`)**: Shifts the lower spine (`lumbar`) and everything above it (`thorax`, `neck`, `head`, `ribs`, shoulders, arms, hands) upward so the bottom pixel of the lower spine rests flush on the hip swivel point (`3382`), preventing the bottom vertebra from protruding below the hips.
- **Rib Anchor Modes (`upper`, `lower` / Chungus Swing, `ribwings`)**:
  - *Upper Chest*: Ribs hinge from the top breastbone.
  - *Chungus Swing (`lower`)*: Ribs hinge where the upper and lower spine meet, paired with Prometheus Wings and chest cavity expansion limited smoothly by the collarbones and swivel bones.
  - *Ribwings*: Ribs attach to bilateral neck anchors.
- **Elastic Prometheus Wings (`prometheusWings`)**: Double-clicking a shoulder blade wing circle (or checking Prometheus Wings) pops the back shoulder wings outward behind the ribcage. Dragging a wing flexes the collarbone and drives extra compensatory follow-through down the upper arm, forearm, and wrist.
- **Mirrored Presets (`Chungus` & `Promethean Chungus`)**:
  - *Promethean Chungus*: Uses the wide wing-flared pose with Right arms symmetrically mirrored onto Left arms.
  - *Chungus*: Uses the grounded tucked-shoulder pose with the Left side symmetrically mirrored onto the Right side.
  - Both presets are seeded in Pose Library and one-click accessible in the Pose panel alongside live **Mirror R→L Arms** and **Mirror L→R Side** buttons.

## 3. 360° Spine-Determined Skull & Swivel (`skullKitModels.ts`)
- **4-Step Turntable**: The head cycles smoothly through all four anatomical directions (`Front` → `Side R` → `Back` → `Side L` → `Front`...), continuing around 360° if you keep dragging, and reversing direction immediately whenever your drag switches direction.
- **Spine-Aware Direction**: Dragging uses the live upper spine/thorax orientation as its reference frame so turning works predictably no matter how tilted the torso is.
- **Skull Styling**:
  - Eye sockets stay hollow/skull-like by default (eye rounds deactivated), while white teeth remain visible.
  - Side and back skulls have distinct bone shading so orientation reads clearly at a glance.
  - Jaw `lip` rotation stays locked cleanly at `0°` during swivel turns so the skull turns without accidentally popping the jaw open.

## 4. Digital Bones & Lens Blur (`canvasRenderer.ts`)
- **Calm Default Bones vs. Active Digital Mode**: In default Mode A (puppet/pose view), digital bone overlays stay subtle and clean. Switching to Mode D (Digital Bones view) activates the full high-contrast digital skeleton overlay and adds a soft depth blur behind it on the figure.

## 5. Inverse Kinematics (IK) & Strict Elastic Pin Full (`ikEngine.ts`)
- **Hybrid Drag Modes (`fluid`, `fabrik`, `bone2`, `fbik`, `pinFull`, `fk`)**:
  - Dragging a limb end moves hands and feet directly with analytical 2-bone solving or multi-joint FABRIK, keeping knees and elbows hinged cleanly.
  - **Floor Gravity**: Keeps feet grounded cleanly on the perspective floor plane when enabled.
- **Strict Elastic Pin Full (`elasticPinFull`)**:
  - When **Pin Full Rig** is active, pinned hands and feet hold tightly onto their floor/air anchors while allowing a short elastic pull during a drag.
  - Releasing a pulled wrist or foot snaps it right back onto its pin anchor (shown with live dashed tether lines when pulled), toggleable on-canvas via the top-right chip or in the IK panel.

## 6. Light Dual-Spine Perspective (`ikEngine.ts`, `App.tsx`)
- **Zero-Friction Picking**: Dragging any joint near the vanishing point always grabs the puppet first—the perspective crosshair never steals clicks away from bones.
- **Automatic Upper & Lower Spine Lean**: Shifting the Vanishing Point horizontally or vertically applies a light, proportional bend across both the `lumbar` and `thorax` spine joints relative to the horizon, while keeping your manual pose angles intact underneath.

## 7. On-Canvas Modular Sub-Rig Pop-Up: Gotz Hand & Piggy Foot (`PartRigModal.tsx`, `GotzHandEditor.tsx`)
- **Live Split Canvas**: Double-clicking a hand or foot (or clicking *Open Gotz Hand* / *Open Piggy Foot*) pops up the modular sub-rig window directly on the canvas and slides Bitruvius comfortably to the side so both stay visible side by side.
- **Forearm-Above-Wrist Sync**: The Gotz Hand editor renders the connected forearm bone above the wrist and lets you scrub the forearm angle live on both the editor and the full puppet.
- **Top & Bottom Room Sliders**: When the sub-rig pop-up is open, horizontal (top) and vertical (bottom) sliders let you tune how much canvas room goes to Bitruvius vs. the hand/foot editor, with a clean `×` button to close.

## 8. Body-In-Canvas Guard & Complementary Backdrop Text (`fkEngine.ts`, `canvasRenderer.ts`)
- **Body Never Leaves Canvas**: Live world bounding checks clamp zooming, panning, root moves, and split-window slider adjustments so Bitruvius always stays framed inside the unobstructed viewport.
- **First-Click Digital Canvas Backdrop Typography**: `"Welcome Bitruvius."` and the drag-hands instruction render in digital monospace (`JetBrains Mono`) behind the puppet between head crown and ankles, flipping overlapping letters to complementary studio green (`#22c55e`), and disappear automatically on the very first click (and on PNG export).

## 9. ABC Keyframes, Motion Curves & Pose Library (`motionEngine.ts`, `motionFormat.ts`)
- **A–E Keyframe Slots & Motion Feels**: Capture poses into A–E slots, scrub or loop between them with stepped FPS or smooth procedural timing (`Flow`, `Snap`, `Elastic`, `Mechanical`, `Clockwork`), and inspect onion-skin ghosts.
- **Pose Library & Data Import/Export**: Save/rename/load poses locally, paste or copy full JSON state payloads (`RigStatePayload`), import/export `.bsk.json` skeletons, or render clean studio PNGs.
