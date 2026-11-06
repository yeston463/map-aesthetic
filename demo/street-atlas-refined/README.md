# 街区配送图 · 构图细化版（与 street-atlas 平行对比）

在 `demo/street-atlas`（用户评价“还可以”的基准样张）之外另起的独立样张，不改基准文件。
两者使用**同一份数据快照**、同一地图范围和同一交互状态，用于纯粹的设计对比；本次
对比只作为一次设计评审，**不作为本 Skill 效果的因果实验**。

## 打开和复核

在项目根目录运行 `node cases/serve.mjs`，打开 <http://127.0.0.1:4174/demo/street-atlas-refined/>。
底图和 Leaflet 资源均为本地文件，预览不请求在线瓦片或模型 API。

- 自动检查：`node demo/street-atlas-refined/verify.mjs`
  （在 1440×900、1024×768、320/390/412 宽手机视口检查图层开关、站点弹窗、目录、
  标注和底部抽屉；截图和报告写入 `output/playwright/street-atlas-refined/`。）
- 一致性规则：`node skills/map-aesthetic/scripts/consistency.mjs
  http://127.0.0.1:4174/demo/street-atlas-refined/ --widths 1440,1024,768,390`
  当前 `0 FAIL 0 WARN`，说明脚本覆盖的规则没有发现问题，**不代表审美合格**。
- 对比图：`node demo/street-atlas-refined/compare.mjs && python compose.py`；
  输出写入 `output/street-atlas-study/compare-{desktop,mobile}.png`，左右位置由
  `node:crypto randomInt` 决定并单独记录在 `assignment-beta.json`，
  **该文件在用户评分前不揭晓**，对比图内只标注左/右，不显示版本身份。

## 相对基准样张的视觉改动

仍然是有“地图为主角”的 Leaflet 应用，改动集中在构图、视觉层次和标注三件事：

| 区块 | street-atlas（基准） | 本版 |
| --- | --- | --- |
| 页面外壳 | 顶栏 + 330 侧栏 + 悬浮标题/图例卡片 | 同尺寸外壳，但标题和图层开关合并为地图上方一条窄栏，图下另加一圈纸色边框（书页样式） |
| 页面层次 | 引言 + 站点目录，指标为 3 个大数字 | 引言下新增 `R-01` 线路卡（里程 3.2 km / 7 站 / 3 异常），目录标题改为“站点索引”，指标与异常状态分行 |
| 站点语义 | 站点全部为空心圆，异常为实心，线路上没有顺序 | 以 `R-01` 途经站编号显示为带描边的数字点（拉外圈白边、异常填色），非途经站点用小号空心｜实心点区分 |
| 图层信息 | 屏幕上只有示意线路/示意站点两项 | 新增图例面板：线路编号 + 米制距离 + 三类站点符号 |
| 标注策略 | 站名与路名统一避让，单方向放置 | 站名按优先级尝试 6 个方位，路名区分干道/支道字号，路上障碍物遮挡自动隐藏 |
| 弹窗 | 常规三段式（类型/标题/信息/备注） | 弹窗加入状态徽章、编号、业务量大数字，文案与配色与图例一致 |
| 移动端 | 底部抽屉 42dvh，可收起 | 同样的抽屉，但把手更明显，抽屉展开时**自动关闭弹窗**，保留地图可见区域 |

移动端抽屉与弹窗的行为遵循
`skills/map-aesthetic/references/scenarios/mobile-sheet-popup-occlusion.md` 的
“弹窗 + 抽屉永不遮住目标点”的原则；已在 320/390/412 宽手机视口实测，
没有出现弹窗或关闭按钮被抽屉裁切的情况。

## 数据来源与许可

背景地物来自 OpenStreetMap；站点、名称、业务量与路线均为**虚构**示例。
示例站点被吸附到道路节点，路线沿道路图生成，但**没有考虑单行线、禁行等限制，
不得用于导航或实际配送**。

- 底图数据 © [OpenStreetMap 贡献者](https://www.openstreetmap.org/copyright)，
  采用 [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)。地图右下角保留可点击署名。
- `data/` 与基准样张同源；`data/provenance.json` 记录范围、数据库时间与文件 SHA-256。
- Leaflet 库版本与许可在 `vendor/leaflet/LICENSE`。
