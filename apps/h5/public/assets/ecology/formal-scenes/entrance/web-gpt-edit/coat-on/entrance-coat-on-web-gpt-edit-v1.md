---
sceneId: entrance
actionId: coat-on
status: planned
approvedForRuntime: false
sourceMaster: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/entrance/entrance-scene-master-v1.webp
mask: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/entrance/masks/coat-on/mask-v1.webp
characterReference: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/.tmp/world-lab-dev/scene-drafts/paper-person-pose-sheet-reference-v1.png
expectedOutput: entrance-coat-on-web-gpt-edit-v1.png
---

# entrance / coat-on

## Web GPT edit prompt

Upload the formal `entrance` scene master as **Image 1**, the approved paper-person reference as **Image 2**, and use the supplied 1536×1024 mask. Image 1 is the edit target; Image 2 is the identity source of truth. White mask pixels are the only editable actor region. Preserve every unmasked pixel exactly, including entrance door, coat area, elevator, bathroom door, floor, walls, lighting, shadows and all architecture.

Place exactly one paper person in a single outbound-preparation pose, adjusting the existing coat/robe before leaving. Preserve the old cardboard silhouette, thick black contour, hand-drawn texture, tired humorous expression, blue-gray robe, patches, muted palette and compact rounded rocker base. The coat hook, coat, doors and elevator remain scene-layer elements; do not fuse them into the character or invent a wearable new costume.

The rounded rocker base is the only grounding structure and must align to the entrance floorPlane. No feet, shoes, exposed legs, rods, giant brown base or block platform. Do not mix in outside-door or return-home, edit black mask pixels, add furniture/characters/text/logo/watermark/UI, or extend the scene into a street. Return one 1536×1024 concept edit reference only.

## Coordinates and acceptance

```yaml
coordinateSpace: scene-local-pixels
canvas: [1536, 1024]
maskBBoxInclusive: [180, 500, 690, 820]
maskBBoxNormalizedApprox: [[0.117, 0.488], [0.449, 0.801]]
poseId: standing
facing: three-quarter-toward-coat-area
roundBase: only-grounding-structure; contactPoint=roundBase.contactPoint; align-to-entrance-manifest-floorPlane
safeZone: face, shoulders, robe core, hands, rocker-base lowest arc
foregroundOcclusion: A/B; layers=[coat/door foreground if true overlap]; cutLineRef=entrance.coat-on.coat-area-cut
unmaskedPixels: preserve-exactly
qa:
  - one coat-on action and one action mask only
  - coat/doors/elevator remain scene layer, not character alpha
  - no new costume, feet, shoes, exposed legs or oversized base
  - no outside street or second character
  - contactPoint and bodyBounds are measured before runtime approval
```
