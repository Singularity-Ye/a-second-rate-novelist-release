---
sceneId: attic
actionId: archive-shelf
assetRole: web-gpt-edit-prompt
master: ../../candidates/attic-scene-candidate-v1.webp
mask: ../../masks/archive-shelf/mask-v1.webp
canvas: 1536x1024
maskSemantics: black-preserve-white-action-edit-footprint
masterStatus: candidate-not-runtime
runtimeUse: false
approvedForRuntime: false
---

上传 Image 1 作为阁楼 candidate 母图 edit target；如支持外部蒙版，同时上传 `../../masks/archive-shelf/mask-v1.webp`。黑色区域完全保持不变，白色区域只允许整理旧书堆/档案架的结构和局部遮挡边界。

保持斜屋顶、天窗、旧木地板、梯口、冷蓝星光、暖黄补光和所有非选区像素不变。阁楼是记忆/档案层，不得新增书桌、打字机、床、餐桌、厨房设备或第二房间；不生成角色。书堆/箱体前缘若作为前景，只遮真实交叠区域，不遮住未来 actor 的头脸、圆底最低点或安全通道。

本 prompt 只能用于 candidate review；输出单动作环境编辑预览，不标记 runtime、不生成文字/UI/水印。
