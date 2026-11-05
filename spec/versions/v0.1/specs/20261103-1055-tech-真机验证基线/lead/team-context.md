---
type: team-context
schema_version: 1
team_name: spec-20261103-1055-真机验证基线
spec_dir: spec/versions/v0.1/specs/20261103-1055-tech-真机验证基线
task_description: 从零安装并按 README 走完一次真实链路（配对 → OBS 看到 Artemis Camera 并录出画面），记录环境、测量延迟与音画偏差、输出可复现交付与研究结论
status: archived
phase: archived
runtime: generic
mode: gated
execution: serial
git_branch: tech/spec-20261103-1055-validation-baseline
base_branch: dev
pr_url: https://github.com/PrimeDawn/Artemis/pull/8
created_at: 2026-11-03T10:55:00+08:00
updated_at: 2026-11-03T10:56:00+08:00
---

# 团队运行账本

## 当前运行路径

| 步骤 | 阶段 | 负责角色 | 动作 | 状态 | 产物 | 门禁 | 更新时间 |
|------|------|----------|------|------|------|------|----------|
| 1 | intent | TeamLead | 需求对齐（三步工作法） | done | 本文件 | gate-1 | 2026-11-03T10:56:00+08:00 |
| 2 | intent | TeamLead | 从 dev 创建 Spec 工作分支 | done | `tech/spec-20261103-1055-validation-baseline` | - | 2026-11-03T10:56:00+08:00 |
| 3 | intent | TeamLead | 创建角色目录与导航树清单 | done | `rk-manifest.js` | - | 2026-11-03T10:56:00+08:00 |
| 4 | exploration | spec-explorer | 探索环境、既有证据与复现步骤 | done | explorer/exploration-report.html | - | 2026-11-03T11:02:00+08:00 |
| 5 | spec-writing | spec-writer | 编写验证方案 | done | writer/plan.html | gate-2 | 2026-11-03T11:05:00+08:00 |
| 6 | spec-writing | spec-tester | 编写验证计划（含覆盖矩阵） | done | tester/test-plan.html | gate-2 | 2026-11-03T11:06:00+08:00 |

## 任务进度

| 任务号 | 负责角色 | 任务 | 状态 | 产物 | 完成时间 | 更新者 |
|--------|----------|------|------|------|----------|--------|
| T-001 | spec-explorer | 探索环境、既有证据与复现步骤 | done | explorer/exploration-report.html | 2026-11-03T11:02:00+08:00 | spec-explorer |
| T-002 | spec-writer | 编写验证与复现交付方案 | done | writer/plan.html | 2026-11-03T11:05:00+08:00 | spec-writer |
| T-003 | spec-tester | 编写验证计划 | done | tester/test-plan.html | 2026-11-03T11:06:00+08:00 | spec-tester |
| T-004 | spec-executor | 按方案完成验证与交付物 | done | executor/summary.html | 2026-11-06T00:15:00+08:00 | spec-executor |
| T-005 | spec-tester | 独立验证与结论 | done | tester/test-report.html | 2026-11-06T00:16:00+08:00 | spec-tester |
| T-006 | spec-ender | 收尾归档与 PR | done | ender/end-report.html | 2026-11-06T00:45:00+08:00 | spec-ender |

## 问题闭环记录

| 问题号 | 分类 | 发现者 | 负责角色 | 问题 | 解决方案 | 关联产物 | 状态 | 更新者 |
|--------|------|--------|----------|------|----------|----------|------|--------|
| I-001 | process | user | TeamLead | 启动时把 D-013 已定的「音频实测留补丁」又重新问了一遍 | 按 D-013 执行：本轮只验未装声卡时的提示与视频不受影响，真实出声留 v0.1.1/v0.1.2 | 本文件 D-002 | closed | TeamLead |
| I-002 | bug | spec-executor | spec-executor | 手机持续发帧但 PC 视频通道始终未连上 | `-MediaPort` 只传了解码进程；接收服务的 `mediaPort` 从未从环境变量解析，固定连 3450。已解析 `ARTEMIS_MEDIA_PORT` + 脚本透传 + 2 个单测（先红后绿） | tester/artifacts/test-logs/20261105-2350/tc03-obs-record.log | closed | spec-executor |
| I-003 | env | spec-executor | spec-executor | openssl 候选全部探测失败 | 脚本 `$ErrorActionPreference=Stop` 下 openssl 的 stderr 被当成错误抛出；改用 Start-Process 重定向后判退出码 | tools/start-artemis.ps1 | closed | spec-executor |
| I-004 | env | spec-executor | spec-executor | PowerShell 解析脚本报「意外的标记 }」 | 文件为无 BOM UTF-8，Windows PowerShell 5.1 按 ANSI 解码中文注释；改为 UTF-8 BOM 保存 | tools/start-artemis.ps1 | closed | spec-executor |
| I-005 | bug | spec-executor | spec-executor | OBS 新建 DirectShow 源报 DecodeDeviceId failed、画面全黑 | `video_device_id` 必须是 `名称:@device#3Asw#3A{CLSID}\{PIN}` 完整形式，不能用裸设备名 | tester/artifacts/test-logs/20261105-2350/tc03-obs-record.log | closed | spec-executor |
| I-006 | bug | spec-executor | spec-executor | 依赖清单缺少 FFmpeg | 解码进程已引入 FFmpeg GPL shared，清单未同步；已补「媒体与音频依赖」节并写明分发义务 | docs/dependency-provenance.md | closed | spec-executor |

## 决策记录

| 决策号 | 阶段 | 提出者 | 议题 | 候选项 | 结论 | 理由 | 拍板者 | 决策时间 | 依据 |
|--------|------|--------|------|--------|------|------|--------|----------|------|
| D-001 | intent | TeamLead | 验证基线从哪种状态开始 | A 从零（卸载重装 + 清信任后重新配对）/ B 沿用当前已配对环境 | A 从零开始 | 交付基线应接近新用户路径；B 验证的是升级路径 | user | 2026-11-03T10:54:00+08:00 | 用户本轮答复「从零开始（推荐）」 |
| D-002 | intent | TeamLead | 音频部分的验证范围 | A 本轮验真实出声 / B 只验未装声卡时的提示与视频不受影响 | B | D-013 已把真实出声排到 v0.1.1/v0.1.2；本轮重复确认属流程错误 | user | 2026-11-03T10:54:00+08:00 | 用户原话「写的不是后面补丁再验证？这你也要问我」；`spec/versions/v0.1/version-context.md` D-013 |
| D-003 | intent | TeamLead | 运行模式 | A gated + serial / B autopilot | A | 项目默认；用户本轮未要求改动 | TeamLead | 2026-11-03T10:56:00+08:00 | `.agents/rules/spec-workflow.md` 默认 gated/serial |

## 角色运行句柄

| 角色 id | 适配层 | 运行时角色名 | agent_id | thread_id | session_id | 状态 | 续接方式 | 累计参与 Spec 数 | 最近产物 | 更新时间 |
|---------|--------|--------------|----------|-----------|------------|------|----------|------------------|----------|----------|
| spec-explorer | .agents/roles | 串行承担 | - | - | - | idle | respawn+rebuild | 7 | explorer/exploration-report.html | 2026-11-03T10:56:00+08:00 |
| spec-writer | .agents/roles | 串行承担 | - | - | - | idle | respawn+rebuild | 7 | writer/plan.html | 2026-11-03T10:56:00+08:00 |
| spec-tester | .agents/roles | 串行承担 | - | - | - | idle | respawn+rebuild | 8 | tester/test-plan.html | 2026-11-03T10:56:00+08:00 |
| spec-executor | .agents/roles | 串行承担 | - | - | - | idle | respawn+rebuild | 6 | executor/summary.html | 2026-11-03T10:56:00+08:00 |
| spec-debugger | .agents/roles | 串行承担 | - | - | - | idle | respawn+rebuild | 6 | debugger/debug-*.html | 2026-11-03T10:56:00+08:00 |
| spec-reviewer | .agents/roles | 串行承担 | - | - | - | idle | respawn+rebuild | 4 | reviewer/review.html | 2026-11-03T10:56:00+08:00 |
| spec-ender | .agents/roles | 串行承担 | - | - | - | idle | respawn+rebuild | 6 | ender/end-report.html | 2026-11-03T10:56:00+08:00 |

## 产物注册表

| 产物 | 负责角色 | 状态 | 已确认 | 更新时间 |
|------|----------|------|--------|----------|
| rk-manifest.js | TeamLead | done | yes | 2026-11-03T10:56:00+08:00 |
| explorer/exploration-report.html | spec-explorer | done (r1) | yes | 2026-11-03T11:02:00+08:00 |
| writer/plan.html | spec-writer | done (r1) | no | 2026-11-03T11:05:00+08:00 |
| tester/test-plan.html | spec-tester | done (r1) | no | 2026-11-03T11:06:00+08:00 |
| writer/plan.html | spec-writer | pending | no | |
| tester/test-plan.html | spec-tester | pending | no | |
| executor/summary.html | spec-executor | done (r1) | no | 2026-11-06T00:15:00+08:00 |
| tester/test-report.html | spec-tester | done (r1) | no | 2026-11-06T00:16:00+08:00 |
| ender/end-report.html | spec-ender | done (r1) | no | 2026-11-06T00:40:00+08:00 |
| ender/artifacts/full-suite.log | spec-ender | done | yes | 2026-11-06T00:38:00+08:00 |

## 门禁决策

| 门禁 | 确认对象 | 决策 | 判定方式 | 决策时间 | 备注 |
|------|----------|------|----------|----------|------|
| gate-1 | 需求对齐 | pass | user | 2026-11-03T10:54:00+08:00 | 用户确认从零开始；音频范围按既有 D-013 执行，不再重复确认 |
| gate-2 | writer/plan.html + tester/test-plan.html | pass | user | 2026-11-05T23:48:00+08:00 | 用户「手机已接入，可以执行」，方案与计划据此放行 |
| gate-3 | executor/summary.html | pass | user | 2026-11-06T00:30:00+08:00 | 用户「继续吧」视为放行；报告已提交审阅 |
| gate-4 | tester/test-report.html | pass | user | 2026-11-06T00:30:00+08:00 | 8 通过 / 0 失败 / 2 未实测；延迟按用户决定记遗留 |
| gate-5 | ender/end-report.html（归档+PR） | pass | user | 2026-11-06T00:44:00+08:00 | 用户「继续」放行归档、提交、推送与 PR |

## 角色交接

| 来源角色 | 接收角色 | 交接原因 | 产物 | 状态 | 更新时间 |
|----------|----------|----------|------|------|----------|
| TeamLead | spec-explorer | gate-1 通过，开始阶段二探索 | 本文件 | done | 2026-11-03T10:56:00+08:00 |

## 修复循环预算

| 循环 | 最大轮数 | 最大无进展轮数 | 已用轮数 | 连续无进展 | 状态 | 用户已确认 | 更新时间 |
|------|----------|----------------|----------|------------|------|------------|----------|
| test-debug | 待确认 | 待确认 | 0 | 0 | not-started | no | |

## 开放问题与阻塞

| 编号 | 负责角色 | 问题或阻塞 | 状态 | 解决情况 |
|------|----------|------------|------|----------|
| Q-001 | spec-explorer | 从零重装会清掉手机信任，需要重新在手机上点一次「允许并记住」；这一步由人完成，无法脚本化 | open | 探索阶段确认操作步骤与所需人工点按次数 |
| Q-002 | TeamLead | 用户反馈暂时接不上手机，TC-02 起的所有真机用例都无法执行 | closed | 2026-11-05 手机接入，从 TC-01 起全部执行完毕 |
| Q-003 | spec-tester | 端到端延迟未测：缺同框拍摄装置。备选方法已定（B 时间码回环 / C 双端时间戳），用户决定先记录、以后再测 | open | 方法与本轮结论已写入 test-report §TC-06 与「延迟测量方法（待执行）」；恢复时需手机对屏 + 一次授权点按 |

## 下一步动作

- gate-2 已放行并执行完毕（2026-11-05/06）：10 条用例 8 通过、0 失败、2 未实测（延迟缺同框装置、音画偏差按 D-013 留补丁）。
- 已归档（原位）：gate-5 由用户放行，提交与 PR 已执行，PR 链接见 frontmatter `pr_url`。
- 随后 spec-writer 与 spec-tester 出稿，gate-2 由用户确认。