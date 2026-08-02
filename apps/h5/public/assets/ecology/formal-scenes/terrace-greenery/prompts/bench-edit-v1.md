---
scene_id: terrace-greenery
object_id: bench
version: v1
use_case: precise-object-edit
source_asset: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/terrace-greenery/terrace-greenery-scene-master-v1.webp
mask_asset: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/terrace-greenery/masks/bench/mask-v1.webp
canvas: 1536x1024
mask_semantics: 8-bit grayscale; white=editable bench region; black=preserve
deliverable: web-gpt-edit-reference-only
---

# bench｜网页 GPT edit prompt

## 输入与范围

- Image 1：上传并锁定正式露台母图 `D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/terrace-greenery/terrace-greenery-scene-master-v1.webp`，作为唯一 edit target / reference image。
- 独立 edit selection：使用 `D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/terrace-greenery/masks/bench/mask-v1.webp`。它是 1536×1024 的 8-bit 灰度 mask：白色只表示长椅座面及支腿可编辑区域，黑色区域全部保留。
- 本次只处理 `bench` 一个对象、一个动作；不要合并或复用 telescope、turtle-pond、maintenance-ladder 的 mask。

## 可复制提示词

```text
Use Image 1 as the only edit target: the formal terrace-greenery master scene. Use the uploaded independent bench mask as the edit selection. The mask is an 8-bit grayscale image at exactly 1536×1024: white means the only editable bench seat-and-leg region; black means preserve every pixel. Change only the white selection.

Preserve the entire 1536×1024 canvas, fixed three-quarter slightly elevated camera, perspective, warm yellow practical lights, cool blue night skyline, old brick floor, continuous railing, plants, telescope, turtle pond, left maintenance ladder, architecture, shadows, and all non-mask pixels exactly. Refine only the existing upper-right bench in place, preserving the seat plane, leg placement, wood material and perspective. Keep the bench visually separate from the actor and from the railing.

Do not add a chair, table, cushion, character sitting on the bench, character inside the legs, or a second bench. Do not move or rotate the bench, change its footprint, redraw the full canvas, or alter any black mask area. Do not add text, label, logo, watermark or UI. Output one concept/edit reference image only; this is not a runtime PNG.
```

## 坐标与验收

```yaml
coordinate_space: scene-local-normalized-0..1
origin: top-left
mask_bbox_px_inclusive: [987, 348, 1257, 566]
mask_bbox_normalized_approx: [[0.643, 0.340], [0.818, 0.553]]
actor_rule: bench_seat_and_leg_footprint_are_forbidden; no_actor_sitting_or_inside_legs
occlusion_rule: bench_may_occlude_only_true_lower-body_overlap; never cover actor face_or_round-base_contact
qa:
  - canvas remains 1536x1024 and camera/perspective are unchanged
  - only the bench mask is edited; telescope, pond, ladder, railing and floor remain unchanged
  - seat plane, legs, depth order and perspective remain legible
  - no extra chair, cushion, sitting character, text, watermark, UI or new architecture
  - output is a detachable reference edit, not a claimed runtime asset
```

—Kuhn｜可见协作窗口
