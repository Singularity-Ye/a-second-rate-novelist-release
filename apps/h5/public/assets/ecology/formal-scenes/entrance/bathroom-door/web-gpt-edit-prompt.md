---
project: a-second-rate-novelist
sceneId: entrance
action: bathroom-door
master: "D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/entrance/entrance-scene-master-v1.webp"
mask: "D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/entrance/bathroom-door/mask-v1.webp"
canvas: 1536x1024
maskSemantics: "8-bit-style RGB PNG; white=editable action region, black=protected mother pixels"
status: draft-edit-prompt
---

# `entrance / bathroom-door`｜网页 GPT edit prompt

## 区域坐标与职责

- 原图：`D:\Yhx06\Documents\仙术工坊——项目集\a-second-rate-novelist\apps\h5\public\assets\ecology\formal-scenes\entrance\entrance-scene-master-v1.webp`
- 蒙版：`D:\Yhx06\Documents\仙术工坊——项目集\a-second-rate-novelist\apps\h5\public\assets\ecology\formal-scenes\entrance\bathroom-door\mask-v1.webp`
- 同画布：`1536×1024`。
- 白色动作区覆盖中央关闭浴室门、门框、门外木地板等待位；黑色区域保护 apartment door、电梯、地毯和楼梯。
- 参考多边形约为 `(345,85) → (955,80) → (1010,680) → (900,850) → (320,785)`；这是门外编辑区，不是浴室内部 hitbox。

## 可直接粘贴到网页 GPT

```text
请编辑我附上的《二流小说家》entrance 正式母图，并同时参考同一角色的圆底纸板人偶参考图和 bathroom-door/mask-v1.webp。只在蒙版白色区域内加入一个“bathroom-door / wait-outside”动作；蒙版黑色区域以及黑色区域外的所有母图像素必须保持不变。不要重新生成、重绘、扩展、裁切或打开浴室门。

严格保留 1536×1024 画布、固定三分之四斜俯视镜头、左侧 apartment door、中央深棕色关闭 bathroom-door、右侧电梯格栅、地毯、楼梯栏杆、灯光、墙面和地面透视。角色站在关闭浴室门外的安全地面，身体三分之四侧向门并与门板保持距离，双手抱臂或拿一张不可读便签，表现等待而不是窥视；只生成一个角色。

浴室门必须始终完整关闭：不要显示门缝内部、浴缸、马桶、淋浴、镜面、人体剪影、热气中的具体动作、窥视孔或任何浴室内部 camera/actor。角色必须无真实脚、无鞋、无独立腿、无棕色大底座；身体下方只有一个小而平滑的圆弧/椭圆纸板底座，底座最低点是唯一 contactPoint，落在门外木地板而不是门板或门槛缝。

保留暖黄玄关灯、手绘 2.5D 纸板舞台感和低饱和棕蓝色调。不要改变 apartment door、电梯、地毯、楼梯或墙面，不要加入文字、UI、Logo、水印、额外人物或预烘焙大阴影。输出一张母图保真的编辑预览，供后续人工分层；不要声称这是最终 PNG 蒙版。
```

## 验收

- [ ] bathroom-door 始终关闭，黑色保护区没有浴室内部内容。
- [ ] 角色在门外安全等待区，不贴门、不穿门、不产生内部 anchor。
- [ ] apartment door、电梯、地毯、楼梯和玄关母图透视保持不变。

