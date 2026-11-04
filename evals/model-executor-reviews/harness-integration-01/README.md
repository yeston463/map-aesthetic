# harness-integration-01 审查：实际接线有证据，清理与对账失败门禁仍需修复

日期：2026-11-03。仅只读记录重放、离线测试、合成文件与 mock subprocess；
未调用外部模型、未操作 Docker、未启动正式 A/B，原材料未修改，未提交或推送。

## 已核实的进展

- 运行入口确有 local_http_docker 分支，构造 RealModelAdapter 与 DockerContainerTransport，
  Mock transport 被显式拒绝，不再无论模式都走 mock。
- 36 项原离线测试重跑通过。7 项反向测试也通过，其中 test_02 原本会调用 Docker CLI，
  本次仅对该项 subprocess 使用受控失败 mock；其余 6 项未改。不能将其说成独立重跑了
  全部真实容器场景。
- 本轮实测存档重放得到 HARNESS_READY_REAL_MODEL_PENDING / exit 2。
- 留存假服务记录为 10 次 HTTP。两臂工具审计各有 **3 次 EXECUTED + 1 次 REJECTED**，
  不能将 8 个工具调用全部称为成功容器执行。
- 宿主输出大小和 SHA-256 与报告一致，sentinel_value 与各自实际输入文件完全一致。
  当前成功路径有实际证据，未据反例宣称本次输出已损坏。
- 十四个历史目录摘要与 before 清单相符，仅支持两次快照之间未改变。

机器证据：[review.json](review.json)，含复核代码摘要。
实跑部分本次核验的是交付方留存记录，没有再次创建容器。

## P1：新 DockerManager 再次把清理查询失败当作清理成功

对实际 DockerManager.cleanup_containers 的全部 subprocess.run 做 mock：
两次查询均返回 exit=1、stdout=''、stderr='daemon unavailable'，没有调用 Docker。
函数却输出 cleanup_verified_success=true，前后计数均为 0。

它没有检查查询退出码，将错误留下的空列表当成有效空集合，重现已在旧实现中修复过的
同类缺陷。源码还未逐个解析回读标签后严格核对归属，只依赖过滤命令和名称特判。
应复用或迁移已验证过的查询、解析、归属、删除与后置查询门禁，而不是另建简化实现。

## P1：清理状态没有控制最终综合结果

run_harness_cycle 在清理之前生成 eval_report，在 finally 中取得 cleanup_audit，
随后只把 cleanup_verified_success 放进 integration_summary，未将 false 纳入 failures
或 recommended_exit_code。即使清理实现正确返回失败，主入口仍可能输出原通过状态。

必须在完成清理与服务关闭后生成最终综合状态，任何必需清理/查询/终止未验证均不得
保留本轮集成通过。失败优先于“真实 API 未运行”的 exit 2。原始成功和失败证据都保留。

## P1：宿主对账与假服务读回校验可以被错误数据满足

独立合成两个工作区，输出文件中填正确 arm/run_id、sentinel_token_verified=true，
但 sentinel_value 为 WRONG_NOT_ISSUED。实际 reconcile_host_outputs 仍返回
all_reconciled=true。它只相信文件内的真值，不比较实际输入标记。

另直接调用假服务状态机（没有监听 HTTP）：在读回阶段输入 success=false，content
仅包含 `{"sentinel_token_verified":false}`，readback_verified 仍变为 true。
源码仅检查字段名子串存在。sentinel 阶段也仅比较 Arm 前缀，而不是完整随机标记。

宿主 SHA-256 计算证明某文件存在并有这些字节，不能单独证明字节与预期一致。
应将本轮真实挑战、写入内容、读回内容和宿主文件进行明确的值/摘要比较；
工具 success=false、错误 token、缺失字段或读回不符都必须阻止完成状态。
假服务 completed=true 也应依赖全部必需阶段有效，而不是仅走到最后一个 turn。

## 后续最小范围

保留本次接线与成功路径，先离线修复上述门禁：

1. 真实清理方法的前/后查询错误、解析错误、标签不符、删除失败都不可通过。
2. 清理失败进入同一主入口最终状态，不能只写 informational 字段。
3. 错 token、只保留正确前缀、读回失败、字段存在但为 false、宿主与读回内容不符均拒绝。
4. 测试直接调用实际 DockerManager、假服务状态机和最终聚合逻辑，所有 Docker 调用 mock，
   避免只测辅助函数返回 false 而主入口仍通过。

反例阻断后再做一次最小集成回归，不继续扩大评分范围、不修改 rev06。
当前仍未进行外部供应商诊断，正式 A/B 为 NO，不应现在要求真实 API 密钥。
