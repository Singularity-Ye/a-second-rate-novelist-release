---
sceneId: study
actionId: writing-seat
assetRole: web-gpt-edit-prompt
master: ../../study-scene-master-v1.webp
mask: ../../masks/writing-seat/mask-v1.webp
canvas: 1536x1024
maskSemantics: black-preserve-white-action-edit-footprint
runtimeUse: false
approvedForRuntime: false
---

上传 Image 1 作为唯一 `study` 母图 edit target，上传 Image 2 作为同一圆底纸板小说家角色参考；如网页 GPT 支持外部蒙版，同时上传 `../../masks/writing-seat/mask-v1.webp`。黑色区域完全保持不变，白色区域只允许本动作编辑。

只在现有中央书桌/椅子区域加入一个背向或背后三分之四坐姿写作角色。保持书桌、椅子、打字机、稿纸、台灯、地毯、梯子、门窗、墙面、地板、灯光和镜头不变；桌面前沿、椅背/椅面必须承担真实前景遮挡。角色不得携带桌椅或房间纹理。

角色保持同一纸板轮廓，身体下方只保留一个薄圆弧底座作为唯一 `contactPoint`。无脚、无鞋、无裸腿、无棕色大底座、无第二角色、无文字/UI/水印。输出一张合成预览，不声称是透明 actor PNG，不覆盖母图。
