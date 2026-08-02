---
sceneId: entrance
actionId: return-home
status: planned
approvedForRuntime: false
sourceMaster: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/entrance/entrance-scene-master-v1.webp
mask: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/entrance/masks/return-home/mask-v1.webp
characterReference: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/.tmp/world-lab-dev/scene-drafts/paper-person-pose-sheet-reference-v1.png
expectedOutput: entrance-return-home-web-gpt-edit-v1.png
---

# entrance / return-home

## Web GPT edit prompt

Upload the formal `entrance` scene master as **Image 1**, the approved paper-person reference as **Image 2**, and use the supplied 1536×1024 mask. Image 1 is the edit target; Image 2 is the identity source of truth. White mask pixels are the only editable actor settling region. Preserve every unmasked pixel exactly, including entrance door, elevator, coat area, bathroom door, floor, walls, lighting, shadows and all architecture.

Place exactly one paper person in a single return-home settling pose inside the entrance, turned back toward the interior in a slight three-quarter view. Preserve the exact old cardboard silhouette, thick black contour, hand-drawn texture, tired humorous expression, blue-gray robe, patches, muted colors and compact rounded rocker base. The doors, elevator and coat area remain scene-layer assets and must not be fused into the actor transparent layer.

The rounded rocker base is the only grounding structure and must align to the entrance floorPlane. No feet, shoes, exposed legs, rods, giant brown base or block platform. Do not mix in coat-on or outside-door, edit any black mask area, add an exterior street, second character, furniture, text, logo, watermark or UI. Return one 1536×1024 concept edit reference only.

## Coordinates and acceptance

```yaml
coordinateSpace: scene-local-pixels
canvas: [1536, 1024]
maskBBoxInclusive: [810, 470, 1360, 830]
maskBBoxNormalizedApprox: [[0.527, 0.459], [0.885, 0.811]]
poseId: standing
facing: three-quarter-toward-interior
roundBase: only-grounding-structure; contactPoint=roundBase.contactPoint; align-to-entrance-manifest-floorPlane
safeZone: face, shoulders, robe core, hands, rocker-base lowest arc
foregroundOcclusion: A/B; layers=[door/elevator foreground if overlap]; cutLineRef=entrance.return-home.entry-cut
unmaskedPixels: preserve-exactly
qa:
  - one return-home action and one action mask only
  - no coat-on or outside-door pose in the same output
  - door/elevator/coat remain scene layer, not character alpha
  - no feet, shoes, exposed legs, rods or oversized base
  - settling state remains anchored to floorPlane and passes contactPoint QA
```
