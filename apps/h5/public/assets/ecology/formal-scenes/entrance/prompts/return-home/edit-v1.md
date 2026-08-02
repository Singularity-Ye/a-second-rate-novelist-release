---
sceneId: entrance
actionId: return-home
assetRole: web-gpt-edit-prompt
master: ../../entrance-scene-master-v1.webp
mask: ../../masks/return-home/mask-v1.webp
canvas: 1536x1024
maskSemantics: black-preserve-white-action-edit-footprint
runtimeUse: false
approvedForRuntime: false
---

上传 Image 1 作为唯一 `entrance` 母图 edit target，上传 Image 2 作为同一圆底纸板小说家角色参考，并上传 `../../masks/return-home/mask-v1.webp`。黑色区域必须逐像素保持不变，白色区域只允许本动作编辑。

只加入一个从外门回到室内的玄关站立/收步姿态；角色三分之四朝向 interior，停在门内木地板，外门、浴室门、电梯、地毯、栏杆、鞋柜、灯光和镜头完全保留。门外空间不可见，角色不穿门、不与门合成，不生成第二人物、文字、UI、水印或大阴影。角色无脚、无鞋、无独立腿，只有一个小圆弧底座。输出一张 1536×1024 合成预览，不是最终 actor PNG。

## 坐标与验收

```yaml
maskBBoxInclusive: [810, 470, 1360, 830]
maskBBoxNormalizedApprox: [[0.527, 0.459], [0.885, 0.811]]
poseId: return-home
facing: three-quarter-toward-interior
occlusionClass: A-to-B at door frame
contactPoint: roundBase.lowest-point
floorPlane: floor:entrance:v1 (pending exact calibration)
qa:
  - one action and one mask only
  - door frame remains a separable scene foreground
  - no exterior pixels, feet, shoes or oversized base
  - contactPoint and bodyBounds measured before runtime approval
```
