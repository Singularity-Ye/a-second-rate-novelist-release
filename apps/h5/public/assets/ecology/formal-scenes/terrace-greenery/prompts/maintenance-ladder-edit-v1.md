---
scene_id: terrace-greenery
object_id: maintenance-ladder
version: v1
use_case: precise-object-edit
source_asset: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/terrace-greenery/terrace-greenery-scene-master-v1.webp
mask_asset: D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/terrace-greenery/masks/maintenance-ladder/mask-v1.webp
canvas: 1536x1024
mask_semantics: 8-bit grayscale; white=editable maintenance-ladder region; black=preserve
deliverable: web-gpt-edit-reference-only
---

# maintenance-ladder｜网页 GPT edit prompt

## 输入与范围

- Image 1：上传并锁定正式露台母图 `D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/terrace-greenery/terrace-greenery-scene-master-v1.webp`，作为唯一 edit target / reference image。
- 独立 edit selection：使用 `D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/terrace-greenery/masks/maintenance-ladder/mask-v1.webp`。它是 1536×1024 的 8-bit 灰度 mask：白色只表示左侧维护梯、扶手、踏棍和顶部 landing 可编辑区域，黑色区域全部保留。
- 本次只处理 `maintenance-ladder` 一个对象、一个动作；不要合并或复用 telescope、turtle-pond、bench 的 mask。

## 可复制提示词

```text
Use Image 1 as the only edit target: the formal terrace-greenery master scene. Use the uploaded independent maintenance-ladder mask as the edit selection. The mask is an 8-bit grayscale image at exactly 1536×1024: white means the only editable left maintenance-ladder, rails, rungs and top-landing region; black means preserve every pixel. Change only the white selection.

Preserve the entire 1536×1024 canvas, fixed three-quarter slightly elevated camera, perspective, warm yellow practical lights, cool blue night skyline, old brick floor, continuous railing, plants, telescope, turtle pond, bench, architecture, shadows, and all non-mask pixels exactly. Refine only the existing left-side maintenance ladder in place, preserving both rails, every rung, the wall relation and the top landing as a clear architectural connection. Keep the ladder distinct from the actor and from the walkable brick floor.

Do not turn it into an ordinary door, hatch, indoor doorway, unknown staircase or street-facing stair. Do not add a character on the rungs, between the rails, or inside the maintenance opening. Do not move, extend or detach the ladder, redraw the full canvas, or alter any black mask area. Do not add text, label, logo, watermark or UI. Output one concept/edit reference image only; this is not a runtime PNG.
```

## 坐标与验收

```yaml
coordinate_space: scene-local-normalized-0..1
origin: top-left
mask_bbox_px_inclusive: [138, 410, 240, 909]
mask_bbox_normalized_approx: [[0.090, 0.400], [0.156, 0.888]]
actor_rule: rungs_and_ladder_opening_are_forbidden; only maintenanceExit_may_touch_top_landing_as_transition_boundary
occlusion_rule: ladder_side_rails_may_occlude_true_overlap_near_exit; never cover actor_round-base_contact_or_erase_landing_evidence
qa:
  - canvas remains 1536x1024 and camera/perspective are unchanged
  - only the maintenance-ladder mask is edited; telescope, pond, bench, railing and floor remain unchanged
  - both rails, rungs, top landing and wall connection remain legible
  - no ordinary door, hatch, unknown stairs, character on rungs, text, watermark, UI or new architecture
  - output is a detachable reference edit, not a claimed runtime asset
```

—Kuhn｜可见协作窗口
