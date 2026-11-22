# Bitruvius Puppyt FK/IK Studio — Plain-English Feature Notes

These notes describe how every feature in Bitruvius works in plain language, why it behaves the way it does, and how it updates as we build. Keep this as a living notebook for every part of the studio.

---

## 1. Core Rig, Canonical Proportions & Posture Regimes
- **43-Joint Forward Kinematics (`fkEngine.ts`, `rigRoles.ts`)**: Moving a parent bone rotates all child bones below it in strict parent-before-child topological order, starting from the Pelvis (`root`) up through the dual spine (`lumbar` and `thorax`), out to the shoulders, arms, hands, legs, feet, and skull, with automated hierarchy audits catching any orphan, cycle, or order mismatch.
- **Public-Domain Proportions & Biomechanics (`jointLimits.ts`, `groundSystem.ts`)**: Reach limits, arm/leg spans, and counterweight follow classical proportion constants grounded in **Vitruvius** (*De architectura* III.1: thigh `1/4`, shin `1/4`, foot `1/6`, hand `1/10`), **Leonardo da Vinci** (*Vitruvian Man*: arm span = height `1:1`, forearm+hand `1/5`, upper arm `1/8`, equilateral leg-splay `1/14` height drop), and **Eadweard Muybridge** (*The Human Figure in Motion*: `62%` stance / `38%` swing stride phases and opposing contralateral arm-to-leg swing).
- **Standing vs. Moving Regimes (`groundSystem.ts`, `motionTrack.ts`)**:
  - *Standing*: Holds static vertical balance without injecting locomotion arm swing, checks arm-span-to-height proportions, and drops the pelvis smoothly toward Leonardo's `1/14` splay factor while keeping splayed feet planted on the floor.
  - *Moving*: When root velocity, stride asymmetry during keyframes, or moving drag triggers motion, softly counter-swings opposite arms against legs (`armL <-> legR`, `armR <-> legL`) and shifts center-of-mass toward support without fighting direct drags or pinned joints.
- **Closed-Chain Shoulder Bond & Deterministic Safeguards**: Collarbones, shoulder swivels, and tendons stay linked with self-corrective NaN/Infinity clamping, infinitesimal angle snapping (`1e-4°`), and zero-vector guards (`1e-3 px`) so joints never invert or snap inside-out.
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
  - **`<->` Face Swivel Handle (`canvasRenderer.ts`)**: The face pivot (`lip` / `chinTip`) renders as a horizontal double-headed arrow (`<->`) aligned to the head axis rather than a circle, keeping it visually distinct from circular FK and IK handles and omitting circular FK limit arcs.
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

## 9. ABC Keyframes, Procedural In-Between, Motion Curves & Pose Library (`motionEngine.ts`, `motionFormat.ts`)
- **A–B–C Keyframes, Skull Turn Timing & Procedural In-Between**: Capture poses into A, B, and C slots (including the active 360° skull facing `headStep` / `skullView`), scrub or loop between them with stepped FPS or smooth procedural timing (`Flow`, `Snap`, `Elastic`, `Mechanical`, `Clockwork`, plus a second easing row for `Ease In`, `Ease Out`, `Double Ease`, and `Procedural`), and inspect onion-skin ghosts. A **Skull Turn** toggle in Cadence switches whether skull orientation shifts halfway between keyframe letters (`½ Tween`) or snaps cleanly onto the next letter (`On Letter`). When only **A** and **C** are filled, double-clicking **B** on the Set menu synthesizes a procedural breakdown in-between with intermediate skull rotation, core-to-distal overlap, Muybridge passing arcs, anatomical clamps, and ground preservation. `Procedural` motion feel lets the engine forge a clean C2-smooth path automatically between coarse keyframes without needing manual precision.
- **Pose Library & Data Import/Export**: Save/rename/load poses locally, paste or copy full JSON state payloads (`RigStatePayload`), import/export `.bsk.json` skeletons, or render clean studio PNGs.
