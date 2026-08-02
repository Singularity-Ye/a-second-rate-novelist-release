---
sceneId: study
actionId: stand-by-desk
assetRole: web-gpt-edit-prompt
master: ../../study-scene-master-v1.webp
mask: ../../masks/stand-by-desk/mask-v1.webp
canvas: 1536x1024
maskSemantics: black-preserve-white-action-edit-footprint
runtimeUse: false
approvedForRuntime: false
---

上传 Image 1 作为唯一 `study` 母图 edit target，上传 Image 2 作为同一圆底纸板小说家角色参考；如网页 GPT 支持外部蒙版，同时上传 `../../masks/stand-by-desk/mask-v1.webp`。黑色区域完全保持不变，白色区域只允许本动作编辑。

只在书桌左前侧开放木地板加入一个站立角色，身体三分之四朝向书桌。保持书桌、椅子、地毯、梯子、中右生活通道门、阳台开口、窗户、墙、地板、灯光和透视不变；角色不得进入梯子、门槛或阳台开口。默认 A 类透明叠加，碰到桌沿才使用窄 `desk-front` 前景。

角色只保留一个薄圆弧底座作为唯一 `contactPoint`，无脚、无鞋、无裸腿、无棕色平台、无家具嵌入、无文字/UI/水印。输出单动作合成预览，不生成新房间或最终 actor PNG。
