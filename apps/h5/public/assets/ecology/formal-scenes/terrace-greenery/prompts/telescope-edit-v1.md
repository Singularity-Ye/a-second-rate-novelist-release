---
scene_id: terrace-greenery
object_id: telescope
version: v1
use_case: precise-object-edit
source_asset: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/terrace-greenery/terrace-greenery-scene-master-v1.webp
mask_asset: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/terrace-greenery/masks/telescope/mask-v1.webp
canvas: 1536x1024
mask_semantics: 8-bit grayscale; white=editable telescope region; black=preserve
deliverable: web-gpt-edit-reference-only
---

# telescope｜网页 GPT edit prompt

## 输入与范围

- Image 1：上传并锁定正式露台母图 `D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/terrace-greenery/terrace-greenery-scene-master-v1.webp`，作为唯一 edit target / reference image。
- 独立 edit selection：使用 `D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/terrace-greenery/masks/telescope/mask-v1.webp`。它是 1536×1024 的 8-bit 灰度 mask：白色只表示望远镜及其三脚架可编辑区域，黑色区域全部保留。
- 本次只处理 `telescope` 一个对象、一个动作；不要合并或复用 turtle-pond、bench、maintenance-ladder 的 mask。

## 可复制提示词

```text
Use Image 1 as the only edit target: the formal terrace-greenery master scene. Use the uploaded independent telescope mask as the edit selection. The mask is an 8-bit grayscale image at exactly 1536×1024: white means the only editable telescope-and-tripod region; black means preserve every pixel. Change only the white selection.

Preserve the entire 1536×1024 canvas, fixed three-quarter slightly elevated camera, perspective, warm yellow practical lights, cool blue night skyline, old brick floor, continuous railing, plants, turtle pond, bench, left maintenance ladder, architecture, shadows, and all non-mask pixels exactly. Refine or create only one telescope prop in the existing upper-middle location, keeping the original tube orientation and the three-leg footprint/clearance. Keep the telescope visually independent from the actor and from all other props.

Do not add or edit a character, do not place an actor through the tripod, and do not turn the tripod footprint into a walkable floor. Do not move the telescope to another wall or railing, change its scale beyond the existing perspective, add a second telescope, add furniture, door, hatch, stairs, room, text, label, logo, watermark, or UI. Do not redraw the full canvas, crop it, or alter any black mask area. Output one concept/edit reference image only; this is not a runtime PNG.
```

## 坐标与验收

```yaml
coordinate_space: scene-local-normalized-0..1
origin: top-left
mask_bbox_px_inclusive: [771, 119, 1030, 498]
mask_bbox_normalized_approx: [[0.502, 0.116], [0.671, 0.486]]
actor_rule: telescope_and_tripod_are_forbidden_actor_zone; actor_may_look_toward_it_from_outside
occlusion_rule: no_actor_body_through_tube_or_tripod; no_mask_growth_into_safe_floor
qa:
  - canvas remains 1536x1024 and camera/perspective are unchanged
  - only the telescope mask is edited; turtle pond, bench, ladder and railing remain unchanged
  - tube orientation, three tripod legs and clearance remain legible
  - no character, text, watermark, UI, extra prop or architectural relation appears
  - output is a detachable reference edit, not a claimed runtime asset
```

—Kuhn｜可见协作窗口
