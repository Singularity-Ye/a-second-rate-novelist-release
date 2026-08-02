# reference-pack-kb-v1

这是给网页 GPT / 本机 image-gen 参考输入使用的轻量包，不是正式 runtime 替换包。

- 原始正式 PNG 未覆盖、未删除。
- 场景与不透明参考图转为 WebP，质量参数约 q72。
- 透明角色转为带 alpha 的 WebP。
- 输出图保留原始尺寸；2:1 场景仍为 1774×887。
- 发送请求时优先使用一张 clean master + 一张角色参考，不要整包上传。
- `bedroom` 与 `terrace-greenery` 的旧比例图只作历史/风格参考，不能当 2:1 母图。
- 当前 `entrance` 公共电梯厅图未收录，因为它已被判定为淘汰方案。

## 推荐输入

- 厨房修门：`scenes/dining-kitchen-master-door-repair-source.webp`
- 书房：`scenes/study/study-scene-master-2x1-formal-v1.webp`
- 阁楼：`scenes/attic/attic-clean-master-v1.webp`
- 角色身份：`characters/novelist-paper-doll-concept-v1.webp`
- 背后三分之二：`characters/novelist-back-three-quarter-v1.webp`
- 整屋规划：`maps/home-map-v1.webp`

## 不可混用

- 状态图不能成为 clean master。
- 标注截图不能成为视觉母图。
- 旧合成角色场景不能作为新的背景母图。
