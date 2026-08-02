---
sceneId: entrance
actionId: apartment-door
assetRole: web-gpt-edit-prompt
master: ../../entrance-scene-master-v1.webp
mask: ../../masks/apartment-door/mask-v1.webp
canvas: 1536x1024
maskSemantics: black-preserve-white-action-edit-footprint
runtimeUse: false
approvedForRuntime: false
---

上传 Image 1 作为唯一 `entrance` 母图 edit target，上传 Image 2 作为同一纸板小说家角色参考；如支持外部蒙版，同时上传 `../../masks/apartment-door/mask-v1.webp`。黑色区域完全保持不变，白色区域只允许本动作编辑。

只预览唯一外门内侧的出门前站立/离场瞬间。保留外门、门框、门槛、信箱、鞋柜、衣架、雨伞、右侧室内走廊和所有灯光/透视；不生成门外街道或连续外部移动。穿门必须由门扇/门槛前景和不透明 transition 处理，不能把角色直接盖在 closed door 上。

角色无脚、无鞋、无裸腿、无棕色平台，只保留一个圆弧底座作为 `contactPoint`。无文字/UI/水印；输出单动作合成预览，不是最终 actor PNG。
