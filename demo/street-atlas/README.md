# 街区配送图：真实路网视觉样张

这份样张用于研究地图构图、道路层次和注记。背景地物来自 OpenStreetMap，站点、名称、业务量与路线均为虚构示例。示例站点被吸附到道路节点，路线沿道路图生成，但**没有考虑单行线、禁行等限制，不得用于导航或实际配送**。

## 打开和复核

在项目根目录运行 `node cases/serve.mjs`，打开 <http://127.0.0.1:4174/demo/street-atlas/>。项目的 4174 端口已运行服务时可直接打开。底图和 Leaflet 资源均为本地文件，预览不请求在线瓦片或模型 API。

服务器运行后，执行 `node demo/street-atlas/verify.mjs`。脚本在桌面、平板及 320、390、412 像素手机宽度检查站点 S01、弹窗、目录、标注和图层开关；截图和报告写入 `output/playwright/street-atlas/`。覆盖范围限于测试的站点、视口和状态，不构成完整可访问性或导航验证。

## 数据来源与许可

底图数据 © [OpenStreetMap 贡献者](https://www.openstreetmap.org/copyright)，采用 [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)。地图右下角保留可点击署名。`data/osm-overpass.json` 和 `data/osm-surroundings.json` 是公开数据查询响应的本地快照；`data/provenance.json` 记录范围、数据库时间与文件 SHA-256。`context.geojson` 是基于这两份快照转换的地物，`sites.geojson` 与 `route.geojson` 是虚构演示数据。

两次查询均使用 Overpass API 的 `out tags geom`：核心范围南/西/北/东为 `31.216,121.425,31.238,121.452`，包含道路、建筑、开放空间和水域；周边范围为 `31.205,121.405,31.248,121.470`，包含道路、开放空间和水域。查询只选取示例周边需要的要素，并不代表完整地图。

如需从已保存的快照重新生成演示数据，在安装 Python 和 `networkx` 后运行 `python -B demo/street-atlas/build_sample.py`。这会重建本目录 `data` 下的派生文件，不修改原演示或历史实验。
