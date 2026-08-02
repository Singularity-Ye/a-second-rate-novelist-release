---
sceneId: bedroom
actionId: bed-sleep
status: planned
approvedForRuntime: false
sourceMaster: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/bedroom/bedroom-scene-master-v1.webp
mask: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/bedroom/masks/bed-sleep/mask-v1.webp
characterReference: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/.tmp/world-lab-dev/scene-drafts/paper-person-pose-sheet-reference-v1.png
expectedOutput: bedroom-bed-sleep-web-gpt-edit-v1.png
---

# bedroom / bed-sleep

## Web GPT edit prompt

Upload the formal `bedroom` scene master as **Image 1**, the approved paper-person reference as **Image 2**, and use the supplied 1536×1024 mask. Image 1 is the edit target; Image 2 is the identity source of truth. White mask pixels are the only editable sleep-state region. Preserve every unmasked pixel exactly, including bed, sheets, pillows, record player, sofa, lamp, room geometry, lighting and shadows.

Create exactly one quiet sleeping/slumped paper-person state using the approved character identity. Keep the old cardboard edge, thick black contour, hand-drawn texture, blue-gray robe, patches, tired humorous character language and compact rounded rocker base wherever the pose permits. Treat the bed and blanket as scene-layer foreground/occlusion, not as part of the transparent character. If the bedding hides the base, preserve an auditable cut line and do not invent another grounding structure.

This is a single **bed-sleep** action only: do not include bed-edge sitting, lounge-seat, sofa, walking or a second pose. No feet, shoes, exposed legs, rods, giant brown base or block platform. Do not edit outside the white mask or add furniture, extra characters, text, label, logo, watermark, UI or new architecture. Return one 1536×1024 concept edit reference only.

## Coordinates and acceptance

```yaml
coordinateSpace: scene-local-pixels
canvas: [1536, 1024]
maskBBoxInclusive: [230, 246, 1059, 787]
maskBBoxNormalizedApprox: [[0.150, 0.240], [0.690, 0.769]]
poseId: bed-sleep
facing: back-or-side-three-quarter
roundBase: only-grounding-structure; contactPoint=roundBase.contactPoint-if-visible; no-bed-as-base
safeZone: face, upper robe, shoulder line; base/cut line must remain documented
foregroundOcclusion: C/B; layers=[bed sheet/blanket foreground]; cutLineRef=bedroom.bed-sleep.blanket-cut
unmaskedPixels: preserve-exactly
qa:
  - one bed-sleep action and one action mask only
  - no bed-edge-seat or lounge-seat pose in the same output
  - no visible feet, shoes, bare legs or invented support
  - bed/blanket never become character alpha or a giant brown base
  - state remains blocked until bodyBounds/contactPoint/cutLine are measurable
```
