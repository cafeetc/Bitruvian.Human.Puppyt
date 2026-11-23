# Documentation map

## Current source of truth

- [App reference v0.2](APP_REFERENCE_v0.2.md): describes the current app as both a procedural model and a posing tool. Use it for hierarchy, proportions, assets, behavior, and active versus inactive implementation.
- [Model and assets chapter](MODEL_AND_ASSETS_v0.2.md): head-to-toe hierarchy, joint inventory, base dimensions, mirrored assets, and mask data.
- [Application features chapter](APP_FEATURES_v0.2.md): initial state, all current controls, pose workflows, and disconnected interface elements.
- [Data and code chapter](DATA_AND_CHANGE_MAP_v0.2.md): persistence, file ownership, inactive code, and where to begin for a change.
- [Change setup worksheet](CHANGE_WORKSHEET.md): branch setup, kickoff questions, and a fill-in change brief.
- [Root README](../README.md): setup and a short code map.

## Existing feature notes

These files were written during earlier FK-control work. They remain useful for historical context, but their claims about testing, production readiness, feature completeness, and planned behavior have not been independently verified against the current interface. When they disagree with the app reference or source, the current source is authoritative.

- [FK controls overview](../FK_CONTROLS_README.md)
- [FK implementation notes](../FK_IMPLEMENTATION.md)
- [FK usage guide](../FK_USAGE_GUIDE.md)
- [FK technical notes](../FK_TECHNICAL_DOCS.md)
- [FK quick reference](../FK_QUICK_REFERENCE.md)
- [Build summary](../BUILD_SUMMARY.md)
- [File manifest](../FILE_MANIFEST.md)
- [Audit log](../AUDIT_LOG.md)

## Code ownership by concern

| Concern | Main files | Responsibility |
|---|---|---|
| App and interaction state | `App.tsx` | Current pose, proportions, tabs, masks, pinning, library, logging, and control panel |
| Procedural model | `components/Mannequin.tsx`, `components/Bone.tsx`, `constants.ts` | Part hierarchy, transforms, primitive vector shapes, and base dimensions |
| Posing | `components/FKControls.tsx`, `utils/kinematics.ts`, `types.ts` | Joint sliders, joint modes, pose state, and rotation math |
| Inverse kinematics | `utils/fabrik.ts`, IK definitions in `constants.ts` | Solver and chain descriptions; currently not connected to an app interaction |
| User image masks | mask state and `handleMaskUpload` in `App.tsx`; rendering in `Mannequin.tsx` | Upload, cleanup, sizing, placement, and per-part visibility |
| Visual interface | `index.css`, `tailwind.config.js`, `components/SystemLogger.tsx` | Theme and system log display |

The current source is concentrated in `App.tsx`. This map is a conceptual division of responsibilities, not a claim that each concern is already an independent module.
