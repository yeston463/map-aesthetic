# 本地矢量样式案例：实际引擎为 MapLibre

本案例使用 **MapLibre GL JS 6.16.0**、本地 GeoJSON 和日夜样式 JSON。
目录名 `mapbox-style` 保留兼容已有链接；它不是 Mapbox GL JS 的运行验证，
没有验证 Mapbox Standard、Studio 发布或 Mapbox 云端矢量瓦片。

## 启动与验证

```sh
npm ci
npm run case:serve
```

打开 `/cases/mapbox-style/`。`npm run case:verify` 会启动自身的临时本地服务，
无需复用手动服务。首次安装依赖需要网络；案例渲染仅请求本地资源。

## 数据与样式

- [day.json](styles/day.json)、[night.json](styles/night.json) 由
  [生成脚本](../../scripts/make_case_styles.py) 读取主题预设生成。
- `data/` 包含可再分发的合成 GeoJSON，不是实际地理调查或瓦片服务数据。
- 中文标签使用宿主系统字体。跨系统字形、文字尺寸和截图可能不同；运行环境
  必须有可用中文字体，案例成功也不代表所有语言或 glyph 配置均经过验证。
- 分类填充和选中外环分开；原始业务属性与坐标由回归检查独立比较。

## 实际检查范围

[验证脚本](../../scripts/verify_cases.mjs) 使用浏览器地图点击，检查弹窗、
feature-state、日夜切换、八次串行样式替换、资源数量、原始属性及坐标、
路线相对道路和文字的顺序，以及图例色块与主题一致性。

这些检查不测量堆内存，也不证明没有任何监听器泄漏。一次点击只触发一个
弹窗的检查可以发现部分重复绑定。八次串行替换不等同于同时发起八个竞态请求。
`style.load` 用于恢复资源，截图就绪还要求地图资源完成加载和渲染稳定。

## Mapbox 接入示例

[mapbox-gl-variant.js](mapbox-gl-variant.js) 是**未接入真实 Mapbox SDK 的示例**。
它接受目标项目的 `sdk`、资源与凭证，Classic 模式还要求提供在真实日夜样式
中确认过的插入位置 `classicBefore`。不存在的图层 ID 会报错，不会默默追加到顶层。

```js
initMapboxMap({
  sdk: mapboxgl,
  container: 'map',
  accessToken: configuredToken,
  data: businessData,
  styleFamily: 'classic',
  classicBefore: verifiedInsertionIds,
});
```

`verifiedInsertionIds` 的结构为 `{ day: { zones, route }, night: { zones, route } }`，
各值来自实际样式中的图层 ID。不要直接套用其他底图的名称。

Node API-contract double 测试只检查示例的参数、早期主题请求和恢复顺序，
不能证明 Mapbox SDK 兼容。剩余步骤见 [REMAINING_STEPS.md](REMAINING_STEPS.md)。
