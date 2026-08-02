---
project: a-second-rate-novelist
sceneId: entrance
action: elevator
master: "D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/entrance/entrance-scene-master-v1.webp"
mask: "D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/entrance/elevator/mask-v1.webp"
canvas: 1536x1024
maskSemantics: "8-bit-style RGB PNG; white=editable action region, black=protected mother pixels"
status: draft-edit-prompt
---

# `entrance / elevator`｜网页 GPT edit prompt

## 区域坐标与职责

- 原图：`D:\Yhx06\Documents\仙术工坊——项目集\a-second-rate-novelist\apps\h5\public\assets\ecology\formal-scenes\entrance\entrance-scene-master-v1.webp`
- 蒙版：`D:\Yhx06\Documents\仙术工坊——项目集\a-second-rate-novelist\apps\h5\public\assets\ecology\formal-scenes\entrance\elevator\mask-v1.webp`
- 同画布：`1536×1024`。
- 白色动作区覆盖右侧电梯格栅、呼叫面板、前方落脚地面和栏杆内侧；黑色区域保护 apartment door、bathroom-door、中央地毯与左侧家具。
- 参考多边形约为 `(1010,70) → (1535,60) → (1535,785) → (1190,870) → (930,640)`；这是编辑区，不是最终电梯 hitbox。

## 可直接粘贴到网页 GPT

```text
请编辑我附上的《二流小说家》entrance 正式母图，并同时参考同一角色的圆底纸板人偶参考图和 elevator/mask-v1.webp。只在蒙版白色区域内加入一个“elevator / waiting”动作；蒙版黑色区域以及黑色区域外的所有母图像素必须保持不变。不要重新生成、重绘、扩展、裁切或改造玄关。

严格保留 1536×1024 画布、固定三分之四斜俯视镜头、左侧 apartment door、中央关闭 bathroom-door、右侧电梯格栅、呼叫面板、楼梯栏杆、地毯、灯光、墙面和地面透视。角色站在电梯前的安全木/砖地面，身体三分之四朝向电梯，手可以靠近呼叫面板但不要伸进格栅；表现等待电梯，不生成电梯内部或第二个角色。

角色必须无真实脚、无鞋、无独立腿、无棕色大底座；身体下方只有一个小而平滑的圆弧/椭圆纸板底座，底座最低点是唯一 contactPoint。角色不能站到栏杆外、楼梯边缘或地毯中央；保持与电梯门/栏杆可分离的前后关系。

保留暖黄玄关灯、手绘 2.5D 纸板舞台感和低饱和棕蓝色调。不要打开或延伸电梯内部，不要改变 apartment door、bathroom-door、地毯、楼梯或墙面，不要加入文字、UI、Logo、水印、额外人物或预烘焙大阴影。输出一张母图保真的编辑预览，供后续人工分层；不要声称这是最终 PNG 蒙版。
```

## 验收

- [ ] 角色站在电梯格栅前的安全地面，不能进入格栅内部或越过栏杆。
- [ ] apartment door、bathroom-door、地毯和楼梯保持黑色保护区原样。
- [ ] 圆弧底座最低点是唯一 contactPoint，无脚、鞋或大底座。

