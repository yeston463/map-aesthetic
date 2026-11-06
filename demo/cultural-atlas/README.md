# 城市文化设施地图（验证案例）

`demo/cultural-atlas/` 是 map-aesthetic Skill 的第二个验证案例：在真实路网上展示六类文化
设施（博物馆 / 图书馆 / 剧院 / 美术馆 / 书店 / 非遗驿站），按类别上色、按年访问量决定符号
大小。它刻意选择**与配送场景不同**的任务，并刻意使用**不同的配色**，用来验证 Skill 的方法
可迁移，而不是把某张样张的“纸墨风”复制过来。

## 打开与复核

```bash
node cases/serve.mjs                 # 根目录起服务，默认 4174 端口
# 浏览器打开 http://127.0.0.1:4174/demo/cultural-atlas/
node demo/cultural-atlas/verify.mjs  # 5 视口交互 + 几何 + 标注避让 + 截图
```

底图为本地文件，预览不请求在线瓦片或模型 API。

## 数据来源与许可

- **底图（真实）**：`data/context.geojson`、`data/labels.geojson`、`data/basemap-provenance.json`
  复用 street-atlas 的真实 OSM 路网快照（江岸片区，ODbL-1.0）。右下角保留 OSM 署名。
- **设施（虚构）**：`data/facilities.geojson`、`data/facilities-provenance.json` 为合成示例——
  名称、年访问量、开放年份均为虚构，坐标散布在底图范围内但**未吸附真实地址**，不可用于导航。
  生成脚本 `build_facilities.py`（固定随机种子，可复现）。
- 配色另存为 Skill 主题 `skills/map-aesthetic/assets/themes/cultural-atlas.json`，已通过
  `scripts/validate_theme.py`（CIEDE2000 分离度含色盲模拟、UI 对比度、token 不变式）。

## 设计要点（对应 transferable-principles.md）

- 底图承载地理语境，但较配送样张更克制，让分类色突出（P1 / P3）。
- 地图占主体；移动端目录收成底部抽屉，默认收起（P2 / P6）。
- 六类分类色 + 按量分级；图例同时给出颜色键与“圈越大访问量越高”（P4，分类≠顺序）。
- 路名与设施名作为同一批文字做避让（P5）。
- 配色为冷色系，非 street-atlas 纸墨红——证明方法可迁移、风格不是迁移对象。

## 已知取舍（需用户判断）

1. 类别筛选只作用于地图；侧栏目录仍列全部设施、图例仍是完整颜色键。
2. 设施坐标为虚构散布，真实项目应吸附真实地址并校验 POI 对齐。
3. 自动检查全绿不等于审美达标；本案例未做盲评。
