# harness-01 事件复核：关联修复有效，模拟来源仍被升级为真实就绪

日期：2026-11-03。本次离线独立复核；现有单测只连接本机假 HTTP。
没有调用外部模型、操作 Docker 或启动正式 A/B；原材料未修改，未提交或推送。

## 已独立验证

- 当前 **33/33 测试通过**，十三个历史目录树摘要与 before 清单一致，仅限快照之间。
- 前轮 requests=[unrelated]、responses=[{}]、usage=1 的反例返回 FAILED / exit 1。
- 在完整结构副本中单独改 response.run_id 或 response.arm，均因请求响应无法配对
  返回 FAILED / exit 1。旧结构与关联缺陷的修复有效，应保留。
- 代码已新增请求/响应字段检查、配对及 usage 求和。此次未重跑外部供应商或容器集成，
  不将离线结果称为真实模型完成。

机器证据：[review.json](review.json)，包含本次复核的代码 SHA-256。

## P1：来源枚举没有控制真实诊断状态

构造与本轮 run_id 匹配、请求响应配对、usage 求和一致的一份合成事件记录，
保留现有离线审计为基准；仅改变 source 字段，直接调用实际验收器：

| source | 真实诊断状态 | 综合状态 | 推荐退出码 |
| --- | --- | --- | --- |
| fake_mock | VERIFIED_PASS | COMPLETE_EXECUTOR_READY | 0 |
| local_fake_http | VERIFIED_PASS | COMPLETE_EXECUTOR_READY | 0 |
| real_provider | VERIFIED_PASS | COMPLETE_EXECUTOR_READY | 0 |

这三次都是合成输入，没有外部调用。前两种来源可以通过结构校验和模拟诊断，
不能因此变成真实供应商诊断通过。现有 test_33 本身使用 local_fake_http，却要求
COMPLETE_EXECUTOR_READY / 0，测试预期也固化了同一混淆。

来源需要影响状态聚合：fake/local 只能产生明确的模拟/离线状态；真实执行未发生时
整体应保持未就绪/exit 2。真实来源应由可信适配器和控制器执行路径确定，不能只因
输入字典写 real_provider 就升级。当前 formal_ab_ready 仍固定 false；本审查没有声称
实际发生过真实模型执行或正式 A/B。

## P1：重建辅助函数会补造缺失的请求消息

build_model_execution_record 使用：

```
turn.get('messages') or [{'role':'user','content':f'diagnostic_step_{req_id}'}]
```

本次输入没有 messages 的合成 turn，实际输出消息为 diagnostic_step_1。
这不是从实际请求重建，而是生成了替代消息；默认模型参数也不应代替实际派发模型。
当前运行器的 turns_trace 没有保存每次实际发送的完整消息，辅助函数又尚未真正接入
真实执行路径，故不能声称已“彻底废除手工拼凑实证”。

应在发送前保存请求事件及不可变消息引用/摘要，发送后保存响应事件；重建只引用真实
事件。缺失请求、消息、模型或配对信息时明确未验证/失败，不补默认诊断文本来满足结构。

## 下一步范围

只处理来源到状态的映射和真实事件产出，不再修改已通过的预算与字段关联检查：

1. 更新 fake/local 正对照：结构通过，但真实诊断 NOT_RUN，整体未就绪。
2. 真实适配器只能在真实执行路径生成 real_provider 来源，记录明确 origin 和 run/Arm。
3. 移除缺消息时的补造分支，补齐控制器的派发前请求记录与响应记录。
4. 用本机假 HTTP 驱动实际适配器和控制循环，验证生成的事件可直接被重建/校验；
   仍标 local_fake_http，不冒充真实供应商。
5. 缺少原始请求/消息、来源不符、跨运行和错误响应均不可完成真实诊断。

不需要真实密钥，不调用外部模型。当前主运行器仍 offline/mock，正式 A/B 继续为 NO。
