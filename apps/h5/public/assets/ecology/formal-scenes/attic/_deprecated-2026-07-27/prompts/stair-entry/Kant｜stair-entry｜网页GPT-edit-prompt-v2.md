---
asset_role: web-gpt-edit-prompt
room_id: attic
node_id: attic.stair-entry
target_master: ../masters/Kant｜attic-clean-master-v1.webp
mask: mask-v2.webp
canvas: 1774x887
mask_semantics: lower-ladder-climb-occupancy-only
author: Kant
status: preview-approved-awaiting-main-qa
---

# stair-entry｜网页 GPT edit prompt v2

请将 `Kant｜attic-clean-master-v1.webp` 作为唯一 edit target，并将同一动作的 `stair-entry/mask-v2.webp` 作为唯一蒙版。输出一张完整的 `1774×887` 横向 2:1 场景状态图，不输出拼图、对比图、分镜、文字卡或多视图。

白色蒙版只表示楼梯下半段的 `climbing-ladder` 角色占用区；黑色区域必须保持 clean master 像素级不变。这个动作的角色是从楼梯下方往上爬，头肩和双手在现有梯子下半段出现，身体被现有梯梁/踏板/开口边缘克制遮挡。不要把角色放到阁楼地板上方，也不要把楼下空间重构成新的房间。

角色身份只使用项目内 `novelist-back-v1.webp`（严格纯背面、无脸）；姿态只参考 B 图的攀爬受力与手部接触，不复制 B 的脸型、体型、服装或画风。角色保持瘦削疲惫成人比例、乱黑发、红色发带、深蓝补丁毛衣、粗黑手绘线、旧纸板外轮廓和小而薄的圆弧纸板底座。不要生成脚、鞋、脚踝、裸腿、圆脸、幼态化或超大棕色底盘。底座如果被现有梯级遮住，可以只露出小弧边，但不能被改造成平台或消失后补成别的形状。

严格保持母图已有的梯子、梯梁、踏板、梯口、楼下遮挡、墙体、地板、书架、箱柜、天窗、灯光、阴影和镜头。禁止移动、延长、缩短、复制或重新绘制梯子；禁止增加楼下房间、出口、深井、人物影子、文字、UI、logo、水印、宠物、第二个人物、写实风、霓虹色或鱼眼镜头。家具、墙、梯子、地板和阴影属于场景/前景层，角色只作为独立动作层语义出现。

验收：`floorPlane=attic-ladder-plane`；`safeZone=existing-lower-rung-and-occluded-ladder-zone`；`contactPoint=existing-lower-rung/side-rails`；`occlusion=existing-ladder-rails+rungs+opening-edge`；唯一白区在楼梯下半段；clean master 的非角色区域不漂移。

署名：Kant｜可见协作窗口
