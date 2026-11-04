# harness-01 离线修复复核：旧反例已阻断，重试预算与真实执行证据仍需修正

日期：2026-11-03。原 harness-01 被交付方就地更新，本记录追加独立复核，不覆盖前次审查。
本次仅离线测试和 127.0.0.1 假 HTTP 服务，使用合成凭据和合成 IO；未调用外部模型、
未操作 Docker、未启动正式 A/B，原材料未修改，未提交或推送。

## 已独立确认的修复

- 当前 **27/27 测试通过**，其中真实 HTTP 适配器由本机假服务验证，已不是固定错误存根。
  这不等于已验证真实供应商兼容性或执行过真实模型诊断。
- 前轮极小缺证据反例现在 PREFLIGHT_FAILED / exit 1，真实诊断 NOT_RUN。
- 实际容器运行器函数在 Linux 路径语义与合成 IO 下，可正确读取
  `/workspace/inside_sentinel.txt`，不再重复拼接工作区。
- 配置工具超时 1 秒，SpyTransport 实际收到 1.0 秒。
- 同名证据第二次写入抛 FileExistsError，防覆盖有效。
- 十三个历史目录树摘要与 before 快照相符；仅支持两次快照间未改变。

机器证据：[review.json](review.json)，包含复核代码 SHA-256。

## P1：真实 HTTP 重试绕过请求计数和总 deadline

使用实际 RealModelAdapter 和实际 run_arm_diagnostic，启动本机假服务，前两次返回 503，
第三次返回正常响应。合成模型与凭据不连接外部供应商，工具使用 MockContainerTransport。
登记预算：max_model_requests=1、max_total_time_seconds=1。

实际服务收到 **3 次 HTTP 请求**，相对开始时刻约为 **0.019、0.521、1.522 秒**。
第三次在总 deadline 之后才开始。最终 budget_audit 却是：

```
requests_dispatched = 1
retries_count = 0
elapsed_seconds = 1.523
is_terminated = false
response_finish_reason = stop
```

原因：控制器只在外层 invoke 前计数一次，适配器内部重试自行发 HTTP 和 sleep，
没有重新获取派发许可、预留请求额度或计算剩余 deadline。retries_attempted 虽出现在
响应中，没有进入实际预算审计；每次请求继续使用最初传入的 timeout。

修复应让每个物理 HTTP attempt 在派发前获得控制器授权，退避等待也受剩余时间约束。
若要区分逻辑调用与物理尝试，应分别计数并冻结对应上限，不得把物理重试遗漏为零。
达到上限或 deadline 后不得再发请求，保留已消耗及未知 usage 的实际状态。
原有 Token 事后统计的准确措辞继续保留，不将其写成费用硬截断。

## P1：真实执行状态仍使用不严格的自报标志

使用当前完整、可通过的离线存档作为基准，将 real_model_execution_records 设置为：

```
{"executed": "false", "passed": "false", "reason": "synthetic flags only"}
```

metadata 同时使用合成 configured=true。没有进行真实模型请求。
真实 AcceptanceController 返回真实诊断 **VERIFIED_PASS，recommended_exit_code=0**。

代码仍用 bool(record.get(...)) 读取这些标志，非空字符串被当成 true；且没有验证
实际 request/response/usage/tool 事件引用。这是执行状态入口的问题，不是本轮真正执行过
外部模型；formal_ab_ready 仍被固定为 false，未声称已启动正式实验。

修复应严格校验类型，并根据存在且匹配本轮的请求、回复、工具与预算事件推导真实诊断
完成/通过；配置状态和标志不能代替证据。增加字符串 false/true、整数、null、缺字段、
标志为真但无请求、失败回复却标通过等独立反例，保留完整有效证据的通过正对照。

## 当前范围与下一步

真实适配器路径、路径解析、超时下发、防覆盖等修复均应保留；下一轮只收敛上述两项。
先以本机假 HTTP 服务验证真实适配器与真实控制循环的组合，不需要真实 API 密钥。
预算测试不能只分别测 BudgetController 和适配器的内部重试。

主运行器目前仍无论 mode 都构造 FakeModelAdapter 与 MockContainerTransport；
真实 API 诊断继续 NOT_RUN。后续接线时应明确拒绝未实现的运行模式，不能仅改变模式
标签就把 mock 写成真实执行。修复离线组合链之后，再做最小实际 Docker transport 集成。
当前完整执行器仍未就绪，正式 A/B 为 NO，不修改 rev06 评分器或已收口的容器探针。
