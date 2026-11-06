---
type: team-context
schema_version: 1
team_name: spec-20261029-0934-offline-pairing
spec_id: SPEC-offline-pairing
version: v0.1
category: tech
spec_dir: spec/versions/v0.1/specs/20261029-0934-tech-离线配对与信令信任
task_description: 离线配对与信令信任
status: archived
phase: archived
runtime: codex
mode: gated
execution: serial
git_branch: tech/spec-20261028-2248-offline-pairing
base_branch: dev
pr_url: https://github.com/PrimeDawn/Artemis/pull/3
created_at: 2026-10-29T09:34:12.7268304+08:00
updated_at: 2026-10-31
---

# 团队运行账本

## 当前状态快照（2026-10-31，优先于下方历史流水）

Spec2的自动发现、电脑单击选手机、首次允许后持久信任、无固定连接期限、自动恢复及授权信令已实现。真实S24已完成首次连接与控制流程，前台常亮、切App暂停/返回恢复及省电锁屏→正常解锁连续恢复均有通过记录。最新连续流程全程同一服务，锁屏2649ms清除旧会话、解锁建立新会话。当前待验收/收尾，未归档、未提交推送；手机真实换IP仍未测，实际断公网按用户要求不测，音视频采集、媒体WebRTC及OBS播放尚未实现。 测试按D032取消五分钟硬上限；证据按D035精简。下方带旧日期的状态不代表当前阻断。

## 当前运行路径

| 步骤 | 阶段 | 负责角色 | 动作 | 状态 | 产物 | 门禁 | 更新时间 |
|---|---|---|---|---|---|---|---|
| 1 | intent | TeamLead | 沿用前序已对齐的第二个tech Spec及最新约束 | done | lead/team-context.md | gate-1 | 2026-10-29T09:34:12.7268304+08:00 |
| 2 | exploration | spec-explorer | 现状、依赖与本地信任方案探索 | done | explorer/exploration-report.html | gate-2前置 | 2026-10-29T10:02:06+08:00 |
| 3 | planning | spec-writer/spec-tester | 实现与测试计划完成，交用户审阅 | done | writer/plan.html、tester/test-plan.html | gate-2 passed（r2） | 2026-10-29T10:02:06+08:00 |

| 4 | implementation | spec-executor | 按已批准r2及r3实现并完成聚焦验证 | done | executor/summary.html | gate-3 pending | 2026-10-29T12:49:14+08:00 |

| 5 | testing | spec-tester | 执行全部无真机测试，真实数据优先 | done | tester/artifacts/test-logs/20261029-132510-independent | gate-3 passed；真机另轮 | 2026-10-29T13:52:37+08:00 |

## 编码思路小结

- 归属v0.1、性质tech；目标为局域网配对授权、时效/撤销/拒绝、TLS信任与信令交换。
- 复用当前仅含四份相关未提交草稿的分支；dev基线为已合并PR #1的334efb7725be8dbc1ec810c83fc7ee2892776c98，不创建重复分支，不提交、推送或新建PR。
- 先探索、再形成实现及测试计划；本次开启不等于方案已批准，不进入业务实现。
- 手机当前不在场。先推进电脑侧、协议、安卓工程可编译性及已有环境可验证部分；手机扫码、跨设备连接和S24证书信任保留明确待测状态，不用模拟器冒充手机结果。
- 保持公网连接；检查应用自身公网依赖，不修改网卡、路由器、代理或防火墙制造断网。
- 已有软件复用，新组件及缓存仍按项目E盘约束；大型下载先说明目录、预计空间及影响。
- 运行模式gated、执行serial；方案与测试计划交用户确认后才实现。

## 任务进度

| 任务号 | 负责角色 | 任务 | 状态 | 产物 | 完成时间 | 更新者 |
|---|---|---|---|---|---|---|
| T-001 | spec-explorer | 探索现有代码与信任/信令设计可行性 | done | explorer/exploration-report.html | 2026-10-29T09:54:09+08:00 | spec-explorer |
| T-002 | spec-writer | 撰写实现计划 | done | writer/plan.html | 2026-10-29T09:54:09+08:00 | spec-writer |
| T-003 | spec-tester | 撰写测试计划及设备缺项 | done | tester/test-plan.html | 2026-10-29T09:54:09+08:00 | spec-tester |

| T-004 | spec-executor | P-01..P-07代码、聚焦测试、APK与实现报告 | done | executor/summary.html | 2026-10-29T12:49:14+08:00 | spec-executor |

| T-005 | spec-tester | 全部无真机测试与报告 | done | tester/test-report.html | 2026-10-29T14:32:00+08:00 | spec-tester |

| T-006 | spec-tester | 手机接入后按PHONE-01..07复测 | pending-hardware | docs/pairing-phone-retest.md | — | TeamLead |

## 问题闭环记录

| 问题号 | 分类 | 发现者 | 负责角色 | 问题 | 解决方案 | 关联产物 | 状态 | 更新者 |
|---|---|---|---|---|---|---|---|---|
| I-001 | env | user | TeamLead | 当前手机不在场 | PC及工程验证先行，手机项登记待测 | tester/test-plan.html | tracked | TeamLead |
| I-002 | process | user | TeamLead | 前序将Spec2草稿独立提交并建PR不符合用户意图 | PR #2已关闭未合并；草稿已完整转为当前分支未提交改动，本次继续保留该限制 | lead/team-context.md | resolved | TeamLead |

| I-003 | dependency | spec-executor | TeamLead | OkHttp5.5.1实际要求SDK37，与SDK36计划冲突 | 用户D-014批准系列统一5.4.0，最终APK/TLS聚焦通过 | executor/summary.html | resolved | TeamLead |

| I-004 | env | spec-tester | TeamLead | PATH首选OpenSSL缺少配置，未建立长稳连接 | 改用此前验证的Git自带OpenSSL3.5.7；原失败日志保留 | tester/artifacts/test-logs/20261029-132510-independent/soak | resolved | TeamLead |
| I-005 | env | spec-tester | TeamLead | 独立构建漏传Android用户目录，产生C盘新调试签名导致模拟器安装签名不符 | 三个本轮新建小文件已核对迁到E盘，恢复E盘原签名并重建；原有ADB密钥未动 | tester/artifacts/test-logs/20261029-132510-independent/test-home-correction.json | resolved | TeamLead |
| I-006 | 稳定性观察 | spec-tester | TeamLead | API36 instrumentation进程在组件测试前crashed | 追加crash缓冲自动采集、复现定位；尚未计通过 | tester/artifacts/test-logs/20261029-132510-independent/android-api36-crash-observation | tracked-not-reproduced | TeamLead |

## 决策记录

| 决策号 | 阶段 | 提出者 | 议题 | 候选项 | 结论 | 理由 | 拍板者 | 决策时间 | 依据 |
|---|---|---|---|---|---|---|---|---|---|
| D-001 | intent | TeamLead | 所属版本、目标与性质 | 新版本；既定v0.1的第二项tech工作 | 启动SPEC-offline-pairing | 版本规划与上一轮解释已对齐，用户明确要求开启新Spec | user | 2026-10-29 | 用户原话“现在手机不在这边，你先推进，开启新spec”；版本清单 |
| D-002 | intent | TeamLead | 手机暂缺的推进边界 | 等手机；先推进可独立完成部分 | 探索与方案先行，手机项单列待测 | 不将环境缺项转成兼容通过 | user | 2026-10-29 | 用户原话“手机不在这边，你先推进” |
| D-003 | intent | TeamLead | 断公网测试 | 主动断公网；保持联网 | 不执行主动断公网流程，功能要求保留 | 用户已明确约束 | user | 2026-10-28 | 用户原话“最好不要测断开公网的流程……留着这个功能就行”；版本D-006 |
| D-004 | intent | TeamLead | Git工作方式 | 单独文档PR；当前Spec分支草稿 | 复用现有分支及四份草稿，禁止提交/推送/PR直至明确授权 | 遵守用户纠正，dev不受本次草稿影响 | user | 2026-10-28 | 用户原话“带到新的分支里去，不要提交，不要污染dev” |
| D-005 | intent | TeamLead | 运行模式 | gated/serial；自主推进实现 | gated + serial，下一门禁为方案审阅 | 沿用现有选择与项目默认；最新指令只授权启动和推进准备 | user/既有约定 | 2026-10-29 | 先前“逐阶段确认”选择；.agents/rules/spec-workflow.md |

| D-006 | design | spec-writer | 浏览器自签名信任与手机加密 | 全LAN共用自签名页面；本机控制/接收与手机加密分离 | 提议loopback HTTP/WS控制及接收、独立HTTPS/WSS手机入口 | 避免修改系统/浏览器信任库，仍约束本机Origin/CSRF与接收票据 | spec-writer（提案，待gate-2） | 2026-10-29 | S-02/S-04/S-06/S-07；explorer/exploration-report.html |
| D-007 | design | spec-writer | 手机配对入口 | 本轮加相机扫描；先手动导入加PC二维码展示 | 提议手动导入作为本次最小替代入口，相机扫码后续切片 | 手机不在场且当前重点是信任与信令，不把二维码图片当扫码已实现 | spec-writer（提案，待gate-2） | 2026-10-29 | 版本SPEC-offline-pairing允许替代信任方案；用户“手机不在这边，你先推进” |
| D-008 | design | spec-writer | 新依赖与既有工具 | 新下载浏览器/SDK；复用现有软件 | 提议固定ws/qrcode/OkHttp及小型测试依赖，Chrome/OpenSSL复用 | 控制环境改动，全部E盘；无大型组件安装 | spec-writer（提案，待gate-2） | 2026-10-29 | explorer/artifacts/dependency-metadata.json、okhttp-pom-metadata.json；只读版本命令 |

## 角色运行句柄

全部7份项目角色定义已加载。当前Agent按中立协议串行履职，没有新建子Agent线程；共享AWR会话为01M62MP54953Z5PNRQDWQEY06N。

| 角色id | 适配层 | 运行时角色名 | agent_id | thread_id | session_id | 状态 | 续接方式 | 累计参与Spec数 | 最近产物 | 更新时间 |
|---|---|---|---|---|---|---|---|---|---|---|
| spec-explorer | .agents/roles | TeamLead串行代行 | current-agent | current-thread | 01M62PMWEJNDY7R54X5KMX5Q30 | idle | 文件上下文恢复 | 2 | explorer/exploration-report.html | 2026-10-29T09:34:12.7268304+08:00 |
| spec-writer | .agents/roles | TeamLead串行代行 | current-agent | current-thread | 01M62PMWEJNDY7R54X5KMX5Q30 | idle | 文件上下文恢复 | 2 | writer/plan.html | 2026-10-29T09:34:12.7268304+08:00 |
| spec-tester | .agents/roles | TeamLead串行代行 | current-agent | current-thread | 01M62PMWEJNDY7R54X5KMX5Q30 | idle | 文件上下文恢复 | 2 | tester/test-plan.html | 2026-10-29T09:34:12.7268304+08:00 |

| spec-executor | .agents/roles | TeamLead串行代行 | current-agent | current-thread | 01M62TR2S6NETT8CNVFZRDNXFP | done | 文件上下文恢复 | 2 | executor/summary.html | 2026-10-29T12:49:14+08:00 |

| spec-tester | .agents/roles | TeamLead串行代行 | current-agent | current-thread | 01M631TB0MWW4MEKDG6REY6Y1J | done | 本轮记录完成，手机轮另续 | 2 | tester/test-report.html | 2026-10-29T14:32:00+08:00 |

## 产物注册表

| 产物 | 负责角色 | 状态 | 已确认 | 更新时间 |
|---|---|---|---|---|
| lead/team-context.md | TeamLead | active | 启动授权已取得 | 2026-10-29T09:34:12.7268304+08:00 |
| explorer/exploration-report.html | spec-explorer | ready-for-review | no | 2026-10-29T09:54:09+08:00 |
| writer/plan.html | spec-writer | approved（功能r2/依赖r3） | yes | 2026-10-29T09:54:09+08:00 |
| tester/test-plan.html | spec-tester | approved（功能r2/依赖r3） | yes | 2026-10-29T09:54:09+08:00 |

| executor/summary.html | spec-executor | ready-for-review | no | 2026-10-29T12:49:14+08:00 |

| tester/test-report.html | spec-tester | 当前无手机轮完成，真机轮待续 | 待最终测试审阅 | 2026-10-29T14:32:00+08:00 |

## 门禁决策

| 门禁 | 确认对象 | 决策 | 判定方式 | 决策时间 | 备注 |
|---|---|---|---|---|---|
| gate-1 | 已对齐的Spec2目标及最新约束 | passed | user | 2026-10-29T09:34:12.7268304+08:00 | 版本/性质/范围/分支可由既有上下文确定，用户明确要求开启；无须重复询问 |
| gate-2-r1 | writer/plan.html与tester/test-plan.html r1 | superseded | user反馈 | 2026-10-29 | 用户D-009修正原方案，旧确认请求不再放行实现 |
| gate-2-r2 | writer/plan.html与tester/test-plan.html r2 | passed | user | 2026-10-29 | 用户明确“确认 r2，开始实现”；不提交/推送限制保持 |

| gate-2-r3 | OkHttp系列5.4.0 / SDK36依赖处置 | passed | user | 2026-10-29 | 用户明确批准固定5.4.0继续实现 |
| gate-3 | executor/summary.html | passed | user | 2026-10-29T12:49:14+08:00 | 独立测试尚未开始；拟3轮修复/2轮无进展预算一并确认 |

| gate-4 | 最终测试报告（含后续手机轮） | pending-phone-round | user D-017安排 | 2026-10-29T14:32:00+08:00 | 当前仅完成并记录无手机轮，不发起收尾确认 |

## 角色交接

| 来源角色 | 接收角色 | 交接原因 | 产物 | 状态 | 更新时间 |
|---|---|---|---|---|---|
| TeamLead | spec-explorer | 开始阶段二前置探索 | lead/team-context.md | done | 2026-10-29T10:02:06+08:00 |
| spec-writer/spec-tester | TeamLead | 方案与测试计划交gate-2 | writer/plan.html、tester/test-plan.html | waiting-user | 2026-10-29T10:02:06+08:00 |

| spec-executor | TeamLead | 实现报告交gate-3 | executor/summary.html | waiting-user | 2026-10-29T12:49:14+08:00 |

## 修复循环预算

用户D-017随gate-3确认最多3轮修复、连续2轮无进展即停。当前正式修复已用4/4轮，连续无进展0/2；D033用户追加一轮并批准缩短电脑端失活检测，D032取消五分钟测试硬上限。测试脚本与环境纠正单独记账。

## 开放问题与阻塞

- 手机缺席不阻断当前探索/方案，真机项保持待测。
- r2已实现自动发现、电脑选手机、首次一次允许、长期信任和自动恢复，聚焦验证已通过；独立集成/65分钟真实保活等待gate-3，手机跨设备项仍待测。

## 下一步动作

- 等待用户确认[实现总结](../executor/summary.html)的gate-3；确认后进入独立测试及真实65分钟保活，手机项待补。不暂存、提交、推送或创建PR。

## r1阶段二完成与方案质量自审（已被r2替代）

- 探索报告四类内容齐备；新知识只保留在本Spec，未把未验证候选写入长期已验证知识。
- writer四项：接口签名含TS/Kotlin函数与错误；数据结构列字段/类型/空值/默认；文件清单按新建/修改逐项定位；P-01至P-07各有验证命令和期望观察。
- 自审四问：无未替换模板或含糊承诺；API/模型/文件/任务对应一致；范围止于配对与信令，不含媒体/相机；手动入口、两个监听、凭据期限、角色与epoch均明确。
- 测试计划定义20个本机required、1个已有模拟器conditional、真机/扫码/OBS待测与NETWORK-001排除项，并写明何时可称通过。
- 当前为gate-2待确认；真实业务代码、依赖安装与业务测试均未开始，不能把本次文档检查当业务测试通过。
- 用户“不要提交”继续有效：不暂存、提交、推送，不创建PR。后续执行须先确认writer/plan.html与tester/test-plan.html。

## 本轮方案检查与预览

- 结构检查：lead/artifacts/plan-validation.json，37项通过；范围为文档元数据、链接、修订、任务/用例清单及Git隔离，非业务测试。
- 官方POM补核：JUnit4.13.2为EPL-1.0，org.json:json:20250517声明Public Domain，候选版本可查；均未安装。
- 内置浏览器因URL安全策略不允许file://而拒绝本地报告预览。未绕过限制，视觉检查未完成；已排队在Codex文件面板打开实现计划，并向用户提供本地文件链接。
- gate-2保持pending，所有草稿未暂存/提交/推送；业务代码、依赖安装、业务测试均未启动。

## AWR阶段交接

- 本轮会话：01M62MP54953Z5PNRQDWQEY06N；检查点：01M62PFVMA8MHD793J06FAG8Y1。
- 会话已以incomplete结束并释放claim；SPEC-offline-pairing保持in_progress，等待用户方案确认，未声明业务完成。
- AWR doctor在r305检查通过：数据库完整、0外键问题、0来源/产物问题。检查点及本地诊断JSON在.awr运行目录（不入库）。
- GOALS.md同步实际当前阶段，原产品规划与首个Spec原始证据保持不变。


## r2用户反馈与方案重写

- 当前权威方案：writer/plan.html r2、tester/test-plan.html r2、explorer/exploration-report.html r2。r1保留修订痕迹，不得按旧二维码/连接串/1小时会话实施。
- D-009（user，2026-10-29）：用户要求打开App自动识别、电脑鼠标单击选择；连接不允许固定时长到期，不想每次配对。取消固定会话/空闲期限，引入自动发现、持久信任与恢复，优先于原产品规划扫码默认路径。
- D-010（user，2026-10-29）：用户明确选择“电脑选手机；首次确认一次，以后免配对（推荐）”。首连电脑选择/手机allow，后续记住身份并自动认证，用户无需扫码/输码。
- D-011（spec-writer提案，待gate-2-r2）：PC发布mDNS，手机NSD自动presence；稳定P-256身份/SPKI绑定、Keystore/noBackup与PC E盘原子存储；证书同钥续签不重配对。首次为可信LAN内TOFU，不夸大首次主动中间人防护。
- D-012（spec-writer/spec-tester提案，待gate-2-r2）：信任/活动连接expiresAt=null；心跳只判死链，恢复原选择意图，主动断开/forget停止重试。真实65分钟跨原1小时上限+72小时模拟期限测试，不能宣称无限实测。
- 业务未实现，executor/summary不存在；沿用spec-write/spec-test修订，不通过spec-update的“先完成原功能”路径抢跑已被用户否定的r1。
- 继续同一Spec与分支，gated+serial，不spawn；不暂存/提交/推送/PR，保持公网；新依赖/数据仍按E盘规则。
- 新会话01M62PMWEJNDY7R54X5KMX5Q30续接上一轮检查点；角色按当前Agent串行代行。
- 当前方案质量：新数据类型/接口签名、精确文件清单及P-01..P-07命令均列明；增加发现/权限/持久化/同钥续签/无时限/停止重试判据。手机真实发现和后台行为明确待测。
- 下一步：检查r2结构/反链/修订一致性，保存AWR检查点，交用户确认gate-2-r2；此前r1确认请求即使迟到也不得放行。

## r2检查与交接准备

- lead/artifacts/plan-validation-r2.json：42项文档/隔离检查通过，报告hash与当前r2一致；不是业务测试。
- 24项本机required含真实65分钟保活与72小时模拟期限；手机真实NSD/重启免配对、后台/媒体仍待实测。
- 文档预览沿用上一轮限制：不绕过file://浏览器安全策略；本轮未执行视觉预览、业务构建或依赖安装。
- r2方案/测试文件已完成，用户D-010确认首次交互；完整gate-2-r2待确认。所有草稿仍未暂存/提交/推送，dev不受影响。


## r2 AWR交接完成

- 检查点01M62SZZHCMRTKG0MZVD6YZRRC；会话01M62PMWEJNDY7R54X5KMX5Q30以incomplete结束并释放claim，工作仍in_progress。
- AWR doctor在r313通过，0来源/产物问题；本地运行JSON不入库。等待gate-2-r2，未启动业务实现。


## 实现阶段启动

- D-013（user，2026-10-29）：确认r2，开始实现。按P-01..P-07，spec-execute/TDD，当前Agent串行代行；会话01M62TR2S6NETT8CNVFZRDNXFP，租约3小时。
- 65分钟长稳及最终集成结论属独立测试阶段，gate-3后执行；本阶段先交付代码、聚焦测试和APK。



## I-003：OkHttp编译SDK冲突与r3处置提案

- 真实Gradle日志android-tdd-foundation-red.log：5.5.1要求compileSdk37，未运行到行为断言，不能算安卓TDD RED。
- 官方AAR检查证实5.4.0要求SDK36；r3提议整个OkHttp系列统一5.4.0，仅用于固定SPKI本地连接，保持现有工具链；5.5.1公共CA撤销变更不作为本地授权信任来源。
- 受影响安卓实现暂停，依赖尚未切换，等待用户明确处置；PC实现继续。无SDK37安装或其他大组件下载。
- 当前文档r3保留r2批准的全部功能和用例，仅新增依赖处置提案；r3不能由此前gate-2-r2确认自动放行。

- D-014（user，2026-10-29）：明确批准r3，OkHttp/okhttp-tls/mockwebserver3统一5.4.0，保持SDK36和AGP8.13.2；现已修改版本目录，继续安卓实现。
- D-015（executor技术细化）：新增activated.manual事件区分鼠标新选择和自动恢复，避免手动断开后被自动重试重新激活；同一信任手机短暂掉线保留已授权接收端等待，恢复时签发新session/epoch。范围属于r2用户控制与自动恢复要求。



## 实现交付与gate-3（当前）

- D-016（executor）：同一已选/受信身份完成新证明后可替换旧传输，避免90秒死链等待；未知/另一身份不得抢占。Android公开身份摘要、持久主动停止标志和再次允许控制帧均为r2用户控制要求的技术细化。
- P-01..P-07实现交付，证据见executor/summary.html及executor/artifacts；43 Node、11 JVM、3模拟器组件、1JNI回归均通过，8 native库/ZIP对齐通过。不是独立24项最终验收。
- gate-2-r3：passed，user明确批准固定OkHttp5.4.0，保留SDK36。gate-3：pending，确认对象executor/summary.html。
- spec-executor当前Agent串行代行，session=01M62TR2S6NETT8CNVFZRDNXFP；状态done，产物executor/summary.html。未创建子Agent。
- 模拟器仅本轮emulator-5558，已正常退出0并释放端口；没有SDK37/新镜像/浏览器安装，没有断公网或改系统网络。
- 独立tester脚本按角色协议留待gate-3后创建。建议修复预算3轮/连续2轮无进展，随本次确认取得授权；尚未进入修复循环。
- 当前下一步：等待gate-3确认，再进入独立测试；手机真机项待测，仍不提交/推送/PR。


## 当前控制面补充

- 早期“方案未确认/尚未实现”段落属于具日期的历史流水，当前以实现交付/gate-3与表格为准；r4仅同步已获审批和阶段状态，不新增需求。
- 共享活动AWR会话为01M62TR2S6NETT8CNVFZRDNXFP；早期session句柄保留为历史。

## 实现阶段交接完成

- 实现报告已排队在Codex文件面板打开；报告视觉渲染仍未确认，不将结构检查视为视觉预览。
- lead/artifacts/implementation-handoff-validation.json：143项文档/证据一致性、业务源码与APK哈希、Git隔离检查通过，0失败；属于交接核对，不是独立业务验收。
- 已消费最新AWR准备上下文r334，确认5条Acceptance仍有效；上下文hash为b26735a3eae3efa2550e20cf1899ddf9b88fb3ce267922e98c0776debedaba1a。
- 检查点01M62ZYK1HQXN8D002QEGFJCR5；会话01M62TR2S6NETT8CNVFZRDNXFP已以incomplete结束并释放claim，当前无活动实现会话。SPEC-offline-pairing仍为in_progress，gate-3 pending。
- AWR doctor在r337通过，数据库完整、0外键问题、0来源/产物问题。运行时JSON仅保存在.awr，不入Git。
- 下一阶段必须等用户确认实现报告；最多3轮修复/连续2轮无进展预算随该确认提出。没有执行独立24项集成、3900秒真实长稳或真实手机补测。


## D-017：本轮无手机独立测试授权（当前）

- user明确确认实现报告并进入测试：先做全部不依赖手机真机的测试，完成后记录，手机接入后再做一轮带真机复测。真实数据优先，只有必要边界才使用模拟。
- gate-3 passed；延续已提出且随本次确认获授权的最多3轮修复/连续2轮无进展预算，当前业务修复0轮。测试脚本/环境纠正独立记录，不把它们伪装成产品缺陷已修复。
- 当前Agent按spec-tester协议串行执行；session=01M631TB0MWW4MEKDG6REY6Y1J，4小时claim。没有子Agent、没有Git提交推送/PR。
- 本轮使用真实Node监听/HTTP/TLS/WS/P-256与文件存储、已安装Chrome156、Chrome原生生成SDP/ICE/真实datachannel、真实WindowsCtrl+C和本机mDNS；协议发送端只在缺少手机时替代手机角色，不替换被测服务响应。
- 65分钟保活使用真实经过时间，单独记录起止/心跳；72小时加速仅用于期限边界。畸形/超长/重放消息是必要负向输入，明确与正常真实数据分开。
- 已有API36及API29模拟器只验证各自实际平台；如果Android虚拟网段无法跨主机mDNS，允许把本轮真实PC公开身份/端点送入发现回调，以隔离验证实际App/Compose/Keystore/TLS/恢复，必须明确标注该桥接，不声称Android NSD跨设备通过。
- 当前下一步：完成全部无手机测试、生成本轮测试报告及真机复测清单。真实S24、锁屏/后台及媒体保留待测；按用户安排等手机下一轮，不收尾归档或推进提交。


## 无真机独立测试轮完成（当前）

- 产物：[测试报告](../tester/test-report.html)、[自动汇总](../evidence/baseline.json)、[真机复测清单](../../../../../../docs/pairing-phone-retest.md)。
- 本轮24 required通过，43 Node、15 JVM（0跳过）、旧CLI6场景回归；实际65分钟保活无中断，API29/4KB与API36/16KB同APK各5项实际验证通过。
- 首轮instrumentation退出/API29连接超时后未改业务，后续无预热均通过；根因未证明，I-006改为tracked-not-reproduced，手机轮关注，不能说偶发已根治。
- 测试新增真实外部集成脚本，原executor聚焦测试文件未改；生产源码逐项匹配已确认实现，业务修复0轮。协议客户端/发现回调桥接与必要时钟/畸形边界单列，未冒充手机实测。
- 已按D-017完成本轮记录；整个Spec继续in_progress、测试阶段待手机，不归档、不提交/推送/PR。gate-4最终测试确认留待真机轮报告；当前无自动接机/后台监控任务。
- 下一步：用户提供手机接入条件后按PHONE-01..07新建独立run复测，真实NSD及手机65分钟不能沿用桥接/协议客户端结果；保持公网。

## 本轮测试AWR交接完成

- 测试报告已注册本地AWR产物；消费的最新准备上下文r361、hash=4cbe811cf8125807223052401c1510ab965bb3f9bce31d26ce9c25cdcefb5998，5条Acceptance保持有效，未以本轮结果替代手机要求。
- 检查点01M635YCK98BKZ3PE0C8QTKSNK；会话01M631TB0MWW4MEKDG6REY6Y1J已以incomplete结束并释放claim。工作项仍in_progress，当前无活动测试会话。
- AWR doctor在r364通过，0 findings、数据库完整。运行JSON仅在.awr；报告/证据核对见lead/artifacts/test-report-validation.json（344项通过）。
- lead/artifacts/resource-final-check.json：本轮emulator端口5558/5559已释放，当前ADB设备数0，共享ADB服务保留；本次曾误写C盘的3个Android小文件均已移出，原有ADB密钥未动。
- 实际安卓初始页面截图已人工查看；本地HTML报告仅完成结构/链接验证并排队到Codex文件面板，未绕过file URL策略做浏览器视觉预览。


## D-018：用户禁止长时间测试（当前最高优先级）

- 用户明确要求今后包括全量测试在内，每轮测试总时长不超过5分钟；长期不断开应检查代码，不按目标时长等待。此前安排65分钟实等是执行策略不当，不再沿用。
- 取消PHONE-05手机65分钟保活；改为无固定/空闲TTL、持久信任、心跳/自动恢复和主动停止的代码/状态机审查，必要的加速时钟边界须明确simulation。
- 真机仍需原生NSD、实际首次确认/免配对、恢复/主动停止与短时功能验证，但全部服从总计300秒预算；不通过拆轮或重试规避。
- 已写项目长期规则，停用旧pairing-soak.mjs长稳入口。历史65分钟原始日志及24项结果保留，本轮只改规则/文档/废弃测试入口，未重跑业务测试、不改产品无期限要求。
- 下一步仅为手机接入后的≤5分钟快速验证；不归档、不提交/推送/PR。

- D-018记录完成：检查点01M636HWSNSBTMME9BFXVVXB9F；会话01M63677QBKFY00WFBWE8Q1N8Y已incomplete结束并释放claim，Spec仍in_progress。AWR doctor r382通过。最新测试报告r2已重新注册，历史r1保留。规则/文档和废弃入口核对见lead/artifacts/test-budget-policy-validation.json；本轮仅0.058秒拒绝验证，无业务测试重跑。


## D-019：手机接入后预算内快速复测（当前）

- 用户授权已接入手机测试，仍遵守D-018总计300秒。TeamLead串行代行tester，无子Agent；session=01M63HZH955TEGC3039XQ7TM8G，已消费r383上下文hash=80bd285a8ebabf541724b11f95d89777e04c493d74a7cbc03a4e955148ddad7d。
- 实际SM-S9210/API36/arm64-v8a/4KB被ADB识别；主APK摘要匹配无手机轮最终APK。安装命令10秒子步骤超时，没有成功回执，是否实际已安装未知；根因未定。后续尝试被自动权限审批服务超时拒绝，未执行。没有启动PC服务/Chrome；0手机连接用例执行，不记通过或产品失败。
- 本轮准备18:05:30、停止18:10:08，共278秒（含审批等待），禁止继续拆批重跑。自动原始证据见tester/artifacts/test-logs/20261029-180530-phone，报告r3。后续脚本加长安装子步骤上限、捕获stderr，并要求外部原轮次开始时间；脚本修改尚未实测。
- 当前阶段：测试受安装/审批阻塞，gate-4未确认，Spec保持in_progress。下一步先核实安装实际状态/手机提示，再在用户继续测试时进行≤5分钟快速真机验证；不归档、不提交/推送/PR，不改公网/网卡或清空身份。

- D-019交接：会话01M63HZH955TEGC3039XQ7TM8G已incomplete结束并释放claim；消费最新上下文r390/hash=db9c680e8095cf981fc4490a9188ae497eaef626b954a5825094bff5fa61704f，最新报告r3已登记；检查点记录.awr/phone-checkpoint.json，doctor r394通过，Spec仍in_progress。


## D-020：用户明确要求单次重试，真机核心快速验证完成（当前）

- 用户“没成功就重试一次，不要急着结束”授权本次一次重试；D-018五分钟预算保持。先只读核实安装状态，发现上次18:07:55已安装完成，不能把安装命令超时等同安装失败。实际设备上SHA256与最终APK完全一致，无重复安装。
- session=01M63JH5SQVN605WEWTQ0MMER8，已消费r395/hash=06340425fbd66a22488179a419e43e2027ccd5ae153639e293ff13b96a67c962。当前Agent串行tester，无子Agent。
- 原生NSD/实际LAN、真实Chrome单击与手机允许、App进程重开免配对、PC实际重启4.128秒恢复、双端停止及取消信任后拒绝，4项通过/0失败。没有发现桥接、协议替身或ADB反向转发。
- 18:14:50准备→18:17:01.781测试及清理完成，131.781秒；后续无TTL代码审查输入采集于第232.163秒完成，停止测试，不再补跑。PHONE-05设计审查通过；PHONE-06部分（真机进程重开通过，未强制Activity重建/全量crash采集）；PHONE-07真实换IP未测，未改系统网络。历史模拟器波动根因仍未证明。
- tester/test-report.html r4；原始自动证据tester/artifacts/test-logs/20261029-181450-phone-retry/result.json及22文件哈希清单。测试服务/专用Chrome已关闭，共享ADB/手机App保留；业务修复0，无依赖安装/C盘下载，不提交/推送/PR。
- 当前gate-4待确认；Spec保持in_progress，尚未收尾。下一步由用户确认报告及残余环境/范围边界，再按流程收尾；未经授权不提交推送PR。

- D-020交接：最新上下文r403/hash=2b8cd766b00542f37bbcb7f3fa0bf3d3ac23c3e9d9090dcb41aaa6c81001ee29已消费；报告r4注册，本会话已incomplete结束并释放claim，doctor通过，gate-4待用户确认。记录后续本地AWR登记曾遇审批服务超时，改用沙盒内正常权限登记成功，无需操作手机或延长测试。


## D-021：前台常亮、离开暂停、返回自动恢复（当前更新方案）

- 用户要求补切换App、锁屏、省电与回收测试，并提出必须App打开且常亮；随后明确选择返回Artemis后自动恢复原电脑连接，保留信任、免重复配对。主动断开/取消信任仍停止，不等同后台暂停。
- 当前代码只停后台NSD，WebSocket/重试未停止、无KEEP_SCREEN_ON，因此需要同Spec小更新。新增updater/update-001.html完整方案；节点1待确认，未改业务代码、未跑本次测试。writer r7、executor summary r3、tester report r5仅补关联，历史通过结果不变，r5不代表生命周期测试通过。
- 使用spec-update、android-native-dev、html-report；当前分支核对与原plan一致，无Git写入。运行时只有root，沿用同一Agent串行代行原角色，未spawn。exp-search检索无相关生命周期经验，仅保留现有Windows真实进程退出经验边界。
- session=01M63KNK8ED15XD3AM5QJM1X1Y，已消费r407/hash=f2ef76a3aafc1faa1efe013b49409d792b7e69e695298888f95e325b6be7f0a2。
- 测试计划单一总预算300秒，含构建安装/等待/重试：常亮标志、真实切App/锁屏恢复、实际省电模式、受控终止后台进程、Activity重建与手动停止回归；无法实际开启省电或需解锁超预算则明记未测，不用模拟值冒充实机通过。
- 常亮按Android官方Activity窗口API，离开后恢复系统原熄屏行为；不唤醒锁屏/改系统超时/新增后台服务。此边界会同步到后续媒体规划，不再要求后台持续采集，但当前未实现媒体。
- 当前下一步：确认update-001完整方案后开始实现与补测；不提交/推送/PR或归档。

- D-021方案交接：update-001已登记；消费r415/hash=348971999f4b9962869c0452399a29a859b672c2dfe9057054522bec7775ecb0；会话已incomplete结束并释放claim，doctor通过。业务代码未改，本次测试未开始；待节点1方案确认。文档仅做结构/链接核对与Codex文件面板排队打开，未声称浏览器视觉预览通过。


## D-022：更新001已确认并实现，真机受发现问题阻塞（当前）

- 用户确认update-001“开始实现和补测”，并两次明确批准追加有界轮次；新增前台常亮、离开暂停、返回自动恢复原电脑，主动停止保持停止。所有继续均有用户明确授权，未自动拆轮规避。
- 业务源码：MainActivity窗口/屏幕事件，Application同步初始化与前台门控，Controller暂停/恢复/旧回调失效，PAUSED状态与使用提示、PC等待文案。主/测试APK构建成功，16 JVM通过/1九电脑环境跳过；新增2项实际TCP前台门控回归通过。
- 主APK SHA256=73b11aba6eca52edc9b44f016fbc7a7fad16fcbc7588a5d7a31e6e70fc301206，实际设备哈希匹配。测试APK083d0c5a4d38ce07d6adc909edae72cb3225fe04b22abd34df4554f76ae0e5ab仅已构建，未安装执行。
- 手机FG-02在原生NSD发现15秒超时；当前0手机FG项通过，其余切App、锁屏、省电、受控回收、Activity重建/主动停止未执行。此前旧APK4项通过不转移到当前版。
- I-007验收blocker：已解锁、Artemis前台、Awake、电脑WLAN192.168.1.3/手机192.168.1.4。工具只读诊断看到系统_artemis._tcp.local查询、foundServices=0；根因未确定，未证明新代码回归或环境/夹具故障，先定位真实广播/查询/响应再同流程复验。诊断输出不伪造成落盘运行日志。
- 先前构建沙盒daemon连接、Windows bat相对路径、缺少既有-PartemisMirror=true离线缓存参数、安装命令超时但实际成功、初期手机自动锁屏均分别记录，不混为I-007。PowerShell一次预算守卫错误地二次解析UTC造成+8小时，因实际已超预算仍未启动任何手机操作；不引用该错误数值作测试时长。
- 最新手机轮统一起点19:08:03.371，自动化19:08:22.564结束，19.194秒；后续只读诊断在本轮内停止；没有运行长稳或超过上限继续活动测试。测试服务/Chrome已关闭，powerChanged=false，没有改变实际省电模式/网卡/路由器/防火墙。
- 产物：updater/update-001-summary.html、reviewer/update-001-review.html、tester/test-report.html r6；实际证据tester/artifacts/test-logs/20261029-185642-foreground-phone-final。review结论需修复/补测，不进入收尾。
- 活动实施会话01M63KZKD5AWEKR8YHNP8ACWF3因记录阶段租约到期已incomplete结束；续接记录会话01M63NZZQ4S0QEQE00DKWEGC39，准备r421/hash=f9d1a2d995dc60bb1c5ea2e10ed5bd8b58a1fedf72389e4a193a4b71614276c9。当前Agent串行角色，无子Agent。
- 下一步：先根因排查I-007；手机生命周期结果未验收，Spec保持in_progress。追加真实测试须继续服从用户预算授权；不归档，不提交/推送/PR。

- D-022交接完成：消费r435/hash=bccacd0bcde1b9caca432ddab2e9888bf0092c28b9b299a1c7dfecabfd906e19；检查点01M63PJEF66MAKDJZZYH8689DX；记录会话01M63NZZQ4S0QEQE00DKWEGC39已incomplete结束并释放claim，doctor r438通过。Spec和update均未验收，I-007及FG缺项保留。新增报告仅完成结构/本地链接核对并排队打开，未声称HTML视觉预览。


## D-023：连接失败作为阻断，spec-debug根因诊断待确认

- 用户明确纠正：手机连不到电脑就是失败，必须解决再推进。按spec-debug由同一Agent串行代行debugger，未spawn，未改已确认writer/plan。
- 当前I-007状态diagnosed，owner=spec-debugger，关联debugger/debug-001.html。原测试等认证presence却报Native NSD，真实JDI快照证明候选已存在、opening=1、retries=0、未有challenge。
- 广播就绪/Chrome/UDP绑定对照未构成根因证明，原绑定和通配均有成功，通配也出现失败；这些假设被排除，不据此改业务。
- 单一可证伪的TLS停滞实验：真实S24+透明LAN TCP代理+真实生产身份与认证，首TCP持有不返回TLS，后续连接正常转发。修正端口一致性后的反例两次10秒超时失败，实际线程都阻塞在Conscrypt.startHandshake/OkHttp.connectTls，opening=1、retries=0；只发EOF后1.422秒新连接真实认证成功。证据debugger/artifacts/20261029-195739-tls-gate-corrected。
- 已证实代码缺陷：PinnedTrustManager.kt把建链readTimeout设0，造成握手无界等待，控制器收不到失败信号无法重试。所用OkHttp5.4.0实际字节码显示WS升级后会清socket.soTimeout为0，可设置有限建链读取而不限制已建立连接。
- 最小方案：readTimeout=5秒、保持callTimeout0和全部身份校验；已发现并打开传输时给出正确连接状态，修正测试阶段标签。验收用同一TLS停滞样本两次10秒内自动认证、原始手机单击/允许流程、跨5秒空闲不掉线及TLS负向回归。
- 原始间歇失败当时为何没有TLS响应未逐包证明；不得声称所有底层网络因素已排除。本文关闭的是“停滞导致不再重试”的明确缺陷，修后仍须原流程复验。
- 当前正式业务修复0/3，连续无进展0/2；诊断有新增明确根因和真实反例证据。gated节点等待用户确认debug-001后再改业务；不把间歇成功当修复，不收尾、不提交/推送/PR。
- AWR诊断续接会话01M63RVFK4G0KD0DJFW09SW7SC，准备r441/hash=d46f3f6f7f8d5bd8173407e237423271ce550d4a7632c8f9ca1338c6819abb1d；先前会话因记录期间租约过期已incomplete结束，按来源接续，所有正式源变更保持当前Spec分支。

- D-023诊断交接：已消费r449/hash=ac9b827b551f8cb0dbe9f63df4e114bd76b1570bdcb68c26984bc66be1866c35；检查点01M63S4ZAG0P341G4ASBG75A4H，会话01M63RVFK4G0KD0DJFW09SW7SC已incomplete结束并释放claim，doctor r452通过。debug-001已登记并排队打开，节点诊断确认待用户；正式修复未实施。


## D-024：用户确认TLS诊断并授权最小修复

- 用户“可以修复”确认debug-001；询问重试次数。当前无限自动重试，1/2/4/5秒退避+0–250ms抖动，attempts计数饱和只防溢出，不是次数上限；没有次数耗尽转手动按钮。本次保持既有自动恢复语义，不擅自扩张新交互。
- session=01M63SFNHSEQ2KHV2P20Y56WMC，已消费r455/hash=af45b6f6a5002ba0a26de0a3c923abebd144b0ccff564222fbbcc3f8c6b220ef；同一Agent串行debugger/tester，不spawn。
- 最小补丁：setup readTimeout5秒、已发现后CONNECTING/RECONNECTING真实阶段（避开待确认/其它活动电脑/主动停止），callTimeout0和身份校验保持；增加真实TCP停滞回归，修正认证presence错误阶段名。正式修复1/3轮进行中、连续无进展0/2，待真实输出。
- 单轮测试≤300秒，从构建准备开始同一时钟，真实TLS故障注入及原手机控制/lifecycle复验共用截止，不拆轮规避；保持公网/E盘，不提交推送PR。

- 第1轮自检完成：JVM {'tests': 18, 'failures': 0, 'errors': 0, 'skipped': 1}，构建/安装退出0，I-007=fixed_pending_verification；debugger/debug-001-fix.html已产出，TeamLead串行切换spec-tester，用当前工作树同一样本及原真实手机流程复验。

- 第1轮复验结束：TLS故障注入两次6.302/6.170秒自动恢复，原真实首连/常亮、切App恢复、受控进程重开、手动停止保护、跨6秒同会话通过；I-007=verified，正式修复已用1/3，连续无进展0/2。
- I-008 category=test-harness，owner=spec-tester，status=corrected_pending_verification：真实AndroidX MonitoringInstrumentation.finish默认finishActivities，内部实际重建同会话断言OK(1 test)/actualPowerSaveMode=true；主机缺少重新打开App而等待连接断言失败。已保留原始5通过/1失败，并修正驱动，未复跑。真正锁屏及独立省电窗口断言未执行。
- 构建到手机测试/清理统一215.337秒；省电设置恢复0、测试服务/Chrome关闭无错误，无新下载/网络变更/提交推送。产品规划及已确认writer SHA保持。tester r8、fix r2、诊断r3、更新总结r3，Spec/update均未完工。

## D-025：用户明确批准剩余真机补测

- 用户允许单独一轮≤300秒，仅复用已安装APK/原PC身份信任验证仪器结束后回App、省电实际状态和真实锁屏/正常解锁；不重复构建或首配。统一起点2026-10-29T12:34:38.1191699+00:00，沿用会话01M63SFNHSEQ2KHV2P20Y56WMC和D-024第1轮正式修复，不新增业务修复轮次。

- D-025结果：初次0用例为助手读取证书目录错误，误读取run.dataDir而非cfg.dataDir；修正助手、仅关闭核实命令行的专用PID88696，原痕迹保留。随后同原计时重试，FG-08真实20.237秒失败，手机未自动连接原已记住PC。
- I-009 category=bug，owner=spec-debugger，status=investigating，关联debugger/debug-002.html。事后只读JDI：foreground=false、发现false、候选/opening/retries=0；系统topResumedActivity为Artemis，Power Awake且keyguard showing/inputRestricted=false。最后设备证据写入距本轮起点210.849秒；之后265秒守卫拒绝新增快照、未执行ADB。抓取不在失败瞬间，根因未验证，不据此改业务。
- 正式业务仍仅1/3轮TLS补丁；无新业务改码，连续无进展0/2。TLS子缺陷复验不等于整体连接已修复，当前整体仍失败阻断，不进入收尾。I008驱动复验/省电独立窗口/真正锁屏项均未执行。
- 原服务已关闭、powerChanged=false；未清空身份/信任、不改网卡/公网，不提交推送PR。测试报告r9、更新总结r4、TLS修复总结r3明确新失败。下一步须另行获准有界真实诊断，捕获各Activity与应用级状态及最后发布来源，再确认最小修复。


## D-026：获准仅诊断的5分钟轮次

- 用户明确允许只定位、不改业务。统一起点2026-10-29T12:46:59.4606407Z；初次实际JDI获得两个Activity：旧实例stopped/visible=false，新实例resumed/visible=true、flag0x80，但应用级foreground=0，且同刻Awake/keyguard=false。实际再次am start的快照显示连接原PC、Application.foreground=1，并同时存在多个实例。
- 调用跟踪在ART读取方法参数时InconsistentDebugInfoException退出，属工具错误，非产品通过。已改读取方法退出值、补实例ID及真实调用栈；原轮后续运行因E_TEST_BUDGET在设备操作前被拒绝。没有新的业务改码。
- I-009缩小到多Activity共享全局前台布尔值的边界。单一待证伪假设：新Activity已前台时，旧onStop发布false覆盖；尚缺成功调用链追踪和两次受控对照，不能宣告已验证根因。debug002r2有真实自动证据。下一诊断入口已准备，仅需短时实际调用链；不得自动重置预算。

- D-026交接：消费r461/hash=b17d90ba55910bce92dd4bc39b17de874a03ee23c3973d186ccc2ff29d5b9677；检查点01M63VNY26WJW3PC0R70P94Y80；会话01M63SFNHSEQ2KHV2P20Y56WMC已incomplete结束并释放claim，doctor r468通过。等待用户批准短时已备调用链定位，不改业务/不推进收尾。当前源控制工作仍in_progress。


## D-027：调用链定位授权与根因验证完成

- 用户明确允许调用链定位；统一起点2026-10-29T12:57:14.9059365Z；新会话01M63VRVRXRJHWD5HKBRXM84J2，消费r469/hash=c67388c7293741cf8f3e266597a503f3ce5c389a7efdad6af3a6005f1e337721。
- 真实JDI方法退出值在12:57:46.222：来源MainActivity.onStop:71，应用foreground=0，另一个Activity86仍visible=true/resumed=true。重型跟踪3秒判据受时序影响，按实际记录不当作重复复现。随后同一轮关闭跟踪跑轻量对照：两次前台直接新开均断线失败，两次Home返回均真实恢复原PC，身份/端点/信任不变。
- I-009 status=diagnosed_verified，owner=spec-debugger，debug002r3；根因是多个MainActivity实例无归属地覆盖同一应用前台布尔值。最小方案弱引用当前可用窗口归属，仅其允许暂停；MainActivity事件带自身，旧窗口onStop不再覆盖新窗口。保持前台边界/配置重建/主动停止/TLS。
- 当前只诊断未改业务；正式修复仍1/3，连续无进展0/2。等待gated诊断确认后实施第2/3轮并按同反例复验；测试报告r10明确失败，锁屏等未执行，不收尾、不提交推送PR。


## D-028：用户确认debug002并授权第2/3轮修复与复验

- 窗口弱引用归属已按方案实现，只有onStart/onResume接管，其余屏幕/暂停通知检查来源；不变更TLS/信任/重试策略。正式修复2/3，连续无进展0/2。
- 共用轮次起点2026-10-29T13:06:02.0040715Z，消费r471/hash=f835cbbc86cc3c93b4591045a26cacd2ffe0c2ed16e75e6966b20ca0755cc3b1。构建/JVM {'tests': 18, 'failures': 0, 'errors': 0, 'skipped': 1}；debugger自检已完成、debug002fix r1交TeamLead，当前串行转tester按相同失败样本及剩余真机流程复验，I009=fixed_pending_verification。

- D-028复验：原反例4通过/同session；实际重建同会话、仪器后重开、实际省电与常亮通过，I009=verified、I008=verified。JVM17通过1环境跳过，新APK80313435...设备哈希匹配。
- I-010 category=integration，owner=spec-debugger，status=investigating，关联debug003r1：实际锁屏3秒PC仍online/session；同刻Phone Dozing/keyguard=true、App/Controller/NSD=false，无socket/opening/retries。根因未验证，不改业务。正常解锁未执行。
- 本轮224.108秒含准备/构建/安装/0用例pidof错误与同计时重试/真机清理；省电恢复0，服务已关闭无清理错误。正式修复2/3，连续无进展0/2，整体仍失败阻断；已备被动真实帧头和TCP关闭时序诊断，不记录payload，不自动续轮，不提交推送PR。


## D-029：用户获准仅锁屏关闭时序诊断，准备条件未满足

- 已获一轮≤5分钟仅诊断、保留原三秒断言及验证正常解锁恢复。两次基线连接等待均失败但0业务用例，后续实际read-only证明Phone仍Dozing/keyguard=true、无Artemis顶层窗口；没有实际关闭帧日志，不能宣称捕到关闭根因。
- 原唤醒/短暂guard=false会误判，已改正常解锁且Artemis实际mCurrentFocus；第三次准备被原E_TEST_BUDGET拒绝，无业务改码/无自动续轮。原状态/失败/守卫拒绝分别保留debug003r2；前一真实锁屏PC状态失败保持。
- 用户正常解锁问题仍待回复；预算不重置，解锁回复不自动授权新轮。修复仍2/3、连续无进展0/2；不推进收尾、不提交推送PR。省电设置两次均恢复原0，服务关闭，未更改网卡/公网。


## D-030：真正已解锁后的关闭时序与状态边界审视

- 用户明确允许一轮≤300秒。会话01M63XWGGEE3P10V47YMXASN2K，消费r485/hash=75e279a447a6734d992488901b8fad72c1c6a700d3208dbe70050ad29e2a3363，起点2026-10-29T13:34:11.6716087Z。
- 已解锁且实际窗口焦点通过后，真实visible/resumed=true、Awake/keyguard=false但foreground=false、无常亮、发现/重试停。不能继续归因用户没解锁。显式Home返回才认证，只作为归一化，不作自动恢复通过。
- 实际锁屏三秒和十秒PC仍session；真实帧头只有hello/proof，无Close opcode8或TCP end；唯一socket-close在服务清理时。Phone已暂停无socket。正常解锁回复抵达截止时，恢复断言未执行。全轮280.278秒，省电恢复0、服务关闭无清理错误。
- close→立即cancel违背正常关闭队列语义，官方5.4.0与本地AAR已核对；系统为何未及时送达中断通知未证实，解锁的确切广播顺序未逐回调证明。
- Phase4.5：连续两轮进展后再暴露状态归属，先审视窗口可用性与closing生命周期，debug003r3给出统一边界方案，等待用户决定调整方案后执行剩余3/3，或继续只读取证。业务仍2/3、连续无进展0/2，不提交推送PR。


## D-031：用户明确暂停，保留失败记录（当前控制状态）

- 用户在debug003方案选项中明确选择“先暂停，保留失败记录”。立即停止实现、构建、诊断与设备操作，仅办理暂停记录和会话释放；不存在第3轮实施授权。
- 正式修复已用2/3，连续无进展0/2；status=paused-user。当前代码与所有原始证据原位保留：TLS和窗口归属已复验；锁屏PC会话残留及解锁可用性缓存失配仍失败，实际正常解锁后的恢复断言未执行。
- debug003r4、tester报告r13、update001总结r6记录暂停；原方案与失败历史不覆盖。现有测试服务均已有清理记录，无新测试进程启动。Spec保持未完成，不归档、不提交推送PR。
- 下一步仅等待用户明确恢复；不能把手机解锁、窗口打开或其它状态回复当作恢复实施或新测试预算授权。

- D-031暂停交接：检查点01M63ZF1JJF5Y7NNN7XC933MCK，会话01M63XWGGEE3P10V47YMXASN2K已interrupted结束并释放claim，doctor r495通过。用户暂停控制生效，失败与未完成状态不变。


## D-032：用户恢复修复并更新验证要求（2026-10-31）

- 用户明确要求修复，批准继续 debug003 第3轮：优先功能与 bug 修复，不做无关防御性编程。取消每轮严格300秒和反复续轮确认，按改动选择聚焦验证，不逐改动全量测试；禁止长稳等待、保持公网/E盘缓存、不提交推送的边界继续有效。此决策覆盖D031暂停及旧5分钟约束。
- 窗口获焦重新计算可用状态；已打开WebSocket发送正常Close，终结回调清理资源，关闭等待1秒；尚未打开的建连直接取消。沿用原状态归属、TLS、心跳、信任和无限使用。
- 会话01M67RPV3Y66E497ZCY6SZ4G4B；当前第3轮已实施，待聚焦验证，不宣告整体通过。

- D032结果：构建成功，聚焦JVM6/6通过；APK db894bb527ca0db08c0281978bff9e783d660a56e9ada6eb13ab1955a306bad6已安装。省电锁屏3秒清理失败，正常解锁新认证会话恢复通过。关闭省电单变量对照，520ms清理PC会话且实收Close；等待解锁180秒未满足焦点条件，正常模式恢复断言未执行。原失败保留；两次服务关闭、省电恢复0无错误。
- 第3/3轮有进展但仍失败，连续无进展0/2。需要用户决定增加一轮并调整PC失活检测，或讨论断开时限；不自行放宽三秒判据、不宣称整体通过。不提交推送。


## D-033：用户批准继续一轮，优先及时断开并自动恢复

- 用户明确批准将30秒心跳/90秒阈值调整为约3秒内发现失联；实施1秒检查、2秒无Pong判失联。响应正常的会话没有固定使用期限；信任、连接意图不变。
- 正式修复4/4；只验证真实TLS存活/失联/免配对恢复及省电锁屏真机，不全量测试、不重新构建APK、不提交推送。会话01M67S8ASSKCB471ZW07830VNX。

- D033验证：TypeScript构建成功；真实TLS3项通过（正常同session、停止Pong1974ms清除、免重复确认重连）。S24省电锁屏2506ms内清除通过。正常解锁前原脚本180秒交互等待结束，恢复断言未执行；随后同身份服务重启，真实手机恢复补测通过。两次清理均恢复原省电0，无错误。连续同服务锁屏解锁项未完整执行，准确保留覆盖缺口，不视为产品失败或全量通过。
- debugger fix r3、diagnosis r6、tester r15、update summary r8，4/4轮有进展，无新业务失败。未提交推送；交用户查看结果，待后续安排连续覆盖及Spec验收。


## D-034：补完同一服务连续锁屏/正常解锁验证

- 用户明确要求继续完成缺失项，仅修正测试驱动的人机等待：保持同一个服务进程及原电脑身份，等待解锁不再因180秒交互等待清理服务；每个ADB调用和实际恢复断言仍有超时。解锁阶段不自动am start，不以Home重开替代。
- 记录锁屏前/后会话、新会话及同进程PID，使用实际S24省电开启场景；不改业务代码，不增加业务修复轮数，不构建、不全量测试、不提交推送。会话01M67ST1G9N1F0KBNM79A2N7S8。

- D034结果：同一PID27376连续运行，省电锁屏2649ms清除，正常解锁回App建立新会话，两项通过；无重启服务/重配对/Home/解锁阶段am start。返回可见resumed的Activity.1常亮，应用foreground=true。总26.25秒，省电恢复0，无清理错误。
- I010/debug003=verified，连续覆盖缺口关闭，业务轮次仍4/4。tester r16、fix r4、diagnosis r7、update summary r9；交用户验收及后续Spec流程，不自动归档或提交推送。


## D-035：按用户要求精简测试与调试证据（2026-10-31）

- 用户明确要求仅保留必要几个证据、清掉绝大部分产物。删除本Spec artifacts中812个原始文件，含全部截图，不留整包备份；从22份关键原记录原文汇总为4份JSON，保留来源路径与SHA256。另保留索引、清理回执及2个脚本/复测所需元数据，共8个文件。此前“原始记录全部保留”描述自本次清理起不再成立。
- 阶段基线、主要失败根因、聚焦修复、最终同服务真机通过证据保存在evidence/；历史结论不改，已删附件不再可回查。13份文档只修订附件导航/截图展示并标记清理，不改已确认设计。HTML没有指向删除文件的失效链接。
- 工作区919→113项；功能代码及测试脚本不变，不重测、不提交推送。会话01M67TG61ZXKE23JHZNSJX76SJ。清理回执evidence/cleanup-receipt.json。


## D-036：现状与文档一致性核对

- 按当前代码、D032–D035与精选证据核对；更新README/GOALS/协议/运行与复测指南/版本和Spec账本，修正等待真机、旧心跳、五分钟硬上限、生命周期受阻等过时入口。报告修订保留历史设计与结果。
- reviewer/review.html r1列出功能、代码位置与验证边界；本次静态核对，不重跑测试，不改业务代码，不扩大历史证据覆盖。手机真实换IP仍未测，断公网排除，媒体与OBS未实现。
- Spec2核心连接/授权信令及前台生命周期已实现，最终同服务真机连续验证通过；待用户验收及收尾，不归档、提交推送。会话01M67V077SAB9A6M0V2WTVT1Z5。


## D-037：事实核对由Agent负责

- 用户明确不应要求其确认代码/文档事实；发现不一致应直接修正文档。D036涉及的过时入口已更新，现状核对完成，不再等待用户确认事实。reviewer/review.html r2去除该门槛；不推定提交、推送或归档授权。


## D-038：Spec-end准备完成（待交付授权）

- 按用户要求进入spec-end，串行从现有角色文档收集经验。当前分支匹配，远程默认main，按项目既定流程PR目标dev。新鲜自动化回归Node43/JVM18零跳过/集成44通过；首次运行目录/CLI配置准备错误已纠正并复跑，未改业务。
- GOALS测试约束误识别的独立目标已改为普通说明。全项目仍3条后续依赖提示，2条历史completion_not_checked；当前Spec结构可准备，保留后续原计划。请求当前范围例外前不归档。
- ender/end-report.html r1含两条经验草稿、规范审查和交付清单，尚未写入记忆或暂存提交推送。会话01M67VES6XPST23JZ0MSED3N3A。


## D-039：用户批准原位归档与Git交付

- 用户明确确认范围例外、EXP003/004写入、原位归档、提交推送及创建向dev的PR；不合并。两条经验已落盘并更新索引，无新增AGENTS/rules修改。
- Spec目录原位保留，状态archived；全项目后续两个Spec及原依赖保留，3条未完成依赖提示获准仅就当前Spec作范围处置。AWR完工与Git交付进行中。会话01M67VX2DK83NDHEX7TYHDCPDH。

- D039交付：AWR六项验收机器核验成功、状态completed；PR #3已创建，base=dev，head=tech/spec-20261028-2248-offline-pairing，未合并。证据source_sha绑定实际实现提交1f9e67442b9ce5adc3bc9be8895eca8ede8d6735；之后仅文档/证据收尾amend，最终代码树另核对一致。
