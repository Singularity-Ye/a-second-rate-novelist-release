---
sceneId: bedroom
actionId: lounge-seat
assetRole: web-gpt-edit-prompt
master: ../../bedroom-scene-master-v1.webp
mask: ../../masks/lounge-seat/mask-v1.webp
canvas: 1536x1024
maskSemantics: black-preserve-white-action-edit-footprint
runtimeUse: false
approvedForRuntime: false
---

上传 Image 1 作为唯一 `bedroom` 母图 edit target，上传 Image 2 作为同一纸板小说家角色参考；如支持外部蒙版，同时上传 `../../masks/lounge-seat/mask-v1.webp`。黑色区域完全保持不变，白色区域只允许本动作编辑。

只在现有右下懒人沙发区域加入一个低刺激听唱片/发呆坐姿。保持懒人沙发、唱片柜、唱片、床、床脚板、地毯、右侧门、墙面、地板、窗和灯光不变；沙发前沿承担真实遮挡，不能把沙发烘焙进角色。此动作为 B→C 预览。

角色无脚、无鞋、无裸腿、无棕色大底座，只保留一个圆弧底座作为唯一 `contactPoint`。无第二人物、无文字/UI/水印；输出单动作合成预览，不生成最终透明 actor PNG。
