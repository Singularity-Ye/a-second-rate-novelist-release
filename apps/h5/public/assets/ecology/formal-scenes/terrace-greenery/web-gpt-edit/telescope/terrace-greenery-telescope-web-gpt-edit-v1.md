---
sceneId: terrace-greenery
actionId: telescope
status: planned
approvedForRuntime: false
sourceMaster: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/terrace-greenery/terrace-greenery-scene-master-v1.webp
mask: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/terrace-greenery/masks/telescope/mask-v1.webp
characterReference: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/.tmp/world-lab-dev/scene-drafts/paper-person-pose-sheet-reference-v1.png
expectedOutput: terrace-greenery-telescope-web-gpt-edit-v1.png
---

# terrace-greenery / telescope

## Web GPT edit prompt

Upload the formal `terrace-greenery` master as **Image 1**, the approved paper-person reference as **Image 2**, and use the supplied 1536×1024 mask. Image 1 is the edit target; Image 2 is the identity source of truth. White mask pixels are the only editable actor placement region. Preserve every unmasked pixel exactly, including the telescope, bench, plants, turtle pond, ladder, railing, brick floor, skyline, lighting and shadows.

Create one city-look action: exactly one paper person standing in a slight three-quarter pose and looking toward the existing telescope/city view. Preserve the old cardboard silhouette, thick black contour, hand-drawn texture, tired humorous expression, blue-gray robe, patches, muted colors and compact rounded rocker base. The telescope and tripod remain scene-layer props, never part of the actor transparent layer; keep the actor outside the tripod footprint.

The rounded rocker base is the only grounding structure and must align to the terrace manifest floorPlane, not to a telescope leg or railing. No feet, shoes, exposed legs, rods, giant brown base, extra character, second telescope, furniture, text, logo, watermark, UI or architecture. Do not mix in turtle-pond, bench or ladder-transit pose, do not alter black mask pixels, and return one 1536×1024 concept edit reference only.

## Coordinates and acceptance

```yaml
coordinateSpace: scene-local-pixels
canvas: [1536, 1024]
maskBBoxInclusive: [771, 119, 1030, 498]
maskBBoxNormalizedApprox: [[0.502, 0.116], [0.671, 0.486]]
poseId: standing
facing: three-quarter-toward-telescope-and-city
roundBase: only-grounding-structure; contactPoint=roundBase.contactPoint; telescope-tripod-is-forbidden
safeZone: face, shoulders, robe core, hands, rocker-base lowest arc
foregroundOcclusion: B/C; layers=[telescope tube/tripod if overlap]; cutLineRef=terrace-greenery.telescope.tripod-clearance
unmaskedPixels: preserve-exactly
qa:
  - one telescope/city-look action and one action mask only
  - actor does not intersect telescope tube, tripod or railing
  - telescope remains scene layer and excluded from character alpha
  - no feet, shoes, exposed legs or oversized base
  - contactPoint aligns to floor, never to telescope geometry
```
