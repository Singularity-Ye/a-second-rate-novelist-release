---
sceneId: terrace-greenery
actionId: maintenance-ladder
status: planned
approvedForRuntime: false
sourceMaster: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/terrace-greenery/terrace-greenery-scene-master-v1.webp
mask: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/terrace-greenery/masks/maintenance-ladder/mask-v1.webp
characterReference: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/.tmp/world-lab-dev/scene-drafts/paper-person-pose-sheet-reference-v1.png
expectedOutput: terrace-greenery-maintenance-ladder-web-gpt-edit-v1.png
---

# terrace-greenery / maintenance-ladder

## Web GPT edit prompt

Upload the formal `terrace-greenery` master as **Image 1**, the approved paper-person reference as **Image 2**, and use the supplied 1536×1024 mask. Image 1 is the edit target; Image 2 is the identity source of truth. White mask pixels are the only editable actor route/landing region. Preserve all unmasked pixels exactly, including the maintenance ladder, rails, rungs, plants, telescope, pond, bench, railing, brick floor, skyline, lighting and shadows.

Create one walking transit action beside the existing maintenance ladder, approaching or leaving its top landing in a readable left/right-facing pose. Do not draw a climbing body between the rails. Preserve the old cardboard silhouette, thick black contour, hand-drawn texture, blue-gray robe, patches, tired humorous expression and compact rounded rocker base. The ladder, rails and rungs remain scene-layer architecture; they must never be fused into the actor cutout. If the manifest lacks a ladder-segment landing, keep this action blocked rather than guessing from pixels.

The rounded rocker base is the only grounding structure. No feet, shoes, exposed legs, climbing limbs, rods, giant brown base or block platform. Do not mix in telescope, bench or turtle-pond poses, edit black mask pixels, add a door/hatch/stair redesign, extra character, text, logo, watermark or UI. Return one 1536×1024 concept edit reference only.

## Coordinates and acceptance

```yaml
coordinateSpace: scene-local-pixels
canvas: [1536, 1024]
maskBBoxInclusive: [138, 410, 240, 909]
maskBBoxNormalizedApprox: [[0.090, 0.400], [0.156, 0.888]]
poseId: walking
facing: left-or-right-along-maintenance-path
roundBase: only-grounding-structure; contactPoint=roundBase.contactPoint-or-manifest-ladder-landing; rungs-are-not-grounding
safeZone: face, robe core, arms, rocker-base lowest arc
foregroundOcclusion: B/C; layers=[ladder rail/rung foreground]; cutLineRef=terrace-greenery.maintenance-ladder.rail-cut
unmaskedPixels: preserve-exactly
qa:
  - one ladder-transit action and one action mask only
  - no body between rungs and no generated climbing legs/feet
  - ladder remains architecture and is excluded from character alpha
  - missing ladder landing/path keeps status blocked
  - contactPoint, floorPlane and rail cut remain auditable
```
