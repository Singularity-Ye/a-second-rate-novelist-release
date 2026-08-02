---
sceneId: study
actionId: writing-seat
status: planned
approvedForRuntime: false
sourceMaster: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/study/study-scene-master-v1.webp
mask: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/study/masks/writing-seat/mask-v1.webp
characterReference: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/.tmp/world-lab-dev/scene-drafts/paper-person-pose-sheet-reference-v1.png
expectedOutput: study-writing-seat-web-gpt-edit-v1.png
---

# study / writing-seat

## Web GPT edit prompt

Upload the formal `study` scene master as **Image 1**, the approved paper-person reference as **Image 2**, and use the supplied 1536×1024 mask for this edit. Image 1 is the edit target; Image 2 is the identity source of truth. White mask pixels are the only editable actor placement region. Preserve every unmasked pixel of Image 1 exactly: camera, desk, chair, papers, lamp, room geometry, lighting, shadows and background.

Place exactly one paper person in a single seated-writing pose at the desk within the white selection. Preserve the approved old cardboard silhouette, thick black contour, hand-drawn cardboard texture, tired-but-funny expression, worn blue-gray robe, patches, muted palette and compact rounded rocker base. The pose should read as writing/resting at the desk, with hands near the existing writing area, but the desk, chair, papers and lamp remain scene-layer objects and must not be painted into the character. Keep the character separable for a later transparent cutout.

The rounded rocker base is the only grounding structure. It must align to the study floor/desk landing and may not become a giant brown base, block, platform or furniture substitute. No feet, shoes, exposed legs, support rods or anatomical leg shapes. Do not add another character, new furniture, room redesign, text, label, logo, watermark, UI, photorealism, 3D rendering or glossy plastic. Do not modify anything outside the white mask, do not mix this with a standing or walking pose, and output the same 1536×1024 canvas as one concept edit reference.

## Coordinates and acceptance

```yaml
coordinateSpace: scene-local-pixels
canvas: [1536, 1024]
maskBBoxInclusive: [415, 440, 1105, 962]
maskBBoxNormalizedApprox: [[0.270, 0.430], [0.720, 0.939]]
poseId: seated-writing
facing: back-or-three-quarter-left
roundBase: only-grounding-structure; contactPoint=roundBase.contactPoint; align-to-study-manifest-floorPlane
safeZone: face, shoulders, hands, robe core, rocker-base lowest arc
foregroundOcclusion: B; layers=[study desk/chair foreground]; cutLineRef=study.writing-seat.desk-chair-cut
unmaskedPixels: preserve-exactly
qa:
  - one action and one action mask only
  - desk/chair/papers/lamp remain scene layer, never character alpha
  - no feet, shoes, exposed legs, rods or oversized brown base
  - face, robe, patches, line weight and compact rocker base match Image 2
  - contactPoint is auditable before runtime approval
```
