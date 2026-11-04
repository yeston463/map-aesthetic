# docker-executor-04 离线补修复核：点名反例已阻断

日期：2026-11-03。本记录追加在前次审查之后，不覆盖其历史报告和反例。
交付方在原 docker-executor-04 中更新代码；本次审查没有修改外部代码或实验材料。
未调用 Docker、创建/删除容器、启动模型或正式 A/B，未提交或推送。

## 结论

前次指出的 stdout 与缓存观测脱离、控制结果字符串 false 误通过两项缺陷，本次独立
复测均已阻断。已有反例未出现回归，正常实测记录仍可通过重放，本轮限定修复可以收口。
这是离线代码及既有证据重放结论，不是一次新的真实容器回归或完整模型执行器验收。

机器证据：[review.json](review.json)。

## 独立执行结果

- 原三套离线测试重新执行：**50/50 通过，0 failures，0 errors**。
- 正常 docker-executor-04 实测记录重放：VERIFIED_PASS。
- 实际记录副本的 stdout 全部改为无法解析文本、保留缓存观测：PREFLIGHT_FAILED，
  命中 TRANSPORT_STDOUT_PARSE_FAILED。
- 控制结果全部改为字符串 `"false"`：PREFLIGHT_FAILED，命中严格类型检查。
- 空控制、缺一必需控制、空 raw_observation、传输 exit 127 均继续被拒绝。
- 原清理实现的 subprocess 查询被 mock 成 exit 1：cleanup_verified_success=false，
  verified_ownership_match=false。没有实际清理任何资源。
- rev06 纯判定重放与存档一致。十一个前序目录的树摘要与原 before 快照一致；仅支持
  相应快照之间未变，不把本轮已就地更新的 docker-executor-04 纳入“未改”的表述。
- 排除 output/evidence 后，A 42 项、B 67 项输入摘要匹配，未发现漂移。

## 后续范围

保存当前代码摘要和本次结果，避免混淆早期 docker-executor-04 代码与本轮补修版本。
保留前次失败反例，作为长期离线回归。

下一步用当前门禁做一次最小真实容器回归，记录新 run ID、实际配置与清理证据。
通过后再单独推进 P10–P12：模型上下文、工具路由和强制预算的无业务诊断。
当前这些模型层条件仍未核实，正式 A/B 启动条件仍为 NO；无需修改 rev06 评分器。
