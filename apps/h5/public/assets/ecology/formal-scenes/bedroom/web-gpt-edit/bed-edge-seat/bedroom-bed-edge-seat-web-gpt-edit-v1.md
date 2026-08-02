---
sceneId: bedroom
actionId: bed-edge-seat
status: planned
approvedForRuntime: false
sourceMaster: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/bedroom/bedroom-scene-master-v1.webp
mask: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/bedroom/masks/bed-edge-seat/mask-v1.webp
characterReference: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/.tmp/world-lab-dev/scene-drafts/paper-person-pose-sheet-reference-v1.png
expectedOutput: bedroom-bed-edge-seat-web-gpt-edit-v1.png
---

# bedroom / bed-edge-seat

## Web GPT edit prompt

Upload the formal `bedroom` scene master as **Image 1**, the approved paper-person reference as **Image 2**, and use the supplied 1536×1024 mask. Image 1 is the edit target; Image 2 is the identity source of truth. White mask pixels are the only editable actor region. Preserve all unmasked pixels exactly: bed, sheets, pillows, record player, lazy sofa, lamp, room geometry, lighting and shadows.

Add exactly one paper person in a single seated-at-bed-edge resting pose, with a slightly slumped tired-but-funny expression. Preserve the old cardboard silhouette, thick black line, hand-drawn texture, blue-gray robe, patches, muted colors and compact rounded rocker base. The bed and bedding remain scene-layer assets; they must not be fused into the character cutout. The base may be partly occluded by the bed edge only through the declared foreground cut line.

This is **not** the sleep action and must not contain a lying pose, blanket body, sofa or lounge-seat pose. The rounded rocker base is the only grounding structure; no feet, shoes, exposed legs, rods, giant brown base or block platform. Do not edit outside the white mask, add furniture/characters/text/logo/watermark/UI, or change canvas/camera. Return one 1536×1024 concept edit reference only.

## Coordinates and acceptance

```yaml
coordinateSpace: scene-local-pixels
canvas: [1536, 1024]
maskBBoxInclusive: [369, 502, 1120, 839]
maskBBoxNormalizedApprox: [[0.240, 0.490], [0.729, 0.819]]
poseId: seated-resting
facing: left-or-right-three-quarter
roundBase: only-grounding-structure; contactPoint=roundBase.contactPoint; bed-edge-is-not-grounding
safeZone: face, shoulders, folded robe core, hand, visible base arc if not cut
foregroundOcclusion: B/C; layers=[bed surface/bed-edge foreground]; cutLineRef=bedroom.bed-edge-seat.bed-edge-cut
unmaskedPixels: preserve-exactly
qa:
  - one bed-edge-seat action and one action mask only
  - sleep and lounge-seat are explicitly excluded
  - no visible feet, shoes, legs or furniture in character alpha
  - bed-edge occlusion never hides face or falsely relocates contactPoint
  - contactPoint/bodyBounds are measured before any runtime claim
```
