---
sceneId: entrance
actionId: coat-on
assetRole: web-gpt-edit-prompt
master: ../../entrance-scene-master-v1.webp
mask: ../../masks/coat-on/mask-v1.webp
canvas: 1536x1024
maskSemantics: black-preserve-white-action-edit-footprint
runtimeUse: false
approvedForRuntime: false
---

上传 Image 1 作为唯一 `entrance` 母图 edit target，上传 Image 2 作为同一圆底纸板小说家角色参考，并上传 `../../masks/coat-on/mask-v1.webp`。黑色区域必须逐像素保持不变，白色区域只允许本动作编辑。

只加入一个玄关内侧出门前整理风衣的站立姿态；保留外门、浴室门、电梯、地毯、栏杆、鞋柜、墙面、木地板、暖黄灯和冷蓝夜景。角色三分之四朝向门侧，保持无脚、无鞋、无独立腿和唯一小圆弧底座；门、风衣和挂钩仍是场景层，不嵌入角色。不得生成门外街道、第二人物、文字、UI、水印或大阴影。输出一张 1536×1024 合成预览，不是最终 actor PNG。

## 坐标与验收

```yaml
maskBBoxInclusive: [180, 500, 690, 820]
maskBBoxNormalizedApprox: [[0.117, 0.488], [0.449, 0.801]]
poseId: coat-on
facing: three-quarter-toward-outside-door
occlusionClass: A-to-B
contactPoint: roundBase.lowest-point
floorPlane: floor:entrance:v1 (pending exact calibration)
qa:
  - one action and one mask only
  - doors/elevator/coat remain scene layers
  - no outside street, feet, shoes or oversized base
  - contactPoint and bodyBounds measured before runtime approval
```
