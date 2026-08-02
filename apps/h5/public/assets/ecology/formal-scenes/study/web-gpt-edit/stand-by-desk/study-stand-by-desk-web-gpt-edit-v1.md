---
sceneId: study
actionId: stand-by-desk
status: planned
approvedForRuntime: false
sourceMaster: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/study/study-scene-master-v1.webp
mask: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/study/masks/stand-by-desk/mask-v1.webp
characterReference: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/.tmp/world-lab-dev/scene-drafts/paper-person-pose-sheet-reference-v1.png
expectedOutput: study-stand-by-desk-web-gpt-edit-v1.png
---

# study / stand-by-desk

## Web GPT edit prompt

Upload the formal `study` scene master as **Image 1**, the approved paper-person reference as **Image 2**, and use the supplied 1536×1024 mask. Image 1 is the edit target and Image 2 is the identity source of truth. White mask pixels are the only editable actor placement region; preserve every unmasked pixel exactly, including the desk, chair, papers, lamp, wall, floor, lighting and shadows.

Add exactly one neutral standing paper person beside the desk, facing the desk in a slight three-quarter view. Keep the exact approved old cardboard silhouette, thick black contour, hand-drawn texture, tired humorous expression, blue-gray robe, patches, muted colors and compact rounded rocker base. The desk and chair are scene-layer objects: do not redraw them inside the actor, do not attach them to the robe, and do not create a new prop. Keep the actor detachable for a later transparent layer.

The compact rounded rocker base is the only grounding structure and must land on the study floorPlane, never on a desk, chair or oversized brown platform. No feet, shoes, exposed legs, rods or block base. Do not mix in writing-seat or walking pose, alter any black mask region, add furniture/characters/text/logo/watermark/UI, or change the canvas/camera. Return one 1536×1024 concept edit reference only.

## Coordinates and acceptance

```yaml
coordinateSpace: scene-local-pixels
canvas: [1536, 1024]
maskBBoxInclusive: [246, 696, 659, 992]
maskBBoxNormalizedApprox: [[0.160, 0.680], [0.429, 0.969]]
poseId: standing
facing: toward-desk-three-quarter-left-or-right
roundBase: only-grounding-structure; contactPoint=roundBase.contactPoint; align-to-study-manifest-floorPlane
safeZone: face, robe core, shoulders, hands, rocker-base lowest arc
foregroundOcclusion: B; layers=[study desk/chair foreground]; cutLineRef=study.stand-by-desk.desk-edge-cut
unmaskedPixels: preserve-exactly
qa:
  - one neutral standing action and one action mask only
  - actor stands on floor, not on desk/chair and not on a replacement platform
  - furniture remains outside character alpha
  - no feet, shoes, exposed legs or oversized brown base
  - identity and compact base match Image 2; contactPoint remains measurable
```
