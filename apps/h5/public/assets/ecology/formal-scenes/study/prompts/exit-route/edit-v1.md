---
sceneId: study
actionId: exit-route
assetRole: web-gpt-edit-prompt
master: ../../study-scene-master-v1.webp
mask: ../../masks/exit-route/mask-v1.webp
canvas: 1536x1024
maskSemantics: black-preserve-white-action-edit-footprint
runtimeUse: false
approvedForRuntime: false
---

上传 Image 1 作为唯一 `study` 母图 edit target，上传 Image 2 作为同一纸板小说家角色参考；如支持外部蒙版，同时上传 `../../masks/exit-route/mask-v1.webp`。黑色区域完全保持不变，白色区域只允许本动作编辑。

只预览角色从书桌前开放地板朝中右生活通道门短距离离场，身体背向或背后三分之四朝门。终点只能是生活通道门内侧，不得使用最右阳台开口，不得生成阳台路线、门外街区或新门。门框是不透明 transition 边界，角色不能穿门。

角色只保留一个圆弧底座作为唯一 `contactPoint`，无脚、无鞋、无裸腿、无棕色底座、无文字/UI/水印。保持所有未选区像素不变；输出单动作预览，不声称为连续跨场景动画或最终 actor PNG。
