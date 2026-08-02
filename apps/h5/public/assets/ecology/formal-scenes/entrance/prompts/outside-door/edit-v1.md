---
sceneId: entrance
actionId: outside-door
assetRole: web-gpt-edit-prompt
master: ../../entrance-scene-master-v1.webp
mask: ../../masks/outside-door/mask-v1.webp
canvas: 1536x1024
maskSemantics: black-preserve-white-action-edit-footprint
runtimeUse: false
approvedForRuntime: false
---

上传 Image 1 作为唯一 `entrance` 母图 edit target，上传 Image 2 作为同一圆底纸板小说家角色参考，并上传 `../../masks/outside-door/mask-v1.webp`。黑色区域必须逐像素保持不变，白色区域只允许本动作编辑。

只加入一个从玄关朝外门离场的三分之四背向姿态；角色仍在门内侧，方向指向 outside-door，门扇、门框和门槛负责不透明 transition。保留浴室门、电梯、地毯、栏杆、木地板、灯光和镜头；不得生成门外街道、连续外部画面、第二人物、文字、UI、水印或预烘焙大阴影。角色无脚、无鞋、无独立腿，只有一个小圆弧底座。输出一张 1536×1024 合成预览，不是最终 actor PNG。

## 坐标与验收

```yaml
maskBBoxInclusive: [300, 500, 860, 880]
maskBBoxNormalizedApprox: [[0.195, 0.488], [0.560, 0.859]]
poseId: outside-door
facing: three-quarter-away-toward-outside-door
occlusionClass: B-to-C at threshold
contactPoint: roundBase.lowest-point
floorPlane: floor:entrance:v1 (pending exact calibration)
qa:
  - one action and one mask only
  - character remains on the interior side until transition
  - threshold is occlusion, not a second floor or contactPoint
  - no street, feet, shoes or oversized base
```
