---
sceneId: bedroom
actionId: bed-edge-seat
assetRole: web-gpt-edit-prompt
master: ../../bedroom-scene-master-v1.webp
mask: ../../masks/bed-edge-seat/mask-v1.webp
canvas: 1536x1024
maskSemantics: black-preserve-white-action-edit-footprint
runtimeUse: false
approvedForRuntime: false
---

上传 Image 1 作为唯一 `bedroom` 母图 edit target，上传 Image 2 作为同一纸板小说家角色参考；如支持外部蒙版，同时上传 `../../masks/bed-edge-seat/mask-v1.webp`。黑色区域完全保持不变，白色区域只允许本动作编辑。

只在现有大床近侧床沿加入一个三分之四朝向房间的坐姿角色。保持床架、床脚板、床垫、被褥、床头柜、唱片柜、懒人沙发、门和地板不变；床沿、床脚板和被褥前片必须按真实深度遮挡下身。角色不得把床或被褥嵌入身体，此动作为 B→C。

角色无脚、无鞋、无裸腿、无棕色平台，只保留一个圆弧底座并对齐床沿支撑 `contactPoint`。无文字/UI/水印；输出单动作预览，不覆盖母图。
