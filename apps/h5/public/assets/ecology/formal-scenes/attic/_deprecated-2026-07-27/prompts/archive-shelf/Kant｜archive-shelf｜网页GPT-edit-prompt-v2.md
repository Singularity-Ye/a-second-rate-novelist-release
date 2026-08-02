---
asset_role: web-gpt-edit-prompt
room_id: attic
node_id: attic.archive-shelf
target_master: ../masters/Kant｜attic-clean-master-v1.webp
mask: mask-v2.webp
canvas: 1774x887
mask_semantics: rear-archive-shelf-and-short-approach
author: Kant
status: preview-approved-awaiting-main-qa
---

# archive-shelf｜网页 GPT edit prompt v2

请将 `Kant｜attic-clean-master-v1.webp` 作为唯一 edit target，并将同一动作的 `archive-shelf/mask-v2.webp` 作为唯一蒙版。输出一张完整的 `1774×887` 横向 2:1 场景状态图，不输出拼图、对比图、分镜、文字卡或多视图。

白色蒙版只覆盖后方归档书架外侧与从中央地板到书架的短接近区；黑色区域必须保持 clean master 像素级不变。只允许一个角色在白区内低坐/蹲坐翻阅一本无可读文字的空白书页，中央地板到书架外侧必须保持连续，不能让书堆、箱柜或低矮斜屋顶切断路径。

角色身份只使用项目内 `novelist-back-three-quarter-v1.webp`（需要视线时允许克制的三分之二背面/侧脸）；姿态只参考 B 图的坐姿和翻页受力，不复制 B 的脸型、体型、服装或画风。角色保持瘦削疲惫成人比例、乱黑发、红色发带、深蓝补丁毛衣、粗黑手绘线、旧纸板外轮廓和小而薄的圆弧纸板底座。禁止脚、鞋、脚踝、裸腿、圆脸、幼态化或超大棕色底盘。

严格保持 clean master 的天窗、斜屋顶、旧木地板、灯光、书架结构、箱柜、书堆、楼梯入口和阴影；不得把 archive-shelf 变成第二个房间，不得打开楼梯或改变楼下遮挡。书脊和纸页全部无可读文字、字母、标题或符号。禁止第二人物、宠物、人物影子、UI、logo、水印、写实风、霓虹色、鱼眼镜头和镜头变化。家具、墙、地板、梯子和阴影留在场景/前景层，角色只作为独立动作层语义出现。

验收：`floorPlane=attic-wood-floor`；`safeZone=continuous-center-floor-to-shelf-stop`；`contactPoint=blank-book+outer-shelf-edge`；`occlusion=archive-shelf-front-edge+low-boxes-only`；唯一白区只服务 archive-shelf；clean master 的非角色区域不漂移。

署名：Kant｜可见协作窗口
