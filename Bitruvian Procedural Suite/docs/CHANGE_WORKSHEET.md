# Change setup worksheet

Use this page to decide what the app should become before changing code. It is written for working directly from the repository; no AI is needed to answer it. Keep one copy per change. The goal is a small, clear change that can be reviewed in the app.

For source context, read the relevant chapter of the [complete v0.2 reference](APP_REFERENCE_v0.2.md): [model and assets](MODEL_AND_ASSETS_v0.2.md), [features](APP_FEATURES_v0.2.md), or [data and code map](DATA_AND_CHANGE_MAP_v0.2.md).

## A. Set up a working copy

1. Open the repository’s `procedural-project` branch.
2. Create a new branch for the change. Give it a short name based on the desired result, such as `reshape-head`, `per-part-proportions`, or `pose-library-cleanup`.
3. Install and run the app using the commands in the [root README](../README.md).
4. Before editing, note the initial state and take a screenshot if the visual result matters.
5. Identify the single main file or feature area using the change map in the complete reference.

## B. Decide the desired result

Answer these questions in plain language:

1. **What do I want to be different?** Name one visible behavior or model property.
2. **Where does it belong?** Choose one: model shape, model proportions, joint/pose behavior, image masks, controls/layout, saved poses/data, or something else.
3. **What should happen when I use it?** Describe the action and the visible result.
4. **What should stay the same?** Name the nearby behavior that must not change.
5. **How will I recognize success?** Write one or more observable acceptance checks.
6. **Is this an edit or a new feature?** State whether an existing control/asset changes, a new one is added, or something is removed.
7. **Does it affect both left and right sides?** State whether the change is shared, mirrored, or intentionally different.
8. **Does it affect saved poses or reload behavior?** Say whether the new data should be saved, loaded, exported, or reset.

## C. Locate the implementation

Use this quick lookup before editing:

| Change area | Main implementation |
|---|---|
| Base anatomy lengths and widths | `constants.ts` |
| Which vector shape a body part uses | `components/Mannequin.tsx` part definitions |
| Exact SVG silhouette | `components/Bone.tsx` shape paths |
| Body attachment order and joint rotations | `components/Mannequin.tsx` transform helper |
| Pose controls, direct drag, presets, pinning, pose library | `App.tsx` |
| Joint slider and mode-row presentation | `components/FKControls.tsx` |
| Upload processing and mask controls | `App.tsx` mask upload handler and panel |
| Vector and mask rendering | `components/Mannequin.tsx` |
| Theme and visual styling | `index.css`, `tailwind.config.js`, component classes |
| Saved pose shape and persistence | `App.tsx`, `types.ts` |
| Inverse kinematics | `utils/fabrik.ts`, `constants.ts` chain configurations; not connected to current UI |

## D. Write a change brief

Copy and fill in this template. Keep the brief focused on one change.

```text
Change name:

Current behavior:

Desired behavior:

Why I want this:

Affected area(s):

Left/right behavior:

Data that must be saved or restored:

Must remain unchanged:

Acceptance checks:
1.
2.
3.

Questions or tradeoffs I have not decided:
```

## E. Work in small passes

1. Make the smallest edit that can produce the desired result.
2. Run the app and compare it with the initial state.
3. Check each acceptance item in the change brief.
4. If the result is wrong, change one cause at a time.
5. Record the result and any new decision before starting a separate change.

If you later hand the brief to an AI, give it the filled-in text, the relevant reference chapter, and the branch name. Ask it to make only that described change and report files changed, behavior changed, and checks performed. This keeps your written decisions in control of the implementation.

## F. Kickoff questions

Start by answering these in order:

1. Which part of the app do you want to make yours first: **the figure’s proportions/shapes**, **how the body poses**, **how the controls work**, or **how poses and assets are saved**?
2. What is one thing in that area you already know you want changed?
3. What should the app look or do immediately after that change?
4. Is there a visual reference, drawing, measurement, or existing pose that expresses your target?
5. What should remain untouched while that first change is made?

Write those answers into section D. They form the first change brief.
