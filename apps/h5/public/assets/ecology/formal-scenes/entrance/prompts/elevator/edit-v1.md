---
sceneId: entrance
actionId: elevator
assetRole: web-gpt-edit-prompt
master: ../../entrance-scene-master-v1.webp
mask: ../../masks/elevator/mask-v1.webp
canvas: 1536x1024
maskSemantics: black-preserve-white-action-edit-footprint
runtimeUse: false
approvedForRuntime: false
---

上传 Image 1 作为唯一 `entrance` 母图 edit target，上传 Image 2 作为同一纸板小说家角色参考；如支持外部蒙版，同时上传 `../../masks/elevator/mask-v1.webp`。黑色区域完全保持不变，白色区域只允许本动作编辑。

将本动作解释为右侧室内生活通道/回家交接站位，而不是新增电梯、楼梯或外部出口：只在玄关内侧连续木地板加入一个回家或转身站立角色。保留唯一外门、关闭浴室门、鞋柜、衣架、雨伞、信箱、墙、地板和灯光；不得新增电梯井、第二外门、街区或未知房间。

角色无脚、无鞋、无裸腿、无棕色底座，只保留一个圆弧底座作为 `contactPoint`。无文字/UI/水印；输出单动作合成预览，不覆盖母图。
