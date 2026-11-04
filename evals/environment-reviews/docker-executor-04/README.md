# docker-executor-04 审查：旧反例已阻断，仍需绑定 stdout 与观测并严格校验布尔值

日期：2026-11-03。仅执行只读对账、离线测试和独立副本反例。
清理实现的 subprocess 全部由 mock 接管，未运行 Docker 或容器，未启动模型/正式 A/B。
未修改原实验或环境材料，未提交或推送。

## 已独立验证的修复

- 原 17 项门禁测试、17 项采集链测试、9 项分类测试重跑：**43/43** 通过。
- 在实际 docker-executor-04 记录上重放，正常记录仍得到 VERIFIED_PASS。
- 前轮四个门禁反例均不再通过：空 controls、缺一个必需 control、全部 raw_observation
  置空、全部 transport exit 改为 127，均得到 PREFLIGHT_FAILED。
- 对原清理实现 mock 查询失败（exit 1、daemon unavailable），现在报告
  cleanup_verified_success=false、verified_ownership_match=false。未实际调用 Docker。
- 当前 rev06 纯判定输出与存档一致；综合状态代码已让容器门禁失败影响推荐退出码，
  没有沿用上一轮只返回 rev06 结果的问题。
- 十一个历史目录树摘要与 before 快照一致；仅支持两次快照间未改变。
  排除 output/evidence 后，A 42 项、B 67 项输入摘要匹配，没有发现漂移。

因此前轮点名的修复有效，应保留。未独立重跑本轮真实容器回归与四项实测控制。
机器证据：[review.json](review.json)。

## P1：传输 stdout 与缓存观测仍未绑定

本次保留实际记录的 exit=0、缓存 raw_observation、summary、control 和 cleanup，
仅将两臂每个 transport_record.stdout 替换为：

```
THIS IS NOT A PROBE JSON
```

实际门禁仍返回 **VERIFIED_PASS，0 failures**。

门禁只检查 stdout 非空，然后把缓存 raw_observation 包装为 valid=true 交给分类器。
没有重新从当前 stdout 解析观测，也没有比较解析结果与缓存观测。因此“独立重算”
仍可能消费旧缓存，而不是该传输真正返回的数据。

这不说明当前存档 stdout 已损坏；说明损坏后门禁不能检出。本次测试改的是内存副本。

修复应从唯一权威传输记录重新解析、校验 schema、运行/Arm/探针身份，再分类；
缓存观测与该解析结果必须一致，否则报告缺证据或不一致并阻止通过。
至少加入无效文本、缺少边界标记、无效 JSON、合法但内容不同的 JSON 三类负样本，
并保留正常真实记录的通过正对照。

## P1：控制结果字符串 false 被当作通过

在另一份实际记录副本中，仅将四项控制的 passed_validation 从 true 改为字符串
`"false"`，门禁仍返回 **VERIFIED_PASS**。

原因是 `elif not c_data.get('passed_validation', False)` 使用真值判断，非空字符串
被当作成功。虽然控制条目必须为 dict，关键字段并未要求严格的布尔类型。

修复应要求 `passed_validation is True`，并校验控制的实际状态、预登记预期和
对应原因证据一致，不能让一个自报标志覆盖错误结果。为 false、`"false"`、`"true"`、
1、null、缺字段等建立类型测试；仅真正的布尔 true 且控制证据有效才可通过。

## 下一步范围

保留 docker-executor-04，先只修上面两项离线输入验证，不启动新容器场景。
重跑原 43 项及新增反例、真实记录通过正对照、清理失败回归；生成可重放的结果。
同一次传输的 stdout、解析观测、分类和汇总应形成可核对的数据链。

当前合法记录可重放、旧反例已被阻断，是本轮实际进展；但不能称门禁已无条件可靠。
模型 P10–P12 仍未核实，正式 A/B 继续未就绪。此次审查未改变 rev06 评分器结论。
