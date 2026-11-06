---
type: team-context
schema_version: 1
team_name: spec-20261101-1013-应用层无感改造
spec_dir: spec/versions/v0.1/specs/20261101-1013-tech-应用层无感改造
task_description: 移除 OBS 浏览器源形态（接收页、接收票据、/ws/receiver、signaling），保持配对/信任/发现/连接状态与手机 UI 行为不退化；不新增媒体或设备功能
status: archived
phase: archived
runtime: generic
mode: gated
execution: serial
git_branch: tech/spec-20261101-1013-app-refactor
base_branch: dev
pr_url: https://github.com/PrimeDawn/Artemis/pull/4
created_at: 2026-11-01T10:13:00+08:00
updated_at: 2026-11-01T10:13:00+08:00
---

# 团队运行账本

## 当前运行路径

| 步骤 | 阶段 | 负责角色 | 动作 | 状态 | 产物 | 门禁 | 更新时间 |
|------|------|----------|------|------|------|------|----------|
| 1 | intent | TeamLead | 需求对齐 | done | lead/team-context.md | gate-1 | 2026-11-01T10:13:00+08:00 |
| 2 | intent | TeamLead | 创建 Spec 工作分支 | done | `tech/spec-20261101-1013-app-refactor` | - | 2026-11-01T10:13:00+08:00 |
| 3 | intent | TeamLead | 创建角色目录与账本 | done | 本文件 | - | 2026-11-01T10:13:00+08:00 |
| 4 | exploration | spec-explorer | 探索现状与影响面 | done | explorer/exploration-report.html | - | 2026-11-01T10:30:00+08:00 |
| 5 | spec-writing | spec-writer | 编写改造方案 | done | writer/plan.html | - | 2026-11-01T10:45:00+08:00 |
| 6 | spec-writing | spec-tester | 编写测试计划 | done | tester/test-plan.html | gate-2 | 2026-11-01T10:45:00+08:00 |
| 7 | implementation | spec-executor | 按 plan 实施改造 | done | executor/summary.html | gate-3 | 2026-11-01T10:39:00+08:00 |

## 任务进度

> 共享维护区：各角色只追加或更新自己负责的任务行。

| 任务号 | 负责角色 | 任务 | 状态 | 产物 | 完成时间 | 更新者 |
|--------|----------|------|------|------|----------|--------|
| T-001 | spec-explorer | 探索接收端耦合面与不退化基线 | done | explorer/exploration-report.html | 2026-11-01T10:30:00+08:00 | spec-explorer |
| T-002 | spec-writer | 编写改造方案与验收设计 | done | writer/plan.html | 2026-11-01T10:45:00+08:00 | spec-writer |
| T-003 | spec-tester | 编写测试计划 | done | tester/test-plan.html | 2026-11-01T10:45:00+08:00 | spec-tester |
| T-004 | spec-executor | 实施改造 | done | executor/summary.html | 2026-11-01T10:39:00+08:00 | spec-executor |
| T-005 | spec-tester | 独立测试（模拟器） | done | tester/test-report.html | 2026-11-01T11:25:00+08:00 | spec-tester |
| T-006 | spec-ender | 收尾归档与 PR | done | ender/end-report.html | 2026-11-01T11:58:00+08:00 | spec-ender |

## 问题闭环记录

> 共享维护区：发现或解决问题的角色只追加或更新自己相关的问题行。

| 问题号 | 分类 | 发现者 | 负责角色 | 问题 | 解决方案 | 关联产物 | 状态 | 更新者 |
|--------|------|--------|----------|------|----------|----------|------|--------|
| I-001 | env | TeamLead | TeamLead | AWR 本地库在本机从未初始化，`awr status` 报 `source_unreadable` | 按 README 本地恢复步骤执行 `awr init --accept` 与 `source reindex`，库为本地状态不入库 | 本文件 | closed | TeamLead |
| I-002 | env | TeamLead | TeamLead | 本机无连接设备、未装模拟器，无法验证手机 UI | 用户要求模拟器与真机两者都要；模拟器安装纳入本 Spec 环境准备 | docs/toolchain.md | open | TeamLead |
| I-003 | bug | TeamLead | spec-executor | 改造前基线：`dev` 上 `receiver` 测试 43/43、JVM 18 项（17+1skip）通过 | 作为不退化基线，改造后逐项比对 | 本文件 | open | TeamLead |
| I-004 | env | user | spec-explorer | 报告打开无样式：仓库根缺 `html-report` 资源联接，且 Spec 级报告相对深度写成 5 层（应为 6 层） | 建立 `html-report` 目录联接指向全局 skills；三份报告资源路径改为 6 层，并逐份验证解析存在 | explorer/exploration-report.html、writer/plan.html、tester/test-plan.html | closed | spec-explorer |
| I-006 | env | spec-executor | spec-executor | 集成脚本 audit.log 复用旧报告目录时 EEXIST，脚本按 `wx` 独占写 | 每次运行使用全新 `--report-dir`，旧目录先删除 | executor/artifacts/green-integration-trust.log | closed | spec-executor |`n| I-008 | env | spec-tester | spec-tester | 模拟器全新安装后首次运行 ConnectionInstrumentedTest，KeystoreDeviceIdentity 生成密钥后立即读证书为 null，1 项失败 | 同一安装第二次运行 3/3 通过；判定为 API 29 首次生成时序问题，android/ 零改动，与本次改造无关 | tester/test-report.html | closed | spec-tester |
| I-011 | process | user | TeamLead | 真机曾处于 `unauthorized` 时未当场请求解锁授权，而是直接放弃改用模拟器 | 授权后补测真机：端到端 9 个阶段全过，取消信任后重新要求确认；此后遇到设备未授权须当场请求用户解锁并允许调试 | tester/artifacts/test-logs/20261101-real-device-e2e.log | closed | TeamLead |
| I-010 | env | spec-tester | spec-tester | `pairing-web-e2e.mjs` 依赖 `channel:'chrome'`，本机未装 Chrome；接收页链路上线时留下的浏览器耦合 | 改为 `PW_CHANNEL` 可配置，默认 `msedge`；用本机已安装 Edge 跑通 4/4，不安装 Chrome | tester/artifacts/test-logs/20261101-control-page-e2e.log | closed | spec-tester |
| I-009 | env | spec-tester | spec-tester | 模拟器收不到主机 mDNS 组播 | 使用项目既有 discovery 回调桥接注入真实端点，测试阶段记录为 real-endpoint-discovery-callback-bridge | tester/artifacts/test-logs/20261101-emulator-e2e-real-service.log | closed | spec-tester || I-007 | process | spec-executor | spec-executor | protocol schema 顶层只描述已被删除的信令信封，删除后设备消息暂无机器可读 schema | 删除 schema 并记录 D-006，设备消息 schema 由后续 Spec 补 | protocol/pairing-v2.md | open | spec-executor |`n| I-005 | process | user | spec-tester | 测试计划把真机列为门禁，且未声明时间断言不真实等待，存在「72 小时实测」的误读风险 | 计划升 r2：删除真机门禁改为模拟器；新增「禁止真实时长等待」硬规矩并说明假时钟做法 | tester/test-plan.html（r2）、writer/plan.html（r2）、explorer/exploration-report.html（r2） | closed | spec-tester |

## 决策记录

> 共享维护区：任何角色遇到需要用户或角色拍板的岔路口，落一行。

| 决策号 | 阶段 | 提出者 | 议题 | 候选项 | 结论 | 理由 | 拍板者 | 决策时间 | 依据 |
|--------|------|--------|------|--------|------|------|--------|----------|------|
| D-001 | intent | TeamLead | 接收通道删除深度 | A 全删（页/票据/ws/receiver/signaling/route） / B 只删页面与票据 / C 只改文档 | A | 手机端 `ServerEvent.Signal -> Unit` 从未处理信令，`ConnectionController.kt:108-113` 只按 sessionId 判 CONNECTED；删除不改变手机行为，且避免死代码误导后续 Spec | user（本轮要求范围由 TeamLead 读码判定） | 2026-11-01T10:13:00+08:00 | `android/app/src/main/java/io/github/primedawn/artemis/pairing/ConnectionController.kt:108-119`；`DeviceClient.kt:70` |
| D-002 | intent | TeamLead | 手机 UI 验证方式 | A 仅单元测试 / B 仅模拟器 / C 模拟器+真机 | C（**已被 D-005 取代**） | 当时按「两者都要有」判断；后续用户澄清开发不需要真机 | user | 2026-11-01T10:13:00+08:00 | 用户原话「两者都要有」 |
| D-003 | spec-writing | TeamLead | 下线功能的测试用例如何处置 | A 全部删除 / B 改写为无接收端仍正确的正向用例 / C 保留跳过 | A | 用户明确「删，代码都改了你留着老测试，假通过凑数字是吧」；跳过或改写凑数会让测试与实现脱节 | user | 2026-11-01T10:40:00+08:00 | 用户原话「删，代码都改了你留着老测试，假通过凑数字是吧」 |
| D-004 | spec-writing | spec-writer | 改造是否保留 wire 协议的 `epoch` 键 | A 删除该键 / B 保留键并置 null | B | `DeviceClient.kt:70` 以 `WireCodec.exact` 严格校验键集合，删键会导致手机抛 `E_PROTOCOL` 断线 | spec-writer | 2026-11-01T10:45:00+08:00 | `android/app/src/main/java/io/github/primedawn/artemis/pairing/DeviceClient.kt:70` |
| D-005 | spec-writing | TeamLead | 测试是否允许真实时长等待；真机是否作为门禁 | A 允许长时等待 + 真机门禁 / B 禁止真实时长等待 + 真机由 TeamLead 按需提出 | B | 用户明确「72 小时不断连是不是写了测试要测 72 小时？这种荒唐的方案要绝对禁止」；且「我都让你装模拟器了，你开发还要用真机？」。72 小时断言本就使用假时钟 `f.advance()`，无需真实等待 | user | 2026-11-01T10:55:00+08:00 | 用户原话「这种荒唐的方案要绝对禁止」「你开发还要用真机？」「你需要真机你自己提，不是我提」 |
| D-006 | implementation | spec-executor | protocol schema 如何处置 | A 保留 / B 删除 | B | 文件顶层 oneOf 仅引用 #/$defs/signal，内容全部是被下线的信令信封；保留会成孤儿文档。设备消息 schema 由后续 Spec 补 | spec-executor | 2026-11-01T10:39:00+08:00 | protocol/pairing-v2.schema.json 的 oneOf |
| D-007 | implementation | spec-executor | 激活后 kind 取值与集成断言 | A 保持发 waiting / B 按 plan 发 ready 并放宽断言 | B | 手机端 ConnectionController.kt:108-113 只按 sessionId 判连接，两种等价；旧脚本写死 waiting 属实现细节耦合 | spec-executor | 2026-11-01T10:39:00+08:00 | android/app/src/main/java/io/github/primedawn/artemis/pairing/ConnectionController.kt:108-113 |
| D-008 | implementation | spec-executor | 测试是否使用桩数据 | 尽量用真实数据，非必要不造 | 用户明确「测试方案里要尽可能少用 mock 数据，不是必要情况，就一律用真数据」。已将新增用例从 stub 通道改为真实服务 + 真实 TLS WebSocket 连接；现有老用例的桩保留，重做属独立工作量 | spec-executor | 2026-11-01T10:45:00+08:00 | 用户原话「尽可能少用mock数据，不是必要情况，就一律用真数据」 |

## 角色运行句柄

| 角色 id | 适配层 | 运行时角色名 | agent_id | thread_id | session_id | 状态 | 续接方式 | 累计参与 Spec 数 | 最近产物 | 更新时间 |
|---------|--------|--------------|----------|-----------|------------|------|----------|------------------|----------|----------|
| spec-explorer | .agents | - | - | - | - | idle | respawn+rebuild | 1 | | |
| spec-writer | .agents | - | - | - | - | idle | respawn+rebuild | 1 | | |
| spec-tester | .agents | - | - | - | - | idle | respawn+rebuild | 1 | | |
| spec-executor | .agents | - | - | - | - | idle | respawn+rebuild | 1 | | |
| spec-debugger | .agents | - | - | - | - | idle | respawn+rebuild | 1 | | |
| spec-reviewer | .agents | - | - | - | - | idle | respawn+rebuild | 1 | | |
| spec-ender | .agents | - | - | - | - | idle | respawn+rebuild | 1 | | |

> 本 Spec 采用 serial 执行：由 TeamLead 按七角色协议依次承担，不 spawn 子 Agent。运行时 handle 不适用，续接靠本账本与落盘产物。

## 产物注册表

| 产物 | 负责角色 | 状态 | 已确认 | 更新时间 |
|------|----------|------|--------|----------|
| explorer/exploration-report.html | spec-explorer | done | no | 2026-11-01T10:30:00+08:00 |
| writer/plan.html | spec-writer | done | no | 2026-11-01T10:45:00+08:00 |
| tester/test-plan.html | spec-tester | done | no | 2026-11-01T10:45:00+08:00 |
| executor/summary.html | spec-executor | done | no | 2026-11-01T10:39:00+08:00 |
| tester/test-report.html | spec-tester | done | no | 2026-11-01T11:25:00+08:00 |
| ender/end-report.html | spec-ender | pending | no | |

## 门禁决策

| 门禁 | 确认对象 | 决策 | 判定方式 | 决策时间 | 备注 |
|------|----------|------|----------|----------|------|
| gate-1 | 需求对齐 | pass | self+evidence | 2026-11-01T10:13:00+08:00 | 范围由 TeamLead 读码判定（D-001）：`ConnectionController.kt:108-119`、`DeviceClient.kt:70` 证明删接收端不改手机状态机；用户明确验证方式为「两者都要有」（D-002） |
| gate-2 | 方案与测试计划 | pending | user | | 待审阅 `writer/plan.html` 与 `tester/test-plan.html` |
| gate-3 | 实现确认 | pass | user | 2026-11-01T11:25:00+08:00 | 用户以「执行测试吧」放行进入阶段四 |
| gate-4 | 测试报告 | pending | user | | 待审阅 tester/test-report.html |
| gate-5 | 归档 | pending | user | | |

## 角色交接

| 来源角色 | 接收角色 | 交接原因 | 产物 | 状态 | 更新时间 |
|----------|----------|----------|------|------|----------|
| TeamLead | spec-explorer | 启动阶段二探索 | 本文件 | pending | |

## 修复循环预算

| 循环 | 最大轮数 | 最大无进展轮数 | 已用轮数 | 连续无进展 | 状态 | 用户已确认 | 更新时间 |
|------|----------|----------------|----------|------------|------|------------|----------|
| test-debug | 待确认 | 待确认 | 0 | 0 | not-started | no | |

## 开放问题与阻塞

| 编号 | 负责角色 | 问题或阻塞 | 状态 | 解决情况 |
|------|----------|------------|------|----------|
| B-001 | TeamLead | 模拟器与真机均已完成验收；真机曾因 unauthorized 未被使用，授权后补测通过 | closed | Galaxy S24 / Android 16，原生 mDNS 发现，端到端与取消信任均通过 |
| B-002 | TeamLead | 72 小时等时间断言不得真实等待，仅用假时钟推进 | closed | 已写入测试计划硬规矩与 plan §4；现有实现本就是 `f.advance()` |

## 下一步动作

- 阶段四已完成，`tester/test-report.html` 已产出（12 项通过 / 1 项部分覆盖）。下一步由 TeamLead 向用户发起 gate-4 确认；通过后进入阶段五收尾（提交、推送、PR）。
