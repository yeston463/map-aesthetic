# 场景化审美决策指南 (Scenario-Based Aesthetic Decision Guides)

在实际前端地图工程中，审美问题往往表现为具体的图层冲突、尺度失调或界面遮挡。本目录提供了按典型业务场景组织的专题指南，为每个场景明确了观察依据、可能原因、编辑表面、调整优先级、推荐参数、保护边界及验收方法。

## 场景速查矩阵 (Scenario Matrix)

| 场景 | 核心矛盾 | 首要调整策略 | 参考文档 |
| --- | --- | --- | --- |
| **点位密集** | 大量业务圆点在远景重叠挤压，掩盖路网与告警 | 依分辨率阶梯缩放符号半径，增加高对比描边，按指标分级显隐 | [dense-points.md](dense-points.md) |
| **路线与道路混淆** | 业务折线与底图市政路网颜色相近、线宽接近，无法识别 | 构建 Casing（外描边）+ Core（核心线）双层结构，拉开色相差 | [route-road-confusion.md](route-road-confusion.md) |
| **专题面与地名竞争** | 分区统计多边形颜色过深或置于顶层，吞没底图地名 | 下沉多边形层级（矢量）或优化透明度（栅格），为缺失值赋予独立纹理 | [thematic-choropleth-vs-labels.md](thematic-choropleth-vs-labels.md) |
| **中文长标注遮挡** | 地名带括号备注和冗余后缀，横向叠压碰撞，文字粘连 | 依地面分辨率（MPP）分级展现，规则截短冗余括号，增加 1.5–2px 文字光晕 | [chinese-long-labels.md](chinese-long-labels.md) |
| **深色主题对比不足** | 暗夜模式死黑一片、丢失水陆边界，或顺序色带明度反转 | 垫实背景基底反差（dE2000 ≥ 5.0），反转连续色带明度坡度，柔化刺眼眩光 | [dark-mode-contrast.md](dark-mode-contrast.md) |
| **移动面板和弹窗遮挡** | 手机端底部抽屉吞没南部站点，弹窗气泡盖住被选中的标记 | 垫开垂直偏移量（`offset`），留足 `autoPanPadding`，注入底部安全预留高度 | [mobile-sheet-popup-occlusion.md](mobile-sheet-popup-occlusion.md) |

## 通用执行原则

1. **不可破坏数据语义**：任何审美调整不得擅自平移坐标、修改数值、合并指标或掩盖异常状态。
2. **区分编辑表面**：静态栅格底图无法单独给某条路改色；矢量样式可编辑底图；DOM 覆盖物负责交互层。
3. **闭环验证**：结合自动化测量工具（如 `verify_cases.mjs` 与 `measure_case_pixels.py`）提供可复现的量化与视觉证据。
