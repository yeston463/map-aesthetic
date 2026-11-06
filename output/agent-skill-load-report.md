# 独立验证：map-aesthetic 0.2.0 是否作为 agent skill 装载并被执行

记录时间：2026-11-06。研究对象：`skills/map-aesthetic`（仓库提交 `7f1c71a`）打包的 `map-aesthetic-0.2.0.zip`。
验证分三层：**静态包完整性**、**脚本的独立运行**、**让一个 agent 装载它并实际执行一次任务**。

## 1. 包完整性（`scripts/verify_skill_package.py`）

最新一次打包 (`python scripts/package_skill.py`)，随后运行 `verbatim`：

- 文件：37 个 + MANIFEST.json
- SHA-256：`459a6ab4f1edebfc7940ab37e8e22be3962c6282bee9419d917e132025230ace`
- 11 项检查全部 PASS（archive CRC、文件集、逐文件 SHA-256/大小、frontmatter、本地链接、脚本文件、Python 语法、Node 语法、无秘密/绝对路径、无缓存）
- 产物：`output/package-verification.json`（已提交）

## 2. 解包后的独立运行（不依赖仓库 `skills/` 副本）

提取路径：`.tmp/agent-skill-load/map-aesthetic`（`.tmp/releases/map-aesthetic-0.2.0.zip` 的 `map-aesthetic/` 目录），
38 个文件，SKILL.md frontmatter `name: map-aesthetic` 可读。在该目录里运行 5 个脚本：

| 脚本 | 结果 |
| --- | --- |
| `check_anti_patterns.py demo/street-atlas` | `0 FAIL, 1 WARN default-popup`（确实发现该页的 default popup），`demo/three-directions` 上 `0 FAIL, 0 WARN` |
| `consistency.mjs <url> --widths 1440`（street-atlas 初态） | `0 FAIL, 0 WARN`（4 条依赖交互状态的规则 SKIP，结果在腿里明确说） |
| `consistency.mjs <url> --widths 390`（street-atlas-scene/scene-b 初态） | `0 FAIL, 2 WARN tap-target/body-size`（好；规则覆盖到的小字号与 44px 触达例外均如实报 WARN） |
| `solve_contrast.py --ground #f2f4f6 --color #78828d --target 4.5` | 返回 `#67717b` 4.516:1（方向与数值正确） |
| `validate_theme.py skills/map-aesthetic/assets/themes/cultural-atlas.json` | `PASS`，输出包含三条 UI 对比、CIEDE2000 可分性与 token 不变式 |
| `audit_claims.py`（从提取目录运行，而非仓库根） | **0/21 verifiable**：期望行为；声明所述的证据文件（`demo/…/report.json`、`output/rule-coverage.json` 等）不在 skill 包内，审计报告按“缺少证据文件”诚实失败而不是假装通过。 |

> 这一条是**包边界**的已知事实：`SKILL.md` 承诺的是脚本与规则，未承诺其所审计的仓库产物也在包内。仓内（`scripts/audit_claims.py`）验证是 `21/21 verifiable`，提取目录版是 `0/21` —— 与包边界一致，不是缺陷。

## 3. **Agent 实测**（把包交给一次新 subagent）

复现方式：

- 把一个“干净页面”的沙箱复制到 `.tmp/agent-skill-load/sandbox-subagent`（street-atlas 副本，未改动原仓库文件），使服务器可访问。
- 用**新的 subagent**，只给出 skill 的路径（`.tmp/agent-skill-load/map-aesthetic`），要求它**读 SKILL.md，按指引选一个可执行改进，在其上运行包内可执行校验，并输出证据与偏差说明**。发实给 subagent 的指令不包含仓库内 `skills/` 或 `scripts/` 路径，因此脚本运行都在**解包后的 package** 内。
- 结果（摘录）:
  - 打开的 参考资料：SKILL.md / cartographic-design / anti-patterns / interaction / interface-copy / adapters/leaflet / consistency-checks / visual-qa / transferable-principles / implementation-status / evaluation-status。
  - 变更集在沙箱副本里：popup 打开带 `className: 'delivery-popup'`、popup 首行加入 `编号 S01`、关闭按钮加 `aria-label/ title` 加中文、legend 颜色与 layer 实色对齐、`__demo` 观测面对 checker 的 SKIP 规则可用、`?site=` 深链让 popup-open 状态可被检查。
  - 运行的可执行校验：`check_anti_patterns.py`（0 FAIL / 0 WARN，原页 1 WARN default-popup 消除）、`consistency.mjs` 初态 26 规则 `0 FAIL / 0 WARN`，**popup 打开 (`?site=S01`) 状态 26 规则 0 FAIL / 0 WARN / 0 SKIP**（含此前 SKIP 的 `popup-covers-feature`），`capture.mjs` 5 个视口所有 `ok`，`solve_contrast.py / validate_theme.py` 因条件不触发而明确记录为 **not-run**。
  - 证据：沙箱 `output/playwright/{baseline,after}` 桌面 1440×900 与手机 390×844 的截图 + `report.json`，`output/consistency-{baseline,initial,popup-open}/consistency.json`，`output/EVIDENCE.md`。
  - 诚实的偏差说明（不试图在报告里“补级合规”）：浏览器可用性 port 重用 `/ /tmp/…` 跨脚本路径、`demo/three-directions` vendor 路径重链、以及一个被记录而未修改的残缺点（选中站点名仍可能在 popup 下方被盖住）。

独立复核（我用仓库会话重新跑了一次包内脚本）：

- `check_anti_patterns.py .tmp/agent-skill-load/sandbox-subagent` → `0 FAIL, 0 WARN`
- `consistency.mjs <沙箱 URL> --widths 1440` → `0 FAIL, 0 WARN`（列表里 annotation-overlap/annotation-outside/legend-correspondence 均 PASS，`popup-covers-feature` SKIP 与 EVIDENCE.md 说明一致）

## 结论与边界

- **可以装载并可以按其指引运行**：把 `map-aesthetic-0.2.0.zip` 解包交给一个有 shell/browser access 的 agent，它**读了 SKILL.md、选了任务、跑了打包脚本、出了证据**，而该证据 (26 规则 0 FAIL) 在独立复核中可复现。
- **仍然不是效果证据**：本次只是一次“包可装载 + 可执行校验在 agent 手里可用”记录，不是“这个 skill 改进了 agent 的产出”的因果验证。`skills/map-aesthetic/references/evaluation-status.md` 里需要的那类**方向性对比**仍需带对照（无 skill vs 有 skill）且**用户点评**的独立 pair 才能写进记录。本次**没有**被当成效果结果提交。

## 还差的什么

1. 把 `test:node`、`test:browser`、`case:verify`、`verify:rules`、`verify:package` 用**打包产物**（而非仓内副本）再跑一遍，会被记为第二层集成测试。
2. 找一个**无 skill 对照的 agent 运行**，同一任务、同一页面，对照产出 diff 与检查通过度，作为一道用户点评的 pair；目前还没有。
3. 把 `output/agent-skill-load-report.md` 之外，还没有把 `evaluation-status.md` 改名记录本次验证结果（还没写入，等用户决定是否把这项记入评价记录）。
