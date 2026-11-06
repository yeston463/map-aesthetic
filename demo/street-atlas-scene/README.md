# 街区运营场景（多线路 / 片区 / 时段 / zoom 分段）

在真实路网上叠加的虚构运营示例，用于检验“复杂场景”下地图的构图、层次与标注。
数据、地图范围与缩放在两个排版方案 (`scene-a` / `scene-b`) 里完全一致，只做视觉对比，
**不作为 Skill 效果的因果实验**。

## 复杂度来源（全部覆盖）

| 来源 | 实现 |
| --- | --- |
| 多层级图层 | 片区（填充 + 描边，分离图层）+ 3 条线路（casing + core）+ 站点/编号 + 路名 + 图例 |
| zoom 分段 | `detail`/`mid`/`overview` 三档；最近一档隐藏路名与片区名，站点与线路状态可见 |
| 多面板联动 | 左/右侧栏 + 地图控制栏 + 图例 + 底部抽屉；线路/片区/站点三类开关和选择互相关联 |
| 时段切换 | 早班 / 午班 / 晚班；影响活跃线路、站点集合、站点状态、告警数和站点业务量 |

## 打开和复核

- `node cases/serve.mjs`，然后打开
  - <http://127.0.0.1:4174/demo/street-atlas-scene/scene-a/>
  - <http://127.0.0.1:4174/demo/street-atlas-scene/scene-b/>
- 自动检查：`node demo/street-atlas-scene/verify.mjs`
  （桌面 1440×900 与手机 390×844，两个方案各跑一遍，检查图层开关、时段切换、
  站点弹窗、标注、底部抽屉；报告写入 `output/playwright/street-atlas-scene/`。）
- 一致性规则：`node skills/map-aesthetic/scripts/consistency.mjs
  http://127.0.0.1:4174/demo/street-atlas-scene/scene-a/ --widths 1440,768`
  当前 `0 FAIL`；仅地图上的小字号路名仍告警（规则覆盖到的部分通过）。
- 对比图：`node demo/street-atlas-scene/compare.mjs && python demo/street-atlas-scene/compose.py`
  输出至 `output/street-atlas-scene/compare-{desktop,mobile}.png`，左右由
  `node:crypto randomInt` 随机分配，`assignment-scene.json` 在用户评分前不揭晓。

## 两个方案

- `scene-a`：左侧栏索引 + 地图上方的标题/图层栏 + 左下角图例；浅色纸面，片区填充较淡，路线/片区/站点三个开关独立。
- `scene-b`：右侧详情栏（时段切换放进顶栏胶囊）+ 地图上的浮窗控制组 + 左下角图例；片区填充更重，路线线更细。

两者使用同一份 `data/` 与 Leaflet 库版本，同一地图范围和同一初始状态；
通过 `verify.mjs` 保证初始加载和图层开关在两个方案里数据层是一致的。
页面上的文字、品牌签名、以及菜单结构刻意保持一致，只改构图和视觉语言，避免把
“颜色不同”误读为“方案不同”。

## 数据来源与许可

底图数据 © OpenStreetMap 贡献者（ODbL 1.0），地图右下角保留可点击署名。
- `data/zones.geojson` 的**多边形轮廓是真实路网节点做凸包**产生的（真实几何），
  但**名称、角色、业务量都是虚构**出来说明性标注。
- `data/routes.geojson` 的**路径线上是真实路网的 shortest path**，
  但**线路、站序、告警和业务量都是虚构**的；不得用于导航。
- `data/slots.json` 的早/午/晚班是**虚构**时段表，仅用于触发状态变化。
- 底图 / Leaflet / license 同 `demo/street-atlas/`。
