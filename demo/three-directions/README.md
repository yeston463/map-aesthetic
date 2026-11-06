# 三套视觉方向样图 — 可交互本地演示

同一个案例、同一份数据、同一段交互代码、**同一份矢量底图**，三套明显不同的地图气质。
**这是设计探索，不是新的 A/B 实验**：没有模型参与，没有调用任何付费 API，也没有改动任何既有实验。

## 启动

```bash
cd C:\Users\赵航\Desktop\map_skill
node cases/serve.mjs
```

然后打开 <http://127.0.0.1:4174/demo/three-directions/>。

- 顶栏的三个按钮切换方向；也可以直接用 `?style=warm-city-guide` 打开指定方向。
- `?style=…&site=S01` 会在加载时选中一个站点并打开弹窗，供自动校验器检查弹窗几何
  （否则 `popup-covers-feature` 规则在初始页面永远是 SKIP）。
- 端口用 `CASE_PORT=5000 node cases/serve.mjs` 改。
- 演示不需要构建步骤、不联网、不需要任何密钥；`vendor/leaflet` 与 `data/`、`tiles/` 都在本目录内。
- 顶栏「栅格对照」开关可以叠回原始栅格瓦片，用来和矢量底图对照。

## 生成样图

```bash
cd demo/three-directions
node capture.mjs     # 浏览器里跑六个状态，测量几何并截图
node compare.mjs     # 把三套拼成并排对比图
python build_sources.py --check   # 独立复验数据源摘要与副本一致性
```

产物在 `shots/`：六张单方向原图、两张并排对比图，以及 `capture_report.json`（几何测量与一致性
校验）。

仓库根目录另有回归门禁：`npm run verify:rules`（35 条规则的正反例夹具）、
`npm run verify:demo`（三套方向 × 四宽度 × 开/关弹窗的浏览器校验）、
`npm run test:node`（全部 Node 测试），以及
`python scripts/measure_demo_themes.py`（用 skill 自带校验器实测三套调色板的 CIEDE2000
分离度、色盲模拟与文字对比度，结果写 `output/theme-measurements.json`）。
**演示与 skill 文档并不逐条等价**：哪些规范已实现、哪些只是目标、哪些是文档缺陷，
逐项记在 `skills/map-aesthetic/references/implementation-status.md`，可用
`python skills/map-aesthetic/scripts/audit_claims.py` 复核。

## 目录

```
index.html              外壳：方向切换器、地图、悬浮 HUD、侧栏、移动端抽屉、状态栏
app.js                  应用层：图层只建一次，切换方向只重绘，不重建地图
vector-basemap.js       矢量底图：街区/水系/道路三层，各有独立 pane 与配色
annotations.js          注记引擎：类别分层、优先级、避让、边界感知、同义合并
hud.js                  悬浮图例与指北针：分组图例、三套罗盘、弹窗让位
ui.css                  外壳样式；三套方向的版式差异写在这里
styles/
  light-operations.js   浅色运营
  warm-city-guide.js    暖色城市导览
  dark-monitoring.js    深色监控
data/                   案例数据，与 cases/leaflet-raster/data/ 逐字节一致
tiles/                  案例栅格瓦片（仅作对照），与 cases/leaflet-raster/tiles/ 逐字节一致
vendor/leaflet/         Leaflet 1.9.4
sources.json            数据源清单：每个输入文件的 SHA-256、CRS、权利声明
build_sources.py        清单重建与复验（--check 只用标准库）
capture.mjs / compare.mjs  检查与出图脚本
shots/                  生成的样图与报告
```

## 数据与语义

- 三套使用**同一份**业务数据与**同一个**地理范围：12 个站点、6 个片区（其中 2 个无值）、
  1 条配送线、24 个地名标注。
- 分类阈值固定为 `[400, 800, 1200]`，三套不变；分级含义、站点类型、异常状态、底图署名都保留。
- 六个状态的渲染结果摘要一致（`sameRenderedData: true`），矢量底图几何摘要一致
  （`sameBasemapGeometry: true`），底图配色则三套各不相同（`eachDirectionHasItsOwnBasemap: true`）：
  三套改的只是表现，不是数据，也不是位置。
- 注记专项：`annotationsNeverOverlap: true`（无两条注记重叠）、
  `annotationsStayInsideMap: true`（无注记出画布）。桌面三套零丢弃。

## 底图：矢量，不是栅格

底图由 `vector-basemap.js` 用**案例自己的矢量几何**绘制：道路、水系、街区来自
`data/context.geojson`，地名来自 `data/labels.geojson`。原始栅格瓦片也保留着，但只作对照。

为什么不用栅格当底图：栅格把道路字形、地名和街区全部烘焙进像素，按要素改色做不到。矢量底图
让三套方向可以各自设计底图层次、道路层级与注记策略——深色方向的路网因此可以**亮于**地面，
而不必靠整幅反相近似。

栅格对照时，请注意署名仍然显示："合成栅格底图（本地生成，非真实地点）"。

## 数据来源与权利

`sources.json` 记录了每个输入文件的 SHA-256、坐标系与权利声明。**全部为合成数据**，由仓库
`scripts/make_case_data.py` 以固定种子生成，不表示任何真实地点或第三方数据集；本演示不调用任何
在线底图服务，因此不存在需要单独署名的第三方底图。

`python build_sources.py --check` 只用标准库复验：摘要一致、副本与案例逐字节相同、要素数不变。

## 注记体系

`annotations.js` 是统一的注记引擎：所有注记（片区名、河名、街巷名、站点名）进入同一个有序集合，
按类别定优先级（片区 > 水系 > 街巷 > 站点），统一做避让、边界处理与同义合并。

引擎做的五件事：

1. **统一排序**——地名与站点名不再分属两层各跑各的避让。
2. **同义合并**——数据里 6 组"地名 = 站点名"（纺织新村 ↔ 纺织新村驿站等，相距 0–37 m）被认作
   同一个地方，只标一次。
3. **标记避让**——注记不压在站点圆点上；障碍按视觉圆算，不是 DOM 盒。
4. **边界感知**——靠近画布边缘自动换锚点；四个方向都试过仍放不下才丢弃。
5. **锚点备选**——被站点挡住时依次尝试其他锚点，而不是直接消失。

三套方向的注记策略**真的不同**：浅色运营只标 9 条（桌面）、暖色导览 18 条且站点名是带边框的
药丸标签、深色监控 14 条且站点名后直接跟业务量数字（「江淮大道 1520」）。

## 借用的三个开源项目做法

- **`yeston463/webgis-history`**（MIT）：底图拆成可分别设置 paint 属性的图层（`js/basemap.js`）；
  通用图层面板提供图层显隐与语义芯片图例（`js/layerpanel.js`）。本演示的底图分层与面板「图层」区
  借鉴了这一做法，11 个图层可逐个开关，注记按**类别**开关（因为注记是一个有序集合，按类别关才
  不会破坏优先级）。
- **`hyc1005/mythmap`**（MIT）：自持矢量底图 + `data/build_geography_basemap.py` 与
  `.sources.json` 记录输入摘要、CRS、权利声明与处理方式，`--check` 可独立复验。本演示的
  `sources.json` 与 `build_sources.py` 借鉴了这一机制。
- **`Young-518/Zou-Migration`**（MIT）：`public/js/app.js` 用 SVG `paint-order="stroke"` 让描边在
  填充之下、墨字锐利；先祖名签做成小药丸标签；链上节点用编号徽章。本演示的注记光晕与**暖色导览
  的药丸标签**借鉴了这两处。

三个项目都只作结构与机制的参考，未复制其代码或数据。

## 移动端

抽屉（站点面板）可折叠；选中站点后弹窗由应用自己做面板避让平移，不依赖 Leaflet 的自动平移。
六个状态实测：

| 检查 | 结果 |
| --- | --- |
| 弹窗外框在画布内 | 6/6 |
| 关闭按钮在画布内 | 6/6 |
| 选中站点在画布内 | 6/6 |
| 与抽屉重叠面积 | 6/6 为 0 |
| 尖角与站点中心偏差 | 最大 0.5 px |
| 控制台错误 | 0 |
