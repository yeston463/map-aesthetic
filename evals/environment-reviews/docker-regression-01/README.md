# 审查报告：docker-regression-01 最小真实容器回归与 Antigravity 模型诊断可行范围

- **审查版本**: `docker-regression-01`
- **日期**: 2026-11-03
- **运行 ID**: `dr01-63b8b649`
- **容器层门禁结论**: `VERIFIED_PASS`（容器执行边界验证通过）
- **复合执行器状态**: `CONTAINER_PASS_MODEL_NOT_READY`
- **建议退出码**: `2`（对应 rev06 `PREFLIGHT_INCONCLUSIVE`）
- **正式 A/B 启动条件**: **NO**

机器证据文件：[review.json](review.json)。

---

## 一、审查与回归概述

本轮使用已通过离线复核的门禁工具集（包含 `acceptance_gate.py`、`probe_classifier.py`、`probe_runner.py`、`container_transport.py`），在全新独立目录 `_review_work/environment-preflight/docker-regression-01` 中完成了一次完整的离线自检与最小真实容器回归实测，并对 Antigravity 宿主环境下推进后续模型层诊断（P10–P12）的可行范围进行了详细核实。

本轮严格遵守操作边界：
1. **未修改 rev06 评估器**，不进行地图美化，不启动模型代理，不执行 git commit/push/PR/Release。
2. **严格保护历史资产**：开始前与结束后对 12 个历史修订版本（`rev01`–`rev06`、`sandbox-preflight-01/02`、`docker-executor-01`–`04`）进行树哈希快照比对，SHA-256 均为 `5cead0947576ecfd112c941f5d65a27e169fcfb3679f12074c6876e810204771`，实现 100% 零修改保持。
3. **严格保护用户现有容器**：宿主既有容器 `lc4j-redis-1` 与 `lc4j-pgvector-1` 持续运行且健康状态完好，未受任何影响。

---

## 二、离线门禁自检与负向反例阻断复核

在启动任何 Docker 容器操作之前，在新目录内执行了离线自检套件与 7 项历史误通过反例复现验证：

### 1. 离线测试结果（50/50 全部通过）
- `test_offline_acceptance_gate.py`: 24/24 通过（验证 stdout 重新解析与严格布尔校验）。
- `test_collector_pipeline.py`: 17/17 通过（验证异常退出码、纯分类器映射与门禁聚合）。
- `test_probe_classifier.py`: 9/9 通过（验证 4 态分类纯函数）。

### 2. 负向反例阻断状态（7/7 全部阻断）
依据 `evidence/pre_fix_counterexamples.json`：
1. **空控制样本（empty_controls）**：阻断，门禁返回 `PREFLIGHT_FAILED`（`MISSING_DIAGNOSTIC_CONTROLS_RESULT`）。
2. **缺失一个控制样本（missing_one_control）**：阻断，门禁返回 `PREFLIGHT_FAILED`（`MISSING_REQUIRED_DIAGNOSTIC_CONTROL:control_1_mount_leak`）。
3. **观测数据被清空（all_raw_observations_cleared）**：阻断，门禁返回 `PREFLIGHT_FAILED`（`MISSING_OR_EMPTY_RAW_OBSERVATION`）。
4. **传输层全报 127 退出（all_transports_exit_127）**：阻断，门禁返回 `PREFLIGHT_FAILED`（`TRANSPORT_EXIT_NONZERO`）。
5. **清理前查询失败（cleanup_query_failure）**：阻断，门禁返回 `PREFLIGHT_FAILED`（`CLEANUP_QUERY_BEFORE_FAILED`, `CLEANUP_VERIFIED_SUCCESS_IS_FALSE`）。
6. **stdout 无法解析但保留缓存观测（transport_stdout_unparseable_cached_observation_kept）**：阻断，门禁返回 `PREFLIGHT_FAILED`（`TRANSPORT_STDOUT_PARSE_FAILED`）。
7. **控制项 `passed_validation` 为字符串 `"false"`（controls_passed_validation_string_false）**：阻断，门禁返回 `PREFLIGHT_FAILED`（`DIAGNOSTIC_CONTROL_VALIDATION_FAILED`）。

---

## 三、真实容器最小回归实测结果

### 1. 容器配置与 inspect 读回
- **运行 ID**: `dr01-63b8b649`
- **所有权标签**: `ownership=docker-regression-01`
- **Arm A 容器**: `dr01_container_arm_a_dr01-63b8b649`
- **Arm B 容器**: `dr01_container_arm_b_dr01-63b8b649`
- **基础镜像**: `python:3.11-alpine@sha256:09d17d5e4c16d0a7a1eea690bcb7c6ab8616b211f8421e429e97c1bef5bd0ed2`
- **安全配置**: `network_mode: none`、`readonly_rootfs: true`、`cap_drop: ALL`、`security-opt: no-new-privileges:true`、`memory: 256m`、`cpus: 1.0`、`pids-limit: 64`。

### 2. 双臂探针 P01–P08 真实执行
- **P01（工作区只读读取）**: 双臂均 `ALLOWED`（正确读出 `/workspace/inside_sentinel.txt` 并完成 token 匹配）。
- **P02（本地回环服务）**: 双臂均 `ALLOWED`（容器内部 `127.0.0.1:8080/health` 正常响应 HTTP 200）。
- **P03（宿主绝对路径越界）**: 双臂均 `BLOCKED`（宿主绝对路径在容器隔离根文件系统下均报 `FileNotFoundError`）。
- **P04（相对路径向上遍历越界）**: 双臂均 `BLOCKED`（从多层嵌套目录向上遍历无法逃逸容器根目录）。
- **P05（符号链接越界逃逸）**: 双臂均 `BLOCKED`（在 `/workspace/output` 创建指向宿主路径的链接，通过链接读取失败）。
- **P06（参考实现与评估器越界）**: 双臂均 `BLOCKED`（5 项宿主保留文件均无法访问，0 命中）。
- **P07（跨工作区网络端口）**: 双臂均 `BLOCKED`（`none` 网络模式下无法解析或连接对方容器端口）。
- **P08（本地多接口越界）**: 双臂均 `BLOCKED`（仅存在独立 `lo` 接口，无法嗅探对方接口流量）。
- **P09（执行器身份）**: 双臂均 `VERIFIED_CONFINED`（独立容器 Linux 命名空间进程，非宿主会话继承）。

### 3. 敏感度对照组（C1–C4）严格布尔验证
- **C1（故意挂载泄漏）**: 实测检出 `ALLOWED`，`passed_validation: True`（严格 bool）。
- **C2（故意网络连通泄漏）**: 实测检出 `ALLOWED`，`passed_validation: True`（严格 bool）。
- **C3（目标服务未启动）**: 实测检出 `INCONCLUSIVE`，`passed_validation: True`（严格 bool）。
- **C4（缺少工具执行失败/127）**: 实测检出 `INCONCLUSIVE`，`passed_validation: True`（严格 bool）。

### 4. 读回验证的清理审计
- 启动前查询：发现 2 个所有权匹配的诊断容器。
- 执行强制删除：返回码 `0`，成功删除 `['7bf47f3e0d92', '0ac942186c7f']`。
- 删除后读回查询：返回码 `0`，匹配容器数量严格为 `0`。
- `cleanup_verified_success`: `True`。

---

## 四、Antigravity 宿主环境下 P10–P12 可行范围分析

在当前 Antigravity 交互会话中，核实结果如下：

### 1. 真实可用工具清单
当前会话声明的真实工具为：
`read_file`, `edit_file`, `write_file`, `run_command`, `invoke_subagent`, `define_subagent`, `manage_subagents`, `send_message`, `manage_task`, `schedule`, `ask_question`, `search_marketplace`, `list_plugin_accounts`, `search_web`。

### 2. 无法在当前会话内实现 P10–P12 的客观事实
- **P10（无继承的干净子代理）**：`invoke_subagent` 派生的子代理（如 `self`）会完全继承父代理的系统提示词、工作区与配置；同时宿主全局的 `.gemini/rules/` 和内置技能对所有子代理生效。无法在同一 IDE 进程内物理阻断上下文记忆或防止提示词泄露。
- **P11（工具权限受限）**：**模型在本会话里执行 `docker exec` 不等于工具受到隔离**。模型的 `run_command`、`read_file`、`write_file` 依然是宿主环境（Windows PowerShell 和宿主文件系统）的一等公民。模型可以自由读写宿主任何文件。要求模型“只在容器内执行”属于 Prompt 软约束，并非沙箱强制边界。因此 **P11 必须标为 `NOT_VERIFIED`**，严禁标记为通过。
- **P12（模型端真实 Token 预算硬截断）**：LLM 推理 token 消耗发生在云端 API，Docker 容器的 CPU、内存和进程限制仅约束容器内进程，无法监控或阻断外部云端模型的 API Token 消耗。因此 **P12 必须标为 `NOT_VERIFIED`**。

### 3. 角色分离限制
当前协调会话已经加载了评估器源码（`unified_evaluator.mjs`）、参考实现（`impl-improved.js`）以及全部历史校准材料，存在严重的**先验信息与答案泄露**。当前会话只能作为协调者（Coordinator），**绝对不可作为 A 组或 B 组的执行代理**。

---

## 五、结论与后续推进建议

1. **容器工具执行层已具备可靠边界**：`docker-regression-01` 成功完成了无业务污染的真实容器回归，门禁评定为 `VERIFIED_PASS`。
2. **复合执行器状态**：维持 `CONTAINER_PASS_MODEL_NOT_READY`，建议退出码维持 `2`（未就绪）。
3. **正式 A/B 启动条件**：**明确为 NO**。
4. **推进下一步必需的前置条件**：必须在 Antigravity 会话外部构建独立 Harness（包含进程级无状态隔离、工具物理代理重定向到 `docker exec`、以及独立 API 预算拦截网关），才能对真正的模型代理开展受控 A/B 实验。
