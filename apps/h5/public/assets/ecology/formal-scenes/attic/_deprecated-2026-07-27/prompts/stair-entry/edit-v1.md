---
sceneId: attic
actionId: stair-entry
assetRole: web-gpt-edit-prompt
master: ../../candidates/attic-scene-candidate-v1.webp
mask: ../../masks/stair-entry/mask-v1.webp
canvas: 1536x1024
maskSemantics: black-preserve-white-action-edit-footprint
masterStatus: candidate-not-runtime
runtimeUse: false
approvedForRuntime: false
---

上传 Image 1 作为阁楼 candidate 母图 edit target；如支持外部蒙版，同时上传 `../../masks/stair-entry/mask-v1.webp`。黑色区域完全保持不变，白色区域只允许修整梯口、梯侧梁、踏板前缘与阁楼可停留地面的连接。

保持梯子从真实下层地面连续进入阁楼，但梯口深处只表现不透明深度边界，不显示楼下房间、走廊或人物。不要把梯子改成装饰梯、悬空梯、普通门或未知出口；不要生成人物、脚、家具、文字/UI/水印。输出单动作环境编辑预览，candidate 未经母图晋级不得进入运行时。
