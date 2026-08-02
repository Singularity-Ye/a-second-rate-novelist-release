---
sceneId: terrace-greenery
actionId: bench
status: planned
approvedForRuntime: false
sourceMaster: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/terrace-greenery/terrace-greenery-scene-master-v1.webp
mask: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/terrace-greenery/masks/bench/mask-v1.webp
characterReference: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/.tmp/world-lab-dev/scene-drafts/paper-person-pose-sheet-reference-v1.png
expectedOutput: terrace-greenery-bench-web-gpt-edit-v1.png
---

# terrace-greenery / bench

## Web GPT edit prompt

Upload the formal `terrace-greenery` master as **Image 1**, the approved paper-person reference as **Image 2**, and use the supplied 1536×1024 mask. Image 1 is the edit target and Image 2 is the identity source of truth. White mask pixels are the only editable actor placement region; preserve every unmasked pixel exactly, including bench, plants, telescope, turtle pond, ladder, railing, brick floor, skyline, lighting and shadows.

Create one bench-rest action only: a single three-quarter seated-resting paper person at the existing bench location. Keep the exact old cardboard silhouette, thick black contour, hand-drawn texture, tired humorous expression, blue-gray robe, patches and compact rounded rocker base. The bench is a scene-layer occluder/semantic prop, never part of the character transparent layer. The base may be hidden by the seat only at the approved cut line.

Do not combine standing-beside-bench and sitting in one output; if a standing fallback is needed later, it is a separate pose using this same action contract, not a second figure. No feet, shoes, exposed legs, rods, giant brown base, added furniture, extra characters, text, logo, watermark, UI or altered black-mask pixels. Return one 1536×1024 concept edit reference only.

## Coordinates and acceptance

```yaml
coordinateSpace: scene-local-pixels
canvas: [1536, 1024]
maskBBoxInclusive: [987, 348, 1257, 566]
maskBBoxNormalizedApprox: [[0.643, 0.340], [0.818, 0.553]]
poseId: seated-resting
facing: three-quarter-left-or-right-toward-city
roundBase: only-grounding-structure; contactPoint=roundBase.contactPoint; bench-is-not-grounding
safeZone: face, shoulders, upper robe, hands; base cut line must be explicit
foregroundOcclusion: B/C; layers=[bench seat/back foreground]; cutLineRef=terrace-greenery.bench.bench-seat-cut
unmaskedPixels: preserve-exactly
qa:
  - one bench action and one action mask only
  - no standing and seated figures together
  - bench, railing and plants remain scene layer
  - no feet, shoes, exposed legs or oversized base
  - city/pond/ladder props stay unchanged and contactPoint remains auditable
```
