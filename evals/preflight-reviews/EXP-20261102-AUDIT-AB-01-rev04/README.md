# rev04 审查：默认交付校验修复有效，配置和证据验证仍需收紧

日期：2026-11-03。只审查实验准备材料并执行诊断，未启动正式代理 A/B。
未修改外部冻结 revision，未提交或推送。当前环境仍保持 PREFLIGHT_FAILED。

## 已独立核实

- 原校验器会重写旧树 after 快照、比较记录和 verification_summary，故没有直接运行
  其 main。本次执行无写入的校验函数：**234 项通过，0 失败**，核对 **1286 个冻结文件**。
  不将此结果写成“独立重跑了原脚本全部 247 项”。
- 用内存快照与 rev04 保留的 before 清单比较，rev01/rev02/rev03 均未变化。
  这仅支持两个快照之间未改变，不是更早历史的证明。
- 原样重新执行预检的 **19 项表驱动测试**，将结果输出重定向至审查目录：19/19 通过。
- 对 23 个既有校准结果文件做摘要、verdict、具名失败项及 reason 对账；未重新运行
  全套 23 样本、7 个变异。本次不将既有退出码记录描述成重新观测到的退出码。
- 使用**未修改的 rev04 评估器**和同一 p01 正对照页面实际运行：正常交付
  **PASS / exit 0**；正确尺寸、元数据自洽的无关纯红 PNG 在默认配置下
  **FAIL / exit 1**，三个槽均命中 `DELIVERED_IMAGE_NOT_THIS_PAGES_RENDER`。
- 正常交付通过当前机器上的逐字节门，支持本机此次捕获与既有正对照截图一致。
  本次未独立重跑三态各三次的完整稳定性测量，不能扩展为跨机器保证。

证据：[review.json](review.json)、[browser-evidence.json](browser-evidence.json)。

## P1：未知绑定模式绕过图像绑定

`unified_evaluator.mjs` 接受 `EVAL_CONTENT_BINDING`，直接传给 `validateDelivery`。
`delivery_rules.mjs` 只分支处理 `byte_equal`、`pixel_tolerance`、`unavailable`，
没有对其他值报错，最终可得到 `problems=[]`、`pass=true`。

本次保持页面、交付图片、旁车文件不变，仅改变环境配置：

| 交付 | EVAL_CONTENT_BINDING | 实际结果 |
| --- | --- | --- |
| 正常交付 | 未设置，使用登记默认值 | PASS / 0 |
| 三张正确尺寸的无关纯红图片 | 未设置，使用登记默认值 | FAIL / 1 |
| 同一组三张无关图片 | `byte_eqaul`（拼写错误） | **PASS / 0** |

图片摘要由文件实际计算，旁车仅同步该摘要；尺寸和原正对照状态一致。
该反例不是 1×1 尺寸缺陷，也没有改评估器源码或将新截图放入冻结目录。
当前默认模式仍然有效；问题在可配置路径上，不能笼统说默认运行已失效。

下一版应在启动时及纯规则入口分别验证枚举和完整契约。未知、错误类型、未登记或
与冻结登记不符的模式必须产生配置错误并非零退出；不得静默跳过内容绑定。
当前登记为 byte_equal 时，不应仅凭环境变量切换另一套未经登记的规则。
加入错拼、空白、大小写差异、对象/null 以及合法但未登记模式的测试，明确解析规则。

## P1：必需核实项接受空证据

`preflight_decision.py` 对 `evidence_required` 只检测键是否存在。
P10/P11 的 `pass_requires` 只有状态标签；P09/P12 也只验证少数布尔值。

从原测试的可通过合成记录出发，保持限制项和正对照不变，对必需核实项设置：

- P09：executor_kind、identity_source 为 null，parent_session_inherited=false。
- P10：method、skills_visible、memory_visible、probe_marker 全为 null。
- P11：source、file_access_rule、network_rule、observed_effect 全为 null。
- P12：source、limit_kind、limit_value 为 null，observed_enforcement=true。
- 四项状态均写 VERIFIED_CONFINED。

实际纯函数返回 **PREFLIGHT_PASSED / exit 0**，没有 defects。
这是对通过分支的合成输入测试，没有执行新访问探针；它不改变当前真实环境的 FAILED。

下一版应定义字段类型、允许的空值与语义要求。空的来源、方法和执行器身份不得算证据；
空列表在技能可见性中可能合理，不能简单禁止所有空容器。上下文标记需与控制器发出的
挑战关联，权限观察需关联实际探针结果，预算需有有效数值、单位及执行证据。
先验证记录结构和字段语义，再使用 VERIFIED_CONFINED 状态。不能要求纯函数凭空证明
外部事实，但也不能让空证据获得通过；采集与校验的可信边界应明确。

增加 null、空字符串、错误类型、无效预算、未匹配挑战和失效证据等独立负样本。
保留合法且有完整证据的通过正对照，避免只测“不通过”。

## P2：最终登记说明仍包含作废结论

`pixel_stability_registration.mjs` 的实际 mode 是 `byte_equal`，但 `meaning`
仍写“Content binding is UNAVAILABLE ... PASS is blocked”。生成器把最终模式与
测量中的旧 conclusion 拼接，导致同一份最终登记自相矛盾。
`png_decode.mjs` 开头也仍以“同状态无法逐字节复现”为现行理由。

下一版应从最终测量重新生成统一结论，将中间失败测量明确标为历史诊断，并检查机器模式
与人读说明一致。无需删除旧诊断；应避免让旧结论进入当前有效登记。

## 下一步

保留 rev04，另建后续 revision，仅收紧模式契约、核实项证据结构并修正登记生成。
先验证本轮两条新增反例被正确阻断，再重跑完整校准与冻结检查。
现有环境访问限制、上下文、权限和预算仍未全部核实，不启动正式 A/B。
