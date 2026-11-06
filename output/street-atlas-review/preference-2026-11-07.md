# 三方案设计评审记录（street-atlas review，2026-11-07）

- 评审对象：基准 `demo/street-atlas`、方案一 `demo/street-atlas-plate`（满幅画板）、
  方案二 `demo/street-atlas-split`（左右分栏）。同一份数据快照、同一地图范围与缩放
  （桌面 1440×900 / z16.25，手机 390×844 / z15）、同一交互态（无弹窗、图层开、面板收起）。
- 三联图：`output/street-atlas-review/compare-{desktop,mobile}.png`，
  截图 manifest 在 `capture-manifest.json`。
- 用户的回答（无评分）：**“基准”** —— 偏好保持现有基准构图；两个新方案未被选中。
- 这是一次**设计方案评审**，不是 skill 效果实验；两条新方案保留在仓库中作为探索记录，
  基准 `demo/street-atlas` 自始至终未被修改。
- 外部检查基线：两版新方案 verify.mjs 5 视口全绿、consistency.mjs 0 FAIL
  （仅地图小字号路名的 body-size WARN，与基准相同）。
- 后续：未选中的方案不再继续打磨，作为反例素材保留（供 transferable-principles 引用）；
  若用户日后要重启此方向，从 `demo/street-atlas-plate` / `demo/street-atlas-split` 继续。
