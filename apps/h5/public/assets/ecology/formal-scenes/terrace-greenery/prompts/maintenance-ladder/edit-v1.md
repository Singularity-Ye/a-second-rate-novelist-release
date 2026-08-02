---
sceneId: terrace-greenery
actionId: maintenance-ladder
assetRole: web-gpt-edit-prompt
master: ../../terrace-greenery-scene-master-v1.webp
mask: ../../masks/maintenance-ladder/mask-v1.webp
canvas: 1536x1024
maskSemantics: black-preserve-white-action-edit-footprint
runtimeUse: false
approvedForRuntime: false
---

上传 Image 1 作为唯一 `terrace-greenery` 母图 edit target；如支持外部蒙版，同时上传 `../../masks/maintenance-ladder/mask-v1.webp`。黑色区域完全保持不变，白色区域只允许修整左侧维护梯/检修口与屋顶平台的真实连接。

只表达 `maintenance:balcony-to-terrace-greenery` 的维护出口；保持扶手、踏棍、顶部 landing、栏杆、盆栽、龟池、长椅、望远镜、屋顶砖地、城市夜景和镜头不变。不要把维护梯改成普通房门、电梯、舱口或未知楼梯，不要生成站在踏棍上的角色。输出单动作环境编辑预览，不生成角色、文字、UI 或水印。
