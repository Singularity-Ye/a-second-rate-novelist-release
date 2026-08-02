---
project: a-second-rate-novelist
sceneId: entrance
action: apartment-door
master: "D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/entrance/entrance-scene-master-v1.webp"
mask: "D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/entrance/apartment-door/mask-v1.webp"
identityReference: "D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/characters/novelist/novelist-back-v1.webp"
canvas: 1536x1024
maskSemantics: "8-bit-style RGB PNG; white=editable action region, black=protected mother pixels"
status: previewed-with-stable-reference-v2
---

# `entrance / apartment-door`｜网页 GPT edit prompt

## 区域坐标与职责

- 原图：`D:\Yhx06\Documents\仙术工坊——项目集\a-second-rate-novelist\apps\h5\public\assets\ecology\formal-scenes\entrance\entrance-scene-master-v1.webp`
- 蒙版：`D:\Yhx06\Documents\仙术工坊——项目集\a-second-rate-novelist\apps\h5\public\assets\ecology\formal-scenes\entrance\apartment-door\mask-v1.webp`
- 同画布：`1536×1024`。
- 白色动作区覆盖左侧唯一 apartment door、门内侧地面、衣架/信件小柜附近；黑色区域保护浴室门、电梯和中央地毯。
- 参考多边形约为 `(0,85) → (400,85) → (480,735) → (620,1023) → (0,1023)`；这是编辑区，不是最终门槛 hitbox。

## 可直接粘贴到网页 GPT

```text
请编辑我附上的《二流小说家》entrance 正式母图，并同时附上且只使用这一张角色身份/体型/画风参考：`D:\Yhx06\Documents\仙术工坊——项目集\a-second-rate-novelist\apps\h5\public\assets\ecology\characters\novelist\novelist-back-v1.webp`。这张图是严格纯背面、无脸的本动作唯一角色正史，禁止引入旧角色 sheet、clipboard 角色图、侧脸参考或第二张身份图。另附唯一 `apartment-door/mask-v1.webp`：白色是唯一允许编辑区，黑色及黑色以外的母图像素必须保持不变。只加入一个“apartment-door / outbound preparation”动作；不要重新生成、重绘、扩展、裁切或改造玄关。

严格保留 1536×1024 画布、固定三分之四斜俯视镜头、左侧唯一公寓外门、门框与门槛、衣架、风衣、投递小柜、中央关闭浴室门、右侧电梯格栅、地毯、楼梯栏杆、灯光、木墙和地面透视。角色完全放在白色动作区的 apartment door 内侧木地板，严格纯背面或最多极轻微背后三分之二，不显示脸，朝向门；一只手靠近门把手/门锁，另一只手调整或取下衣架上的深色外套，表现出门前准备；只生成一个角色。

角色必须沿用唯一纯背面参考的瘦削、疲惫、成人比例、乱黑发、后方红色发带、深蓝补丁毛衣、粗黑手绘线和旧纸板外轮廓。无真实脚、无鞋、无脚踝、无裸腿、无独立腿、无棕色大底座；身体下方只有一个小而平滑的圆弧/椭圆纸板底座，底座最低点是唯一 contactPoint，必须在地面可见且不能替换成腿脚。门可以保持关闭；不要展示门外街道、人物或连续外部空间。门扇、门槛和角色边界要保持可拆分，不要把角色永久烘焙进门。

保留暖黄玄关灯、冷蓝门窗光和手绘 2.5D 纸板舞台感。不要改变中央浴室门、电梯、地毯或楼梯栏杆，不要加入文字、UI、Logo、水印、额外人物或预烘焙大阴影。输出一张母图保真的编辑预览，供后续人工分层；不要声称这是最终 PNG 蒙版。
```

## 验收

- [ ] 左侧 apartment door 仍是唯一外门；门外没有街道或连续角色。
- [ ] 角色落在门内木地板，圆弧底座是唯一 contactPoint。
- [ ] 中央 bathroom-door、右侧 elevator 和地毯保持不变。
- [ ] 仅使用 `novelist-back-v1.webp` 一张严格纯背面角色身份参考；未混入旧角色 sheet、clipboard 图或侧脸参考。
- [ ] 预览仍是单动作 `apartment-door`，只配这一张 `mask-v1.webp`；母图未覆盖。
