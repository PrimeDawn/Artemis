---
type: team-context
schema_version: 1
team_name: spec-20261102-1117-虚拟麦克风音频链路
spec_dir: spec/versions/v0.1/specs/20261102-1117-tech-虚拟麦克风音频链路
task_description: 手机麦克风音频采集与编码，经已配对鉴权的独立音频通道到 PC，解码后输出到用户自备的第三方虚拟声卡；未装声卡则只传视频
status: running
phase: spec-writing
runtime: generic
mode: gated
execution: serial
git_branch: tech/spec-20261102-1117-audio-device
base_branch: dev
pr_url:
created_at: 2026-11-02T11:17:00+08:00
updated_at: 2026-11-02T11:22:00+08:00
---

# 团队运行账本

## 当前运行路径

| 步骤 | 阶段 | 负责角色 | 动作 | 状态 | 产物 | 门禁 | 更新时间 |
|------|------|----------|------|------|------|------|----------|
| 1 | intent | TeamLead | 需求对齐（三步工作法） | done | 本文件 | gate-1 | 2026-11-02T11:20:00+08:00 |
| 2 | intent | TeamLead | 从 dev 创建 Spec 工作分支 | done | `tech/spec-20261102-1117-audio-device` | - | 2026-11-02T11:21:00+08:00 |
| 3 | intent | TeamLead | 创建 Spec 角色目录与导航树清单 | done | `rk-manifest.js` | - | 2026-11-02T11:22:00+08:00 |
| 4 | exploration | spec-explorer | 探索音频采集、传输帧类型与虚拟设备可行路径 | done | explorer/exploration-report.html | - | 2026-11-02T11:40:00+08:00 |
| 5 | spec-writing | spec-writer | 编写实现方案 | done | writer/plan.html | gate-2 | 2026-11-02T11:50:00+08:00 |
| 6 | spec-writing | spec-tester | 编写测试计划 | done | tester/test-plan.html | gate-2 | 2026-11-02T11:55:00+08:00 |
| 7 | spec-writing | TeamLead | 提交 gate-2 等待用户确认 | pending | 本文件 | gate-2 | 2026-11-02T11:56:00+08:00 |
| 8 | spec-writing | TeamLead | 按用户纠正重做调研与三份产物（r3） | done | explorer/exploration-report.html、writer/plan.html、tester/test-plan.html | gate-2 | 2026-11-02T11:52:00+08:00 |

AWR 运行态：session `01M6D4KYQ95BYVQXR8FRXQ2JYK`、claim `01M6D4KYQBKA79MX0SNDFHVQFV`（TTL 1h）、checkpoint `01M6D4MB0KQ7PFGGRGX9MSN7JS`（project revision 89）。

## 任务进度

> 共享维护区：各角色只追加或更新自己负责的任务行。

| 任务号 | 负责角色 | 任务 | 状态 | 产物 | 完成时间 | 更新者 |
|--------|----------|------|------|------|----------|--------|
| T-001 | spec-explorer | 探索音频采集/编码/传输与虚拟麦克风可行路径 | done | explorer/exploration-report.html | 2026-11-02T11:40:00+08:00 | spec-explorer |
| T-002 | spec-writer | 编写实现方案 | done | writer/plan.html | 2026-11-02T11:50:00+08:00 | spec-writer |
| T-003 | spec-tester | 编写测试计划 | done | tester/test-plan.html | 2026-11-02T11:55:00+08:00 | spec-tester |
| T-004 | spec-executor | 实现手机音频采集传输与 PC 端音频汇 | pending | executor/summary.html | | spec-executor |
| T-005 | spec-tester | 独立测试与结论 | pending | tester/test-report.html | | spec-tester |
| T-006 | spec-ender | 收尾归档与 PR | pending | ender/end-report.html | | spec-ender |

## 问题闭环记录

> 共享维护区：发现或解决问题的角色只追加或更新自己相关的问题行。

| 问题号 | 分类 | 发现者 | 负责角色 | 问题 | 解决方案 | 关联产物 | 状态 | 更新者 |
|--------|------|--------|----------|------|----------|----------|------|--------|
| I-001 | env | TeamLead | TeamLead | 自研内核音频驱动在本机不可行：Secure Boot 已启用（`HKLM\SYSTEM\CurrentControlSet\Control\SecureBoot\State` UEFISecureBootEnabled=1）、WDK 内核头未安装（`Windows Kits\10\Include\10.0.26100.0\km` 不存在）、当前令牌非提权管理员、`sudo` 在本机被禁用 | 本轮改用已签名第三方虚拟声卡做 spike 验证音频路径；自研驱动登记为独立发布门禁，不并入功能验收 | 本文件 D-001 | closed | TeamLead |
| I-002 | dependency | TeamLead | spec-executor | 本机未安装可写入的虚拟音频设备；已装的「UU远程虚拟音频设备」为厂商自用端点，第三方不能写入 | 方案中引入音频汇抽象，驱动缺失时音频链路仍以 WASAPI 直接渲染完成验收 | writer/plan.html | open | TeamLead |

## 决策记录

> 共享维护区：任何角色遇到需要用户或角色拍板的岔路口，落一行。

| 决策号 | 阶段 | 提出者 | 议题 | 候选项 | 结论 | 理由 | 拍板者 | 决策时间 | 依据 |
|--------|------|--------|------|--------|------|------|--------|----------|------|
| D-001 | intent | TeamLead | 虚拟麦克风设备实现路线 | A 自研 PortCls/WaveRT 内核驱动 / B 已签名第三方虚拟声卡 spike / C 先 B 后 A 在本 Spec 内替换 | B：第三方已签名虚拟声卡 spike，自研驱动登记为发布门禁 | 自研路线在本机被三重证据阻断：Secure Boot=1 使测试签名不可用、无 WDK 内核头、当前无管理员且 sudo 禁用；版本账本 §3 已写明「spike 阶段可先用已签名的第三方虚拟声卡验证音频路径」 | user（授权 TeamLead 调研自决） | 2026-11-02T11:20:00+08:00 | ①注册表 `HKLM\SYSTEM\CurrentControlSet\Control\SecureBoot\State` UEFISecureBootEnabled=1；②`Test-Path "C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0\km"` = False；③`whoami /groups` 显示 BUILTIN\Administrators 为 deny-only，`sudo -h` 返回「已在此计算机上禁用 Sudo」；④`spec/versions/v0.1/version-context.md:109-111` |
| D-002 | intent | TeamLead | 驱动缺失时音频链路是否可独立验收 | A 等驱动装好再验收 / B PC 端引入音频汇抽象，先以 WASAPI 直接渲染验收链路 | B：音频汇抽象 + WASAPI 直接渲染，驱动接入只是换后端 | 驱动安装需要管理员 UAC 授权，属于外部依赖；把链路正确性与设备存在性解耦，失败面更小，也便于日后替换自研驱动 | TeamLead | 2026-11-02T11:20:00+08:00 | `spec/versions/v0.1/version-context.md:109-111`（驱动签名是独立发布门禁，不并入功能验收）；`whoami /groups` 非提权 |
| D-003 | intent | TeamLead | 本轮运行模式 | A gated + serial / B autopilot + serial | A gated + serial | 用户本轮明确选择；与项目规则默认一致 | user | 2026-11-02T11:20:00+08:00 | 用户本轮答复「gated + serial（默认，按 Skill 门禁逐阶段确认）」 |
| D-004 | intent | TeamLead | 本轮交付范围 | A 仅虚拟设备 / B 仅手机音频链路 / C 全链路 | C 全链路：手机麦克风 → PC → 虚拟麦克风 → OBS | 用户明确选择；v0.1 验收要求 OBS 能选到 `Artemis Microphone`，拆开会让依赖链断裂 | user | 2026-11-02T11:20:00+08:00 | 用户本轮答复「全链路：手机麦克风 → PC → 虚拟麦克风 → OBS」 |
| D-005 | spec-writing | spec-writer | 音频帧如何进入既有媒体通道 | A 单连接新增 bit60 音频位（PTS 掩码收窄）/ B 第二条 `/media` 连接 | A | `media-relay.ts` 对 payload 完全透明、`decode-host` 是唯一解析方且同仓同发布；B 会多出两套连接生命周期与两路 PTS 对齐，风险更高 | spec-writer | 2026-11-02T11:50:00+08:00 | `receiver/src/media-relay.ts:1-80`、`native/decode-host/FrameHeader.h:40-48`、`native/decode-host/main.cpp:44-87`；`explorer/exploration-report.html` §2.2 |
| D-006 | spec-writing | TeamLead | 设备选型能否以开发机环境为依据 | A 沿用本机可用的第三方虚拟声卡 / B 方案必须对任意用户环境中立 | B：删除第三方声卡路线，设备由产品自带 | 用户明确：任何用户电脑都不会正好装着同一套设备，按开发机调研写出的方案除开发机外没人能用；且本机测试被要求停止使用 | user | 2026-11-02T11:31:00+08:00 | 用户原话「就是纯文本，禁止本机测试，你预言家能预测所有用户的电脑环境？你这样调研写出来的东西除了开发机谁也用不了」 |
| D-007 | spec-writing | spec-writer | 音频与视频的通道关系 | A 同一条流内加音频类型位（D-005）/ B 独立音频通道复用同一帧头 | B | 同类实现（scrcpy 三 socket、手机当摄像头类产品）均把音频独立成流；独立通道后帧头无需改动，视频路径零改动，也没有协议版本兼容问题 | spec-writer | 2026-11-02T11:47:00+08:00 | scrcpy `doc/develop.md`、`doc/audio.md`、`app/src/audio_regulator.c`；`explorer/exploration-report.html` §2 |
| D-008 | spec-writing | spec-writer | 音频编码格式 | A AAC-LC 优先 / B Opus 优先、AAC 回退 | B | scrcpy 默认 Opus（延迟更低）并按设备能力回退 AAC；本项目 minSdk 29 已满足 Opus 编码器要求，FFmpeg 侧两者都有原生解码器 | spec-writer | 2026-11-02T11:47:00+08:00 | scrcpy `doc/audio.md`；FFmpeg 解码器列表实测（`aac` 存在，opus 为原生解码器） |
| D-009 | spec-writing | TeamLead | 系统麦克风的交付来源 | A 依赖用户已装的第三方虚拟声卡（D-001）/ B 产品自带 PortCls/WaveRT 驱动并随包分发 | B | Windows 无用户态创建录音端点的 API；同类产品（DroidCam/Iriun/Camo）均另装音频驱动；只有自带驱动才能保证任意机器装完即有 `Artemis Microphone` | user（授权 TeamLead 调研自决） | 2026-11-02T11:33:00+08:00 | 用户原话「这不是独立的虚拟麦克风…你要找的项目是 github 上的虚拟摄像头项目」；`explorer/exploration-report.html` §3 |
| D-010 | spec-writing | TeamLead | 驱动签名归属 | A 作为发布门禁外挂，本 Spec 只交付测试签名可用的驱动 / B 签名并入本 Spec 交付范围与验收 | B | 签名决定用户装完能不能用，外挂等于把交付缺口留给下游；没有正式签名时 AC-5 不得通过，Spec 不得收尾 | user | 2026-11-02T11:55:00+08:00 | 用户原话「照你这么说用户只安装了软件用不了？这个还不在本spec，那你打算推脱给谁做？」；`writer/plan.html` §6、§7 AC-5、§8 |
| D-011 | spec-writing | TeamLead | 音频最终交付形态 | A 自研驱动 + 签名 / B 输出到用户自备虚拟声卡 / C 只做应用内音频 | B | 版本账本 D-012 与用户本轮决定：开源零预算拿不到微软签名；改为探测并输出到用户已装的虚拟声卡，未装则无音频。范围收缩后本 Spec 无内核代码、无签名 | user | 2026-11-02T13:50:00+08:00 | 用户原话「基础能提供视频传输，但如果用户装了虚拟声卡，就能传输声音，否则不能…他要是没装就听不到，那不管我们的事」；`spec/versions/v0.1/version-context.md` D-012 |
| D-012 | spec-writing | TeamLead | 本 Spec 支持几种虚拟声卡 | A 同时支持 VB-CABLE 与 VoiceMeeter / B 只支持 VB-CABLE | B：本 Spec 只做 VB-CABLE（`CABLE Input` ↔ `CABLE Output`），VoiceMeeter 整体推到 v0.1.2 | 用户要求只支持一个；单一端点配对最简单、没有混音台路由问题，先把一条打通 | user | 2026-11-02T14:10:00+08:00 | 用户原话「你只支持一个就行」 |
| D-013 | spec-writing | TeamLead | 连通性验证放在哪 | A 本 Spec 内验证 / B 推迟到 v0.1.1（VB-CABLE）与 v0.1.2（VoiceMeeter）补丁验证 | B | 当前没有任何机器装有虚拟声卡，无法实测；本 Spec 只保证代码实现完整、可构建、端点选择逻辑有单测，报告如实记未实测 | user | 2026-11-02T14:10:00+08:00 | 用户原话「本机也好哪里也好都没有安装虚拟声卡可以测试，这部分实现好能跑通就行，两个虚拟声卡软件的连通性测试留到发版后的补丁也就是0.1.1和0.1.2」 |

## 角色运行句柄

| 角色 id | 适配层 | 运行时角色名 | agent_id | thread_id | session_id | 状态 | 续接方式 | 累计参与 Spec 数 | 最近产物 | 更新时间 |
|---------|--------|--------------|----------|-----------|------------|------|----------|------------------|----------|----------|
| spec-explorer | .agents/roles | 串行承担（generic runtime） | - | - | - | idle | respawn+rebuild | 6 | explorer/exploration-report.html | 2026-11-02T11:22:00+08:00 |
| spec-writer | .agents/roles | 串行承担（generic runtime） | - | - | - | idle | respawn+rebuild | 6 | writer/plan.html | 2026-11-02T11:22:00+08:00 |
| spec-tester | .agents/roles | 串行承担（generic runtime） | - | - | - | idle | respawn+rebuild | 6 | tester/test-plan.html | 2026-11-02T11:22:00+08:00 |
| spec-executor | .agents/roles | 串行承担（generic runtime） | - | - | - | idle | respawn+rebuild | 5 | executor/summary.html | 2026-11-02T11:22:00+08:00 |
| spec-debugger | .agents/roles | 串行承担（generic runtime） | - | - | - | idle | respawn+rebuild | 5 | debugger/debug-*.html | 2026-11-02T11:22:00+08:00 |
| spec-reviewer | .agents/roles | 串行承担（generic runtime） | - | - | - | idle | respawn+rebuild | 3 | reviewer/review.html | 2026-11-02T11:22:00+08:00 |
| spec-ender | .agents/roles | 串行承担（generic runtime） | - | - | - | idle | respawn+rebuild | 5 | ender/end-report.html | 2026-11-02T11:22:00+08:00 |

## 产物注册表

| 产物 | 负责角色 | 状态 | 已确认 | 更新时间 |
|------|----------|------|--------|----------|
| rk-manifest.js | TeamLead | done | yes | 2026-11-02T11:56:00+08:00 |
| explorer/exploration-report.html | spec-explorer | done (r6) | no | 2026-11-02T14:12:00+08:00 |
| writer/plan.html | spec-writer | done (r6) | no | 2026-11-02T14:12:00+08:00 |
| tester/test-plan.html | spec-tester | done (r5) | no | 2026-11-02T14:12:00+08:00 |
| executor/summary.html | spec-executor | pending | no | |
| tester/test-report.html | spec-tester | pending | no | |
| ender/end-report.html | spec-ender | pending | no | |

## 门禁决策

| 门禁 | 确认对象 | 决策 | 判定方式 | 决策时间 | 备注 |
|------|----------|------|----------|----------|------|
| gate-1 | 需求对齐 | pass | user | 2026-11-02T11:20:00+08:00 | 用户本轮确认范围（全链路）与运行模式（gated+serial）；设备路线按用户授权由 TeamLead 调研自决，证据见 D-001 |
| gate-2 | writer/plan.html + tester/test-plan.html | pending | user | | |
| gate-3 | executor/summary.html | pending | user | | |
| gate-4 | tester/test-report.html | pending | user | | |
| gate-5 | ender/end-report.html（归档+PR） | pending | user | | |

## 角色交接

| 来源角色 | 接收角色 | 交接原因 | 产物 | 状态 | 更新时间 |
|----------|----------|----------|------|------|----------|
| TeamLead | spec-explorer | gate-1 通过，开始阶段二探索 | 本文件 | done | 2026-11-02T11:22:00+08:00 |
| spec-explorer | spec-writer / spec-tester | 探索完成，分发探索结论 | explorer/exploration-report.html | done | 2026-11-02T11:41:00+08:00 |
| spec-writer / spec-tester | TeamLead | 方案与测试计划定稿，提请 gate-2 | writer/plan.html、tester/test-plan.html | done | 2026-11-02T11:56:00+08:00 |
| TeamLead | spec-explorer | gate-1 通过，开始阶段二探索 | 本文件 | done | 2026-11-02T11:22:00+08:00 |

## 修复循环预算

| 循环 | 最大轮数 | 最大无进展轮数 | 已用轮数 | 连续无进展 | 状态 | 用户已确认 | 更新时间 |
|------|----------|----------------|----------|------------|------|------------|----------|
| test-debug | 待确认 | 待确认 | 0 | 0 | not-started | no | |

## 开放问题与阻塞

| 编号 | 负责角色 | 问题或阻塞 | 状态 | 解决情况 |
|------|----------|------------|------|----------|
| Q-001 | spec-explorer | 音频帧如何在既有 12 字节帧头里区分 | closed | 已由 D-007 推翻旧结论：音频走独立 `/audio` 通道，帧头不改，问题本身消失 |
| Q-002 | TeamLead | 是否需要在实现期安装第三方虚拟声卡 | closed | 已由 D-006／D-009 关闭：不安装任何第三方声卡，改为自带驱动，安装由产品安装器负责 |

## 下一步动作

- 范围已按 D-011/D-012/D-013 收缩：不自研内核驱动、不涉及签名、只支持 VB-CABLE；三份产物同步到 r6/r6/r5。
- 仍停在 **gate-2**：`writer/plan.html`（r5）+ `tester/test-plan.html`（r4）待确认。
- 确认后按方案 §10 执行：通道层 → 手机端 → PC 端解码/WAV → 端点探测与路由 → 接线与回归。
- 本轮不做连通性实测（无可用环境）：只做到可构建 + 端点选择单测 + WAV 链路跑通；VB-CABLE 实连通留 v0.1.1，VoiceMeeter 留 v0.1.2。