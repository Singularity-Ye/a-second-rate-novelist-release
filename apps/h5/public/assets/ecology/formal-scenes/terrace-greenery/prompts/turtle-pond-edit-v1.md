---
scene_id: terrace-greenery
object_id: turtle-pond
version: v1
use_case: precise-object-edit
source_asset: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/terrace-greenery/terrace-greenery-scene-master-v1.webp
mask_asset: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/terrace-greenery/masks/turtle-pond/mask-v1.webp
canvas: 1536x1024
mask_semantics: 8-bit grayscale; white=editable turtle pond region; black=preserve
deliverable: web-gpt-edit-reference-only
---

# turtle-pond｜网页 GPT edit prompt

## 输入与范围

- Image 1：上传并锁定正式露台母图 `D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/terrace-greenery/terrace-greenery-scene-master-v1.webp`，作为唯一 edit target / reference image。
- 独立 edit selection：使用 `D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/terrace-greenery/masks/turtle-pond/mask-v1.webp`。它是 1536×1024 的 8-bit 灰度 mask：白色只表示龟池、水面、池沿和现有小龟区域，黑色区域全部保留。
- 本次只处理 `turtle-pond` 一个对象、一个动作；不要合并或复用 telescope、bench、maintenance-ladder 的 mask。

## 可复制提示词

```text
Use Image 1 as the only edit target: the formal terrace-greenery master scene. Use the uploaded independent turtle-pond mask as the edit selection. The mask is an 8-bit grayscale image at exactly 1536×1024: white means the only editable turtle-pond, water, rim and existing turtle region; black means preserve every pixel. Change only the white selection.

Preserve the entire 1536×1024 canvas, fixed three-quarter slightly elevated camera, perspective, warm yellow practical lights, cool blue night skyline, old brick floor, continuous railing, plants, telescope, bench, left maintenance ladder, architecture, shadows, and all non-mask pixels exactly. Refine only the existing lower-right turtle pond in place, preserving the pond footprint, water surface, rim, material continuity and the existing small turtle. Keep the pond a distinct non-walkable scene prop.

Do not add a second turtle, a character in the water, a character on the rim, a bridge, fountain, aquarium, extra furniture or new architecture. Do not move or enlarge the pond, change the camera, redraw the full canvas, or alter any black mask area. Do not add text, label, logo, watermark or UI. Output one concept/edit reference image only; this is not a runtime PNG.
```

## 坐标与验收

```yaml
coordinate_space: scene-local-normalized-0..1
origin: top-left
mask_bbox_px_inclusive: [866, 645, 1082, 801]
mask_bbox_normalized_approx: [[0.564, 0.630], [0.704, 0.782]]
actor_rule: pond_water_and_rim_are_forbidden; turtle-observe_anchor_stays_on_dry_brick_outside
occlusion_rule: pond_or_rim_may_occlude_only_true_lower-body_overlap; never cover actor face_or_round-base_contact
qa:
  - canvas remains 1536x1024 and camera/perspective are unchanged
  - only the turtle-pond mask is edited; telescope, bench, ladder and floor remain unchanged
  - pond edge, water surface, existing turtle and surrounding dry-brick boundary remain readable
  - no extra turtle, character in water, bridge, fountain, text, watermark, UI or new architecture
  - output is a detachable reference edit, not a claimed runtime asset
```

—Kuhn｜可见协作窗口
