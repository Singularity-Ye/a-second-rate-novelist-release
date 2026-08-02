---
sceneId: bedroom
actionId: door-stand
status: planned
approvedForRuntime: false
sourceMaster: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/bedroom/bedroom-scene-master-v1.webp
mask: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/bedroom/masks/door-stand/mask-v1.webp
characterReference: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/.tmp/world-lab-dev/scene-drafts/paper-person-pose-sheet-reference-v1.png
expectedOutput: bedroom-door-stand-web-gpt-edit-v1.png
---

# bedroom / door-stand

## Web GPT edit prompt

Upload the formal `bedroom` scene master as **Image 1**, the approved paper-person reference as **Image 2**, and use the supplied 1536×1024 mask. Image 1 is the edit target and Image 2 is the identity source of truth. White mask pixels are the only editable actor placement region. Preserve every unmasked pixel exactly, including the door, bed, bedding, furniture, room geometry, lighting and shadows.

Place exactly one neutral standing paper person beside the bedroom door, facing the exit or slightly back toward the room. Preserve the exact old cardboard silhouette, thick black contour, hand-drawn texture, blue-gray robe, patches, tired humorous expression and compact rounded rocker base. The door frame, door leaf and threshold remain scene-layer assets; do not paint them into the character or turn the actor into a door-shaped prop.

The rounded rocker base is the only grounding structure and must align to the bedroom floorPlane. No feet, shoes, exposed legs, rods, giant brown base or block platform. Do not mix in bed-sleep, bed-edge-seat or lounge-seat, edit black mask pixels, add furniture/characters/text/logo/watermark/UI, or change the camera. Return one 1536×1024 concept edit reference only.

## Coordinates and acceptance

```yaml
coordinateSpace: scene-local-pixels
canvas: [1536, 1024]
maskBBoxInclusive: [1060, 451, 1504, 808]
maskBBoxNormalizedApprox: [[0.690, 0.440], [0.979, 0.789]]
poseId: standing
facing: toward-door-left-or-right-three-quarter
roundBase: only-grounding-structure; contactPoint=roundBase.contactPoint; align-to-bedroom-manifest-floorPlane
safeZone: face, shoulders, robe core, rocker-base lowest arc
foregroundOcclusion: B/C; layers=[door leaf/frame foreground]; cutLineRef=bedroom.door-stand.door-threshold-cut
unmaskedPixels: preserve-exactly
qa:
  - one door-stand action and one action mask only
  - door remains scene layer and does not enter character alpha
  - no sleep, bed-edge or lounge-seat pose
  - no feet, shoes, exposed legs, rods or oversized base
  - contactPoint remains visible or explicitly cut-line approved
```
