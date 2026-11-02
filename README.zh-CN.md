# Map Aesthetic

[English](README.md) · [详细项目设计](docs/project-design.zh-CN.md)

面向 AI 编程代理的 **Web 地图审美调整 skill**。围绕地图用途，协同调整底图、
业务图层、标注、图例、控件和弹窗，并在原项目中落实可验证的改动。

**当前状态：0.1.0 首版。** 已提供五类地图 SDK 的适配参考、统一主题契约、三款
主题和本地 Leaflet 演示。商用地图接入及生产性能尚未实测，覆盖状态见下表。

![真实浏览器截图：同一组合成数据的前后对照](docs/images/demo-desktop.png)

[夜间主题与选中状态](docs/images/demo-night.png) · [移动端布局](docs/images/demo-mobile.png)

## 项目解决什么问题

地图美化需要同时处理制图与界面：底图应提供方向感，业务数据应成为视觉主体；
远景、工作视图、近景需要不同密度；类别、数值、告警和选中状态需要清楚区分。

Skill 提供可重复执行的过程：

1. 识别 SDK、版本、底图来源、业务图层与现有设计体系。
2. 找出可观察的问题，例如道路过亮、面填色挡住地名、图例与图层颜色不一致。
3. 确定视觉方向，定义界面 token 与制图 token。
4. 根据真实能力映射到原 SDK，修改代码与配置。
5. 对比代表性尺度、选中和弹窗状态，以及桌面与移动布局。
6. 交付代码、配置、证据和能力限制。

只有截图时，交付诊断与实施规范。没有可用密钥时，完成可实施部分，列出所需
配置和控制台步骤。所有验证结论标明实际证据。

## 覆盖与验证状态

| 地图引擎 | 已提供的适配指导 | 当前运行验证 |
| --- | --- | --- |
| [Leaflet](skills/map-aesthetic/references/adapters/leaflet.md) | 栅格/矢量边界、点线面、pane、控件、生命周期 | 本地合成数据演示；详见[验证记录](docs/verification.md) |
| [ArcGIS JS SDK](skills/map-aesthetic/references/adapters/arcgis.md) | 图层类型、渲染器、标注、矢量底图、UI | 文档覆盖，待真实项目验证 |
| [Mapbox GL JS](skills/map-aesthetic/references/adapters/mapbox.md) | 经典样式、Standard 配置与 slots、样式重载 | 文档覆盖，待真实项目验证 |
| [高德](skills/map-aesthetic/references/adapters/amap.md) | 已发布样式、要素显隐、覆盖物、控件 | 文档覆盖，待真实 Key 验证 |
| [百度](skills/map-aesthetic/references/adapters/baidu.md) | 版本识别、个性化样式、覆盖物、兼容设置 | 文档覆盖，待真实 AK 验证 |

“适配器”在本项目中指按需读取的实施指南，项目没有提供跨 SDK 运行时包装器。
通用主题表达视觉意图，各 SDK 保留自身配置与能力边界。普通栅格瓦片中的路网
和文字已合成，不能通过通用 token 单独改色。

## 安装 skill

先克隆仓库：

```sh
git clone https://github.com/yeston463/map-aesthetic.git
cd map-aesthetic
```

只需复制 `skills/map-aesthetic` 文件夹。使用 skill 本身无需安装
演示项目的 npm 依赖，也无需地图服务账号。

Codex 用户级目录为 `~/.agents/skills/map-aesthetic`，项目级目录为
`<目标项目>/.agents/skills/map-aesthetic`。目录约定来自
[官方说明](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills)。

macOS / Linux，在本仓库中执行：

```sh
mkdir -p ~/.agents/skills
cp -R skills/map-aesthetic ~/.agents/skills/
```

Windows PowerShell，在本仓库中执行：

```powershell
$mapSkillDestination = Join-Path $env:USERPROFILE '.agents\skills'
New-Item -ItemType Directory -Force -Path $mapSkillDestination | Out-Null
Copy-Item -LiteralPath '.\skills\map-aesthetic' -Destination $mapSkillDestination -Recurse
```

已有同名 skill 时先检查差异，再更新。Codex 会自动发现 skill 变化；未显示时
重启。其他支持 Agent Skills 的工具可读取同一 `SKILL.md`，其自动发现机制尚未
在本项目验证。`agents/openai.yaml` 仅提供可选的 Codex UI 元数据。

## 调用示例

```text
使用 $map-aesthetic 调整这个高德物流地图。
保留当前 SDK、底图提供商、数据含义和业务交互。
降低底图干扰，突出运输路线与异常站点，统一图例、控件和弹窗。
检查远中近景、选中状态、桌面及移动端，并说明未验证的部分。
```

```text
使用 $map-aesthetic 审查这组地图截图。
指出底图与业务数据主次、标注密度、弹窗遮挡和图例问题。
提供可实施规范，区分截图能观察到的事实与需要代码才能确认的原因。
```

```text
使用 $map-aesthetic 给现有 Mapbox 地图加入日夜主题。
检查样式切换后业务图层、选中状态和事件绑定能否保持正确。
```

## 本地演示

需要 Node 22.12+、npm。首次安装依赖需要网络；演示运行时使用本地合成矢量
数据，不请求第三方底图、远程字体或地图服务，不需要 Key。

```sh
npm ci
npm run dev
```

打开 Vite 打印的本地地址。查看同源数据的前后对照，切换三款主题，选择站点，
缩放观察信息密度变化。演示中的局部坐标平面和地理要素均为虚构。

## 验证与开发

验证脚本需要 Python 3.10+；安装 skill 的日常使用不要求运行这些脚本。

```sh
python -m pip install -r requirements-dev.txt
python scripts/check_project.py
python -m unittest discover -s tests -v
npm run build
npx playwright install chromium
npm run test:browser
```

主题可单独验证：

```sh
python skills/map-aesthetic/scripts/validate_theme.py path/to/theme.json
```

验证覆盖 JSON 结构、三组界面文字对比度、描边宽度与尺度顺序等约束。
图层可读性、色带感知顺序、色觉差异、标注遮挡及引擎支持仍需单独验收。
查看[实际验证记录](docs/verification.md)与[行为评估场景](evals/cases.md)。

## 阅读顺序

- 使用者：[skill 主文件](skills/map-aesthetic/SKILL.md)、对应引擎参考。
- 设计者：[制图规则](skills/map-aesthetic/references/cartographic-design.md)、[主题契约](skills/map-aesthetic/references/theme-contract.md)。
- 项目维护者：[详细设计](docs/project-design.zh-CN.md)、[贡献指南](CONTRIBUTING.md)、[发布步骤](docs/releasing.md)。
- 验收者：[视觉 QA](skills/map-aesthetic/references/visual-qa.md)、[报告模板](skills/map-aesthetic/assets/templates/audit-report.md)。

## 许可证

项目原创文件采用 MIT。依赖保留各自许可证；地图厂商 SDK、地图数据、账号权限
和服务条款单独适用。见[第三方说明](THIRD_PARTY.md)。项目与所列地图厂商无隶属关系。
