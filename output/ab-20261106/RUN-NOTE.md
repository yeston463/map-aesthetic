# 对照实验记录（street-atlas 无 / 有 skill 指引）

- 实验目的：检验"**有 skill 指引 vs 无 skill 指引**"在同一初始数据、同一预算（≤2 个文件、
  ≤25 工具调用）、同一自动检查下，agent 产出的构图 / 视觉层次 / 标注是否不同。
- 页面：`demo/street-atlas`（虚构配送线路 + 12 站点 + 真实 OSM 路网底图）克隆到
  `.tmp/ab-pair/arm-{alpha,beta}` 作为两个互不可见的独立沙箱。
- 两个分支由**两个并列的 fresh subagent** 并行执行；提示词除"data skill 路径"那段
  （只在实验组里出现）外完全一致。
- 实验组的 skill 是从 `.tmp/releases/map-aesthetic-0.2.0.zip` 解出、
  在 `.tmp/agent-skill-load/map-aesthetic` 的独立包（未与仓库内 `skills/` 副本共享）。

## 第 1 轮（pair 1）——作废

- 控制组 `ses_e4f374293ffeUHG06kaxcU2nR5` **空响应，无文件改动**：作废。
- 实验组 `ses_e4f374290ffeIUh4pNu3hPYhEa` 交付了一个改动集，但其验证截图与 `verify.mjs`
  实际跑的是 `/demo/street-atlas/`（另一个 URL，即原始 demo），而且它自身的沙箱页
  因 **我 provisioning 出错**（`Set-Content -Encoding utf8` 把 `index.html` 变成
  mojibake，`#map` 容器消失）**根本没初始化** — 它当时把 checker 反馈的 attribution /
  controls-reachable 失败当作 "checker false positive"，但真正的根因是页面没装载。
- 结论：**这一轮是 provisioning 缺陷，不作为 skill 的效果或 agent 能力的证据**，
  不进入评分。

## 第 2 轮（pair 2）——有效

- 干净 provisioning：Python 字节级替换 vendor 链接 + 复制 Leaflet vendor 到每个 arm，
  发出 agent 前先检查 `#map`、`window.__streetAtlas`、attribution、zoom 全部存活。
- 两个分支都交付了 2 个文件的改动集，且都通过了各自 harness（5 视口全绿）。
- 外部计分（我，而非 agent）在两个 arm 的最终页面上运行同一个包内校验器：
  - `check_anti_patterns.py`：alpha `0 FAIL / 1 WARN (default-popup)`；beta `0 FAIL / 0 WARN`
  - `consistency.mjs --widths 1440,1024,768,390`：两个 arm **都** `0 FAIL / 0 WARN`，
    4 条依赖交互状态的规则在初态下 SKIP（与既有规则说明一致，不是 PASS）。
- arm 的改动集：
  - alpha：路线白 casing 7→8.5 / 红 core 3.5→4.6；站点标记 5.5→6.3、选中 8→9.5；
    **新增线路方向 chevron（≥150 m 间距）**；站点标注 700/12px 深色 + 更长偏移，
    路名降低 opacity 并加 `.06em` 字距。`verify.mjs` 被该 arm `适配` 以指向自己的 URL。
  - beta：站点标记半径 5.5→6px、描边 2→2.5px，选中 8→9px/3px；站点/路名加 8 方位
    文字晕；**选中站点标签变 `#792e23`**；`bindPopup` 加 `className: 'site-popup'`
    （tip 重配 to surface）；图例/开关重配到实际的 route/sites 色。
- 盲评对：对比 Meyer →`output/ab-20261106/compare-desktop.png` 与 `compare-mobile.png`，
  左右位置由 `node:crypto randomInt(0,2)` 决定，映射在 `output/ab-20261106/assignment.json`，
  **评分前不揭晓**。

## 什么结论可以写、什么不能

**可以写**：在同样的任务、预算、外部计分下，两个 agent 产出的改动集在**内容上**有可见的
差异（如 chevron、标注层级、popup class 是否被处理）。

**不能写**：这一次 pair 只有一个 rater（你自己）的一次评分，且没有维度 1–5 分；不能支持
"skill 让 map 变更好"或"skill 有效性"这样的普遍结论。要作为 `evaluation-status.md` 里那条
"还没有展现技能有效性"的证据，需要更多 pair、更多任务、并给出全维度评分。

## 结果（2026-11-06，第 2 轮）

- 用户评分方式：只有**整体偏好**，一个字都不能为三维 1–5 分推断，评价是“**还是差不多**”，
  即用户**没有选出偏好**。
- 揭晓左右（`assignment.json` 里的 `panel-P / panel-Q`）：
  - **左 = `panel-P` = `.tmp/ab-pair/arm-alpha`（对照 / 无 skill 指引）**：
    白 casing 8.5 / 红 core 4.6、方向 chevron、标注层级、路名弱化；
    `check_anti_patterns.py`：`0 FAIL / 1 WARN (default-popup)`。
  - **右 = `panel-Q` = `.tmp/ab-pair/arm-beta`（实验 / 有 skill 指引）**：
    半径 6 / 2.5px、选中 9/3px，8 方位文字晕、选中态标签深红、
    `bindPopup` 加 `className: 'site-popup'`（tip 重配 to surface）、图例色对齐；
    `check_anti_patterns.py`：`0 FAIL / 0 WARN`。
- 用户解读“两边其实差不多”，既是对小组差异的观察，也与外部计分一致
  （两个 arm 在轻改预算下都拿到了 `consistency.mjs` `0 FAIL / 0 WARN`，
  只在 `check_anti_patterns.py` 的 `default-popup` 一条 rule 上有一 WARN 的差距）。
- **这是“有 / 无 skill”一个 pair，一个 rater，无维度分，无流行统计**：仍然**不能**
  写进 `evaluation-status.md` 的那条“技能有效性仍未测量”的记录；它只是
  一次被诚实记录的对照结果，指出在轻改预算下两组的可见差距很小。


对比图（左右位置已随机、评分前不揭晓）：

- `output/ab-20261106/compare-desktop.png`
- `output/ab-20261106/compare-mobile.png`

请分别给左、右方案三维度 1–5 分并选偏好；收到评分后再揭晓左右对应哪个 arm。
