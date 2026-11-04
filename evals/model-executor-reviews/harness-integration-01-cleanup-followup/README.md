# 集成清理与对账复核：代码修复有效，测试输出需与实跑归档隔离

日期：2026-11-04（Asia/Shanghai）。仅离线复核、本机假 HTTP、合成文件和 mock Docker。
未启动真实容器或外部模型，原交付材料未修改，未提交或推送。

## 已独立确认

- 36 项基础测试、16 项集成反向测试均通过。会调用 Docker CLI 的 test_02 使用失败 mock；
  test_15/16 的主入口输出重定向至全新临时运行目录，未让测试覆盖交付目录。
  这是受控离线重跑，不是重新执行真实 Docker 回归。
- 原清理实现收到 mock 查询 exit 1 时，cleanup_verified_success=false。
- 合成工作区输出使用正确 Arm/run 和 true 标志、但 sentinel_value 错误时，对账为 false。
- 假服务读回阶段收到 success=false 和 false 标记内容，readback_verified=false。
- 实际主入口在 mock 清理失败时综合失败/exit 1；完整成功正对照仍 pending/exit 2。
- 十四个历史目录树摘要与 before 清单相符；不将被本轮就地修改的集成目录算入未改范围。

因此前轮点名的清理误通过、清理未进入最终门禁、错误标记/读回误通过修复有效，
本轮限定离线代码修复可以收口。证据：[review.json](review.json)，含复核代码摘要。

## 当前实跑归档被主入口测试写入

test_15/16 直接调用 run_harness_cycle，使用交付目录的 BASE_DIR/EVIDENCE_DIR/
DECISION_DIR。test_16 还调用真实 prepare_workspaces，并将 mock 写入结果保存到
交付目录 workspaces。其 Docker 执行已 mock，但文件输出没有隔离。

本次审查开始时，归档 decision/harness_composite_status.json 的 container IDs 已是
`cid_a_mock`、`cid_b_mock`。原 hi01-8086c850 留存宿主对账记录的两个 SHA-256，
均与当前 workspaces 下的输出不再相符。本次验证前后没有改这些文件。

这不证明旧实跑从未发生，也不等于发生了宿主逃逸；它说明后续测试覆盖了当前运行视图。
原始旧记录仍可保留，但不能把旧实跑事件、当前 mock 综合状态和新工作区文件拼成
一份当前真实集成成功证据。

本次对 test_15/16 用独立目录重跑，正反对照均通过，说明可在不牺牲覆盖的情况下隔离输出。

## 下一步最小范围

1. 主入口支持显式 run_root/输出根；测试默认只写临时目录，禁止删除或覆盖固定实跑目录。
2. 一次运行一个唯一目录，原始事件、工作区、综合状态、输出及清理记录绑定同一 run ID。
3. mock 主入口测试与真实容器回归分开归档；记录执行类型，不能只看类名和 mode。
4. 加一项回归：运行全部离线测试前后，现有实跑目录的文件清单和摘要必须完全相同。
5. 输出隔离通过后，用新 run ID 做一次最小真实容器回归，保持 local_fake_http、
   真实供应商 NOT_RUN、exit 2。无需再扩展评分、预算或通用容器探针。

当前不接外部 API、不需要真实密钥，正式 A/B 为 NO。先修测试资产边界，再恢复实跑归档。
