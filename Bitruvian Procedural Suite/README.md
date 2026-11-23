# Bitruvian Procedural Suite

Browser based 2D mannequin editor. The project has two connected areas:

1. **Procedural model** — a body assembled from parameterized vector parts. Its proportions, visibility, and per-part image masks define the figure.
2. **Posing system** — forward-kinematic joint controls, direct manipulation, pose storage, and pose transitions.

The model is the shared foundation. The posing system changes joint rotations; the procedural system defines the shapes and dimensions those joints move. This repository documents the application through both views.

## Start here

- [App reference, version 0.2](docs/APP_REFERENCE_v0.2.md) — model hierarchy, proportions, assets, interface, feature behavior, and implementation status.
- [Change setup worksheet](docs/CHANGE_WORKSHEET.md) — a self-guided way to choose and specify your first change.
- [Documentation map](docs/README.md) — current references, historical documents, and code ownership.
- [Pose controls guide](FK_USAGE_GUIDE.md) — earlier FK usage notes. Treat the app reference as the current description of shipped behavior.
- [Engineering notes](FK_TECHNICAL_DOCS.md) — earlier implementation notes; some sections describe intended or inactive behavior.

## Run locally

Requirements: Node.js and npm.

```sh
npm install
npm run dev
```

Build the browser app with `npm run build`; preview the generated output with `npm run preview`. There is no API key or external service required by the current app code.

## Project map

```text
App.tsx                 App state, controls, pose library, mask processing
components/Mannequin.tsx Procedural body layout and part rendering
components/Bone.tsx     Reusable SVG part geometry, pivots, labels, interaction
components/FKControls.tsx Joint sliders and joint-mode controls
components/SystemLogger.tsx In-app system log panel
components/SystemGrid.tsx Grid and guide renderers (not currently mounted)
constants.ts            Base anatomy dimensions, rigging, IK chain definitions
types.ts                Pose, proportion, mask, joint, and IK data types
utils/kinematics.ts     Rotation and interpolation helpers
utils/fabrik.ts         FABRIK inverse-kinematics solver (not currently wired to UI)
docs/                   Current app reference and documentation map
```

See [the app reference](docs/APP_REFERENCE_v0.2.md) before changing model proportions, pose state, masks, or features. It records which code is active and which elements are currently disconnected.
