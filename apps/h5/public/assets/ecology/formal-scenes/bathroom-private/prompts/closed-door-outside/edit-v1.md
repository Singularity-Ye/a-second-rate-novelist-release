---
sceneId: bathroom-private
actionId: closed-door-outside
assetRole: web-gpt-edit-prompt
master: ../../bathroom-private-scene-master-v1.png
mask: ../../masks/closed-door-outside/mask-v1.webp
canvas: 1536x1024
maskSemantics: black-preserve-white-action-edit-footprint
masterStatus: master-pending
runtimeUse: false
approvedForRuntime: false
---

本动作必须等待 `bathroom-private-scene-master-v1.png` 正式外部门外母图到位后执行；当前 `master` 路径是预留 canonical 槽位，不得用 entrance 图或其他房间图替代。上传 Image 1 作为唯一浴室门外母图 edit target；如支持外部蒙版，同时上传 `../../masks/closed-door-outside/mask-v1.webp`。黑色区域完全保持不变，白色区域只允许修整关闭门、门框、把手、门外地板和外部灯光。

浴室门必须完整关闭、不透明、无门缝光、无玻璃反射、无窥视角度。绝不生成浴缸、马桶、淋浴、洗手台、镜子、人体、剪影、录像或 occupied-private 内部画面；不得创建内部 actor anchor。只输出门外 privacy-boundary 环境编辑预览，不生成角色、文字/UI/水印，不标记 runtime。
