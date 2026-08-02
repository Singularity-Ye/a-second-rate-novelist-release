---
sceneId: study
actionId: exit-route
status: planned
approvedForRuntime: false
sourceMaster: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/study/study-scene-master-v1.webp
mask: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/study/masks/exit-route/mask-v1.webp
characterReference: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/.tmp/world-lab-dev/scene-drafts/paper-person-pose-sheet-reference-v1.png
expectedOutput: study-exit-route-web-gpt-edit-v1.png
---

# study / exit-route

## Web GPT edit prompt

Upload the formal `study` scene master as **Image 1**, the approved paper-person reference as **Image 2**, and use the supplied 1536×1024 mask. Image 1 is the edit target; Image 2 is the identity source of truth. White mask pixels are the only editable actor route. Preserve every unmasked pixel exactly, including room geometry, desk, chair, papers, lamp, floor, light and shadows.

Place exactly one paper person in one walking/exit-transition pose, moving along the existing study route toward the exit. Use a readable left or right-facing three-quarter walking silhouette while retaining the approved old cardboard outline, thick black line, hand-drawn texture, tired humorous expression, blue-gray robe, patches and compact rounded rocker base. The route and doors stay scene-layer elements; do not draw them into the actor and do not invent an exterior street.

The rounded rocker base is the only grounding structure and must sit on the manifest floorPlane. No feet, shoes, exposed legs, rods, climbing limbs, giant brown base or block platform. Do not mix in writing-seat or stand-by-desk, do not modify black mask pixels, and do not add furniture, characters, text, logo, watermark, UI or a new camera. Return one 1536×1024 concept edit reference only.

## Coordinates and acceptance

```yaml
coordinateSpace: scene-local-pixels
canvas: [1536, 1024]
maskBBoxInclusive: [784, 522, 1182, 849]
maskBBoxNormalizedApprox: [[0.510, 0.510], [0.770, 0.829]]
poseId: walking
facing: left-or-right-toward-study-exit
roundBase: only-grounding-structure; contactPoint=roundBase.contactPoint; align-to-study-manifest-floorPlane
safeZone: face, robe core, leading arm, rocker-base lowest arc
foregroundOcclusion: A-to-B; layers=[study exit/desk foreground]; cutLineRef=study.exit-route.exit-threshold-cut
unmaskedPixels: preserve-exactly
qa:
  - one walking action and one action mask only
  - no actor pixels outside the white route selection
  - route furniture and door remain scene layer
  - no feet, shoes, exposed legs, rods or oversized base
  - contactPoint and walking silhouette remain measurable for motion handoff
```
