---
sceneId: bedroom
actionId: lounge-seat
status: planned
approvedForRuntime: false
sourceMaster: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/bedroom/bedroom-scene-master-v1.webp
mask: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/bedroom/masks/lounge-seat/mask-v1.webp
characterReference: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/.tmp/world-lab-dev/scene-drafts/paper-person-pose-sheet-reference-v1.png
expectedOutput: bedroom-lounge-seat-web-gpt-edit-v1.png
---

# bedroom / lounge-seat

## Web GPT edit prompt

Upload the formal `bedroom` scene master as **Image 1**, the approved paper-person reference as **Image 2**, and use the supplied 1536×1024 mask. Image 1 is the edit target; Image 2 is the identity source of truth. White mask pixels are the only editable actor region. Preserve all unmasked pixels exactly, including the lounge sofa, bed, bedding, record player, lamp, room geometry, lighting and shadows.

Create exactly one seated-resting paper person on the existing lounge sofa, with a relaxed tired-but-funny expression. Preserve the approved old cardboard silhouette, thick black line, hand-drawn texture, blue-gray robe, patches, muted colors and compact rounded rocker base as an independently measurable character. The sofa, cushions and upholstery are scene-layer assets and must not be included in the character cutout; use the sofa foreground only for the declared B/C occlusion.

This is a single **lounge-seat** action only. Do not add a sleeping pose, bed-edge seat, bed blanket or second pose. No feet, shoes, exposed legs, rods, giant brown base or block platform. Do not edit outside the white mask or add furniture, characters, text, logo, watermark, UI or new architecture. Return one 1536×1024 concept edit reference only.

## Coordinates and acceptance

```yaml
coordinateSpace: scene-local-pixels
canvas: [1536, 1024]
maskBBoxInclusive: [968, 635, 1489, 1003]
maskBBoxNormalizedApprox: [[0.630, 0.620], [0.970, 0.979]]
poseId: seated-resting
facing: left-or-right-three-quarter
roundBase: only-grounding-structure; contactPoint=roundBase.contactPoint-if-visible; sofa-is-not-grounding
safeZone: face, shoulders, folded robe core, upper hands; base/cut line must be documented
foregroundOcclusion: C/B; layers=[lounge-sofa/cushion foreground]; cutLineRef=bedroom.lounge-seat.sofa-cut
unmaskedPixels: preserve-exactly
qa:
  - one lounge-seat action and one action mask only
  - no bed-sleep, bed-edge-seat or lying pose
  - sofa remains outside character alpha; no feet, shoes or exposed legs
  - no oversized brown base or sofa fused into the actor
  - contactPoint/bodyBounds/cutLine are measured before runtime approval
```
