---
sceneId: bedroom
actionId: door-stand
assetRole: web-gpt-edit-prompt
master: ../../bedroom-scene-master-v1.webp
mask: ../../masks/door-stand/mask-v1.webp
canvas: 1536x1024
maskSemantics: black-preserve-white-action-edit-footprint
runtimeUse: false
approvedForRuntime: false
---

上传 Image 1 作为唯一 `bedroom` 母图 edit target，上传 Image 2 作为同一纸板小说家角色参考；如支持外部蒙版，同时上传 `../../masks/door-stand/mask-v1.webp`。黑色区域完全保持不变，白色区域只允许本动作编辑。

只在右侧生活通道门内侧加入一个朝门的三分之四站立/准备离场角色。角色必须停在卧室地板，不穿过门框、不进入门外、不新增 hallway 或其他房间；保持床、床脚板、唱片柜、懒人沙发、地毯、绿植、墙、地板和灯光不变。默认 A，碰到门框才升级 B。

角色无脚、无鞋、无裸腿、无棕色平台，只保留一个薄圆弧底座作为 `contactPoint`。无文字/UI/水印；输出单动作预览。
