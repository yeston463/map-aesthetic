# harness-01 审查：mock 原型已建立，真实适配与验收尚未完成

日期：2026-11-03。本次为离线独立复核；无真实模型/API、Docker 或容器调用。
测试使用合成凭据、SpyTransport 和合成文件 IO；只写审查者临时目录。
外部材料未修改，未提交或推送。

## 结论与已验证进展

原 **23/23 离线测试通过**，十三个历史目录树摘要与 before 快照一致。
存在显式消息构造、工具白名单、固定 docker exec 入口、派发计数和 fake 模型循环，
可以认定建立了 mock 原型。但不能验收为完整实现，也不能把 P10–P12 的 mock 结果写成
真实模型执行链已经 VERIFIED。实际 API 保持 NOT_RUN 是正确的。

机器证据：[review.json](review.json)，含复核代码摘要。

## P1：真实适配器未实现，运行器始终使用 mock

RealModelAdapter.invoke 在配置检查后，没有 HTTP 请求、响应解析或工具调用转换，
直接返回固定错误：`Real model execution not initiated in this session; configuration pending`。

本次使用合成 key、example.invalid URL 和合成模型标识，在内存中检查：ready=true，
但 invoke 仍返回上述 error；没有发送任何请求。因此补齐真实凭据也不会启动模型调用。
这不能描述成“实现已完成，只因凭据缺失尚未实测”。

run_harness_cycle 无论 mode 都构造 FakeModelAdapter 和 MockContainerTransport，
没有将真实模型与实际 Docker transport 接入诊断路径。A/B 还共享同一个 mock_files 和
written_files：B 的 sentinel 读取实际使用 A 的 mock 数据，不能作为独立两臂的运行验证。
七项注入测试属于 mock 调用，不是此次独立容器工具链实测。

## P1：验收器仍能把缺失证据判为通过，并混淆配置与完成

本次直接调用真实 AcceptanceController，使用：

- A manifest={}；B manifest 只有 has_skill=true；
- 两臂 tool_audit 均为空；
- budget_audit 只有 post_hoc 说明，没有契约或派发证据；
- 注入控制只有一项未登记控制，blocked=true；
- real_model_metadata 只有两个 configured=true 标志。

返回 VERIFIED_PASS，P10/P11/P12 均为 VERIFIED 类状态；真实诊断被写为 RUN_COMPLETED，
recommended_exit_code=0，尽管没有任何请求和工具执行记录。

原因包括 None==None、all([])==True、预算缺字段默认零/默认上限、无必需注入控制清单，
以及用配置齐备代替真实请求完成。token_accounting_documented=false 时也只影响局部
状态，不进入 failures，聚合规则没有统一要求必需检查成功。

应冻结必需字段/集合并严格验证，使用真实请求、回复、工具和预算记录重算结果。
未执行、mock 通过、配置就绪、真实执行完成、诊断验收通过必须分别表达。
失败优先于配置未齐备；推荐退出码不能仅由配置标志决定。

## P1：实际工具路径和超时契约未接通

### 标准工作区绝对路径被重复拼接

容器运行器对 path.lstrip('/') 再 join('/workspace', ...)，会把
`/workspace/inside_sentinel.txt` 变成 `/workspace/workspace/inside_sentinel.txt`。
ContextBuilder 恰好要求模型读取前一种标准绝对路径；脚本 fake 工具调用却只使用相对路径。

本次在实际运行器函数中使用 Linux 路径语义及合成 IO：相对路径成功，标准绝对路径
返回 FILE_NOT_FOUND，没有读取真实宿主文件。应统一路径契约并同时验证合法相对/绝对
形式、规范化、目录边界和链接处理，而不只测试 mock 的单独实现。

### 配置 1 秒仍派发 15 秒

本次 BudgetContract(per_tool_timeout_seconds=1)，通过真实 ToolGateway 调用
exec_command，SpyTransport 实际收到 timeout=15。配置字段没有被传给执行路径。
总运行时间只在新派发之前检查，也不是对进行中模型/工具的硬中断。

应从剩余总时间和单工具契约导出实际 deadline，限制模型参数不能扩大超时，
并记录超时后的容器进程终止状态。现阶段可声称请求/工具计数有前置检查，
不能称全部时间预算均已硬执行。Token 事后统计的如实说明应保留。

## P2：证据写入并非不可覆盖

EvidenceWriter.write_json 直接 write_text。本次在审查临时目录对同名文件先写 value=1
再写 value=2，第二次成功覆盖。应对不可变原始记录使用独占创建和唯一 ID，
将可重建汇总与原始事件区分；禁止覆盖失败后继续报告已留存不可变记录。

## 下一步最小范围

保留 harness-01，先修离线控制器，不急于补真实 API 密钥：

1. 固定证据 schema 和必需负向控制，阻断上面的最小缺证据反例。
2. 真实适配器先实现一个明确供应商协议，用本地假 HTTP 服务测试序列化、响应、工具调用、
   usage、错误和重试；没有实现的协议显式拒绝，不静默使用默认模型。
3. 两臂 mock 状态独立，运行模式明确选择 adapter/transport，保留真实模式未执行状态。
4. 测试实际容器运行器的路径和 deadline，避免只验证与实际实现不同的 mock。
5. 原始证据独占写入，状态与退出码由证据派生。

离线链条通过后，再把实际 Docker transport 与独立模型调用接入小范围诊断。
当前正式 A/B 仍为 NO；本次没有修改 rev06 或已收口的容器门禁。
