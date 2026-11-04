# harness-01 来源复核：离线修复可以收口，下一步验证实际运行入口集成

日期：2026-11-03。仅独立离线复核，现有单测连接本机假 HTTP；
未调用外部模型、未操作 Docker、未启动正式 A/B，原材料未修改，未提交或推送。

## 结论

前轮点名的模拟来源升级为真实完成、缺消息补造两项缺陷已被阻断。
本轮限定范围未发现新增阻塞项，离线修复可以收口。
当前真实模型仍 NOT_RUN、完整执行器仍未就绪，不将离线检查称为外部供应商诊断完成。

证据：[review.json](review.json)，含所复核代码摘要。

## 独立执行结果

- 当前 **36/36 测试通过**，包含本机假 HTTP 驱动实际适配器和控制循环的新增用例。
  该用例工具端仍是 MockContainerTransport；不称为真实 Docker 工具集成。
- 相同完整结构的合成记录，source=fake_mock 或 local_fake_http，真实状态均保持
  NOT_RUN，综合 HARNESS_READY_REAL_MODEL_PENDING，推荐 exit 2。
- 缺少配置却声明 real_provider，返回 UNVERIFIED_PROVIDER_SOURCE / exit 1。
- real_provider 配置齐备的合成结构正对照仍可通过；这里只验证分支逻辑，未执行外部请求。
- 重建缺少 messages 的 turn，输出 messages=[]，不再生成 diagnostic_step_1；
  随后验收失败，明确命中消息缺失，而不是依赖无关的 run_id 错误。
- 无关请求/空响应、跨 run、跨 Arm 反例继续返回 FAILED / exit 1。
- 十三个历史目录树摘要与 before 清单一致，仅证明快照之间未改变。

源码也已在 invoke 前记录 request_event，并将 call_id 传入工具审计。
这些是原始事件产出的实际进展；此次没有把所有事件真实性或外部供应商行为外推为已证实。

## 下一步范围

主运行入口目前仍默认构造 FakeModelAdapter 与 MockContainerTransport，
真实适配器完整循环主要在测试入口中演练。不能仅补 API key 就声称实际运行路径已接通。

下一步增加明确的本机集成运行模式：真实 HTTP 适配器连接本机假服务，
工具调用转发本轮专用的真实 Docker 容器，A/B 各自状态和身份独立。
请求、工具结果、预算、证据重建、门禁和清理必须由同一运行入口生成；结果仍登记
local_fake_http，真实模型 NOT_RUN，exit 2，不进行地图业务任务。

本机集成通过后，再配置一个明确授权的外部模型端点及小额诊断预算。
当前不用真实 API 密钥，不修改 rev06，不继续增加无关评分或容器探针，正式 A/B 仍为 NO。
