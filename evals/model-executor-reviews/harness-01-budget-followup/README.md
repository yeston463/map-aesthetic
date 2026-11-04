# harness-01 预算复核：旧反例阻断，执行证据仍缺结构与关联校验

日期：2026-11-03。仅离线测试及 127.0.0.1 假 HTTP，使用合成凭据与合成 IO；
未调用外部模型、操作 Docker 或启动正式 A/B，原材料未修改，未提交或推送。

## 已独立确认

- **33/33 测试通过**，前轮字符串执行标志现返回 PREFLIGHT_FAILED / exit 1。
- 实际控制循环和 HTTP 适配器，在逻辑请求上限 1、总时限 1 秒下，只发送 2 次请求，
  约在 0.018、0.532 秒；第三次被 deadline 阻断。审计正确记逻辑请求 1、物理尝试 2、
  重试 1、is_terminated=true，响应 budget_exceeded。
- 新契约的物理上限默认为 3，与逻辑上限分别登记；另设 max_total_http_attempts=1、
  总时限 3 秒，实际只收到 1 次请求，原因 MAX_HTTP_ATTEMPTS_EXCEEDED。
- 路径解析、1 秒工具超时和独占证据写入继续通过复测。
- 十三个历史目录摘要与 before 清单一致，仅支持两次快照之间未改变。

预算授权、deadline 与严格布尔修复有效。证据：[review.json](review.json)，含代码摘要。

## P1：无关请求对象与空响应仍可通过

在当前有效离线存档上，只替换 real_model_execution_records：

```json
{
  "executed": true,
  "passed": true,
  "requests": [{"unrelated": true}],
  "responses": [{}],
  "usage": {"total_tokens": 1}
}
```

未执行外部模型请求，验收器却返回真实诊断 VERIFIED_PASS、
综合状态 COMPLETE_EXECUTOR_READY、recommended_exit_code=0。

requests 仅要求非空 list 和非空 dict，responses 允许空 dict，只排除显式 error。
没有验证模型、消息、请求与响应身份、run/Arm 归属、配对及 usage 来源。
非空容器不能等同于完整、匹配的执行证据。

本反例不是实际外部模型诊断，formal_ab_ready 仍固定为 false；当前真实 API 保持
NOT_RUN 的处理应保留。

## 下一步仅处理实证链

不再修改已验证的预算，不需要真实密钥。冻结事件必要结构：run/Arm、逻辑请求与物理
attempt ID、模型及消息摘要、原始响应引用、完成/错误状态、usage 来源、工具调用与
容器结果及预算关联。空对象、配对缺失、跨运行/跨臂、失败回复均不可判诊断完成。

应从适配器和控制器产生的原始事件重建证据，不信任手拼数组。usage 缺失应标未知，
不能用任意正数代替。用真实适配器产生的完整本机事件作结构正对照，但明确其为模拟；
Fake、本机假 HTTP、真实供应商来源分别登记。本轮正式 A/B 继续为 NO。
