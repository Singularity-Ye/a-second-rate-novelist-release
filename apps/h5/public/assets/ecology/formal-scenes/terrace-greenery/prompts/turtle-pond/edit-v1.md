---
sceneId: terrace-greenery
actionId: turtle-pond
assetRole: web-gpt-edit-prompt
master: ../../terrace-greenery-scene-master-v1.webp
mask: ../../masks/turtle-pond/mask-v1.webp
canvas: 1536x1024
maskSemantics: black-preserve-white-action-edit-footprint
runtimeUse: false
approvedForRuntime: false
---

上传 Image 1 作为唯一 `terrace-greenery` 母图 edit target；如支持外部蒙版，同时上传 `../../masks/turtle-pond/mask-v1.webp`。黑色区域完全保持不变，白色区域只允许修整右下龟池、水面、池沿和干燥砖地边界。

保留现有一只静态小龟和龟池的低敏环境语义；龟池不是 walkable floor、不是 actor landing、不是角色 hitbox。不得添加第二只龟、其他宠物、人物、池中角色或跨越水面的路径；保持栏杆、维护梯、长椅、望远镜、盆栽、城市夜景和镜头不变。输出单动作环境编辑预览，不生成文字/UI/水印。
