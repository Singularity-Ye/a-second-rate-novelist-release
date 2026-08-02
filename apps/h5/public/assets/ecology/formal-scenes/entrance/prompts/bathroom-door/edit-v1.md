---
sceneId: entrance
actionId: bathroom-door
assetRole: web-gpt-edit-prompt
master: ../../entrance-scene-master-v1.webp
mask: ../../masks/bathroom-door/mask-v1.webp
canvas: 1536x1024
maskSemantics: black-preserve-white-action-edit-footprint
runtimeUse: false
approvedForRuntime: false
---

上传 Image 1 作为唯一 `entrance` 母图 edit target，上传 Image 2 作为同一纸板小说家角色参考；如支持外部蒙版，同时上传 `../../masks/bathroom-door/mask-v1.webp`。黑色区域完全保持不变，白色区域只允许本动作编辑。

只预览关闭浴室门外的礼貌等待/观察站位。浴室门必须完整关闭、不透明、无门缝光、无剪影、无镜面或内部设施；角色停在门外木地板并保持距离，不创建浴室内部 actor anchor、camera、录像或回放。玄关家具与右侧室内通道保持不变。

角色无脚、无鞋、无裸腿、无棕色底座，只保留一个圆弧底座作为 `contactPoint`。无窥视、文字/UI/水印；输出单动作预览。
