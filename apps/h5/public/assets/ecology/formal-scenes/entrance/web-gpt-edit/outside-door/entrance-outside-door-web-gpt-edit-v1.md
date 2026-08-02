---
sceneId: entrance
actionId: outside-door
status: planned
approvedForRuntime: false
sourceMaster: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/entrance/entrance-scene-master-v1.webp
mask: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/entrance/masks/outside-door/mask-v1.webp
characterReference: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/.tmp/world-lab-dev/scene-drafts/paper-person-pose-sheet-reference-v1.png
expectedOutput: entrance-outside-door-web-gpt-edit-v1.png
---

# entrance / outside-door

## Web GPT edit prompt

Upload the formal `entrance` scene master as **Image 1**, the approved paper-person reference as **Image 2**, and use the supplied 1536×1024 mask. Image 1 is the edit target and Image 2 is the identity source of truth. White mask pixels are the only editable actor transition region. Preserve all unmasked pixels exactly, including door leaf, threshold, coat area, elevator, walls, floor, lighting, shadows and architecture.

Place exactly one paper person in a single leaving-transition pose at the existing doorway, facing outward. Keep the old cardboard silhouette, thick black contour, hand-drawn texture, tired humorous expression, blue-gray robe, patches and compact rounded rocker base. The doorway and threshold are scene-layer occlusion; do not draw a full exterior street, do not fuse door geometry into the actor, and do not show a second half-body or duplicate figure.

The rounded rocker base is the only grounding structure. It must contact the entrance floor until the declared threshold cut; a door occlusion may hide part of it only with an explicit cut line. No feet, shoes, exposed legs, rods, giant brown base or block platform. Do not mix in coat-on or return-home, edit outside the white mask, add extra architecture/text/logo/watermark/UI, or change camera. Return one 1536×1024 concept edit reference only.

## Coordinates and acceptance

```yaml
coordinateSpace: scene-local-pixels
canvas: [1536, 1024]
maskBBoxInclusive: [300, 500, 860, 880]
maskBBoxNormalizedApprox: [[0.195, 0.488], [0.560, 0.859]]
poseId: walking
facing: toward-outside-door
roundBase: only-grounding-structure; contactPoint=roundBase.contactPoint; threshold-is-occlusion-not-grounding
safeZone: face, shoulders, leading robe, rocker-base lowest arc before cut
foregroundOcclusion: B/C; layers=[door leaf/threshold foreground]; cutLineRef=entrance.outside-door.threshold-cut
unmaskedPixels: preserve-exactly
qa:
  - one outside-door action and one action mask only
  - one actor only; no duplicate half-body or outdoor street
  - door/threshold remain scene layer and do not enter character alpha
  - no feet, shoes, exposed legs, rods or oversized base
  - exit cut is readable and contactPoint is not silently relocated
```
