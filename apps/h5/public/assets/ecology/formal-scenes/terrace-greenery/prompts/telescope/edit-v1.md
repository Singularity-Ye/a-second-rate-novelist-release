---
sceneId: terrace-greenery
actionId: telescope
assetRole: web-gpt-edit-prompt
master: ../../terrace-greenery-scene-master-v1.webp
mask: ../../masks/telescope/mask-v1.webp
canvas: 1536x1024
maskSemantics: black-preserve-white-action-edit-footprint
runtimeUse: false
approvedForRuntime: false
---

上传 Image 1 作为唯一 `terrace-greenery` 母图 edit target；如支持外部蒙版，同时上传 `../../masks/telescope/mask-v1.webp`。黑色区域完全保持不变，白色区域只允许修整上方望远镜、镜筒、三脚架和其清晰摆放面。

保持三脚架三点、通行净空、栏杆、维护梯、龟池、长椅、盆栽、砖地、城市夜景和灯光不变。望远镜是独立 prop，不是角色、不生成观察者、不把三脚架变成 walkable floor 或 actor hitbox。输出一张单动作环境编辑预览，不生成文字、UI、Logo 或水印。
