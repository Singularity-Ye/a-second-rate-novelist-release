---
sceneId: terrace-greenery
actionId: turtle-pond
status: planned
approvedForRuntime: false
sourceMaster: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/terrace-greenery/terrace-greenery-scene-master-v1.webp
mask: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/terrace-greenery/masks/turtle-pond/mask-v1.webp
characterReference: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/.tmp/world-lab-dev/scene-drafts/paper-person-pose-sheet-reference-v1.png
expectedOutput: terrace-greenery-turtle-pond-web-gpt-edit-v1.png
---

# terrace-greenery / turtle-pond

## Web GPT edit prompt

Upload the formal `terrace-greenery` master as **Image 1**, the approved paper-person reference as **Image 2**, and use the supplied 1536×1024 mask. Image 1 is the edit target and Image 2 is the identity source of truth. White mask pixels are the only editable actor placement region. Preserve every unmasked pixel exactly, including the pond, water, rim, turtle, plants, telescope, bench, ladder, railing, brick floor, skyline, lighting and shadows.

Create one turtle-corner action: exactly one paper person in a slightly leaned three-quarter pose, looking toward the existing pond without entering the water or standing on its rim. Preserve the old cardboard silhouette, thick black contour, hand-drawn texture, tired humorous expression, blue-gray robe, patches, muted colors and compact rounded rocker base. The pond, rim and small turtle remain independent scene-layer props and must never be fused into the actor transparent layer.

The rounded rocker base is the only grounding structure and must contact dry brick floor, never water, pond rim or an oversized platform. No feet, shoes, exposed legs, rods, giant brown base, extra turtle, character in water, bridge, fountain, furniture, text, logo, watermark or UI. Do not mix in telescope, bench or ladder-transit pose, alter black mask pixels, or change camera. Return one 1536×1024 concept edit reference only.

## Coordinates and acceptance

```yaml
coordinateSpace: scene-local-pixels
canvas: [1536, 1024]
maskBBoxInclusive: [866, 645, 1082, 801]
maskBBoxNormalizedApprox: [[0.564, 0.630], [0.704, 0.782]]
poseId: standing
facing: three-quarter-toward-turtle-pond
roundBase: only-grounding-structure; contactPoint=roundBase.contactPoint; dry-brick-floor-only
safeZone: face, shoulders, hands, robe core, rocker-base lowest arc
foregroundOcclusion: B/C; layers=[pond rim/foreground leaves]; cutLineRef=terrace-greenery.turtle-pond.rim-cut
unmaskedPixels: preserve-exactly
qa:
  - one turtle-corner action and one action mask only
  - actor stays on dry floor outside water and rim
  - pond/turtle/plants remain scene layer and outside character alpha
  - no feet, shoes, exposed legs or oversized base
  - contactPoint is not inferred from pond pixels
```
