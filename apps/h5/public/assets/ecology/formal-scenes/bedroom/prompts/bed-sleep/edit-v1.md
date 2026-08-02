---
sceneId: bedroom
actionId: bed-sleep
assetRole: web-gpt-edit-prompt
master: ../../bedroom-scene-master-v1.webp
mask: ../../masks/bed-sleep/mask-v1.webp
canvas: 1536x1024
maskSemantics: black-preserve-white-action-edit-footprint
runtimeUse: false
approvedForRuntime: false
---

上传 Image 1 作为唯一 `bedroom` 母图 edit target，上传 Image 2 作为同一纸板小说家角色参考；如支持外部蒙版，同时上传 `../../masks/bed-sleep/mask-v1.webp`。黑色区域完全保持不变，白色区域只允许本动作编辑。

只预览沿床轴向的低刺激侧卧或仰卧睡眠姿态。保持床、枕头、被褥、床脚板、床头柜、唱片柜、豆袋椅、门、墙、地板和镜头不变；被褥/床脚板可以在真实前景深度局部遮挡角色。不得新增第二张床、把被褥烘焙进 actor 或让角色漂浮，此动作为 C 类。

角色无脚、无鞋、无裸腿、无棕色大底座；圆弧底座仍是唯一支撑 `contactPoint`。输出单动作合成预览，不作为最终透明 actor PNG。
