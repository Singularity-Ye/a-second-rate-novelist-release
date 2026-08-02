---
sceneId: terrace-greenery
actionId: bench
assetRole: web-gpt-edit-prompt
master: ../../terrace-greenery-scene-master-v1.webp
mask: ../../masks/bench/mask-v1.webp
canvas: 1536x1024
maskSemantics: black-preserve-white-action-edit-footprint
runtimeUse: false
approvedForRuntime: false
---

上传 Image 1 作为唯一 `terrace-greenery` 母图 edit target；如网页 GPT 支持外部蒙版，同时上传 `../../masks/bench/mask-v1.webp`。黑色区域完全保持不变，白色区域只允许修整右上长椅及其真实物件边界。

只编辑长椅对象的结构/边缘，不添加角色，不移动栏杆、维护梯、望远镜、龟池、盆栽、城市夜景或屋顶砖地。长椅是禁入 prop，不得生成坐在长椅上的人物，不得把长椅当作 actor landing。保持 1536×1024、固定三分之四略俯视镜头、暖黄/冷蓝灯光和所有非选区像素。

输出单动作环境编辑预览；无文字、UI、Logo、水印、第二长椅或新房间，不声称是透明 actor 或运行时资产。
