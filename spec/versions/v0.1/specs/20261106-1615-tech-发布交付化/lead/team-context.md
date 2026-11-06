---
type: team-context
schema_version: 1
team_name: spec-20261106-1615-发布交付化
spec_dir: spec/versions/v0.1/specs/20261106-1615-tech-发布交付化
task_description: 把 v0.1 从脚本启动的原型交付为可安装发布物：Windows 安装包（含 DirectShow 过滤器注册与运行依赖）+ 安卓 release APK、面向使用者重写 README、开发流程资产不进发布线
status: archived
phase: archived
runtime: generic
mode: gated
execution: serial
git_branch: tech/spec-20261106-1615-release-package
base_branch: dev
pr_url: https://github.com/PrimeDawn/Artemis/pull/9
created_at: 2026-11-06T16:20:00+08:00
updated_at: 2026-11-06T16:26:00+08:00
---

# 团队运行账本

## 当前运行路径

| 步骤 | 阶段 | 负责角色 | 动作 | 状态 | 产物 | 门禁 | 更新时间 |
|------|------|----------|------|------|------|------|----------|
| 1 | intent | TeamLead | 需求对齐（三步工作法） | done | 本文件 | gate-1 | 2026-11-06T16:22:00+08:00 |
| 2 | intent | TeamLead | 从 dev 创建 Spec 工作分支 | done | `tech/spec-20261106-1615-release-package` | - | 2026-11-06T16:21:00+08:00 |
| 3 | intent | TeamLead | 创建角色目录与导航树清单 | done | `rk-manifest.js` | - | 2026-11-06T16:21:00+08:00 |
| 4 | exploration | spec-explorer | 探索打包现状、依赖与安装器约束 | done | explorer/exploration-report.html | - | 2026-11-06T16:52:00+08:00 |
| 5 | spec-writing | spec-writer | 编写发布交付化方案 | done | writer/plan.html | gate-2 | 2026-11-06T16:31:00+08:00 |
| 6 | spec-writing | spec-tester | 编写发布验收测试计划 | done | tester/test-plan.html | gate-2 | 2026-11-06T16:35:00+08:00 |
| 7 | implementation | spec-executor | 实现 7 个任务（证书、托盘、安装器、导出、文档） | done | executor/summary.html | gate-3 | 2026-11-06T17:55:00+08:00 |
| 8 | implementation | spec-executor | 本机自检：单测、构建、安装/卸载 | done | executor/artifacts/ | gate-3 | 2026-11-06T17:55:00+08:00 |
| 9 | testing | spec-tester | 独立验证 14 条用例（含手机端到端录制） | done | tester/test-report.html | gate-4 | 2026-11-06T23:59:00+08:00 |
| 10 | ending | spec-ender | 全量测试、经验分流、归档报告 | done | ender/end-report.html | gate-5 | 2026-11-07T00:20:00+08:00 |

## 任务进度

> 共享维护区：各角色只追加或更新自己负责的任务行。

| 任务号 | 负责角色 | 任务 | 状态 | 产物 | 完成时间 | 更新者 |
|--------|----------|------|------|------|----------|--------|
| T-001 | spec-explorer | 探索打包现状、依赖与安装器约束 | done | explorer/exploration-report.html | 2026-11-06T16:52:00+08:00 | spec-explorer |
| T-002 | spec-writer | 编写发布交付化方案 | done | writer/plan.html | 2026-11-06T16:31:00+08:00 | spec-writer |
| T-003 | spec-tester | 编写发布验收测试计划 | done | tester/test-plan.html | 2026-11-06T16:35:00+08:00 | spec-tester |
| T-004 | spec-executor | 实现安装包、APK、README 与发布线导出 | done | executor/summary.html | 2026-11-06T17:55:00+08:00 | spec-executor |
| T-005 | spec-tester | 独立验证安装与采集链路 | done | tester/test-report.html | 2026-11-06T18:35:00+08:00 | spec-tester |
| T-006 | spec-ender | 收尾归档与 PR | done（归档完成，提交/PR 待放行） | ender/end-report.html | 2026-11-07T00:20:00+08:00 | spec-ender |

## 问题闭环记录

> 共享维护区：发现或解决问题的角色只追加或更新自己相关的问题行。

| 问题号 | 分类 | 发现者 | 负责角色 | 问题 | 解决方案 | 关联产物 | 状态 | 更新者 |
|--------|------|--------|----------|------|----------|----------|------|--------|
| I-001 | env | TeamLead | spec-executor | 本机未安装 Inno Setup 6（`C:\Program Files (x86)\Inno Setup 6\ISCC.exe` 不存在） | 待确认安装目录与空间后按 portable 方式装到 `E:\Dev\Artemis\tools`；见 Q-001 | 本文件 Q-001 | open | TeamLead |
| I-002 | dependency | spec-explorer | spec-executor | 启动链路依赖 PATH 中的 `node` 与 `openssl.exe`，用户机器两者都没有；且本机 openssl 是 Git for Windows 的 MSYS 构建，不能直接随包搬 | 安装包自带 node 运行时与独立 Win64 OpenSSL，启动脚本改为显式路径；见 Q-005 | explorer/exploration-report.html §3、§4 | open | spec-explorer |
| I-003 | scope | spec-explorer | spec-writer | README 承诺系统麦克风 `Artemis Microphone`，与 D-012「不自研驱动、音频只输出到 VB-CABLE」冲突；`docs/pairing-local-run.md` 三处仍写「麦克风尚未实现」 | README 重写时改为「写到 CABLE Input、在 OBS 选 CABLE Output」的口径 | explorer/exploration-report.html §6 | open | spec-explorer |
| I-004 | process | spec-explorer | TeamLead | `tools/start-artemis.ps1:2` 注释把「托盘常驻程序」推给打包阶段，但从未登记为需求 | 交用户拍板启动形态；见 Q-006 | explorer/exploration-report.html §5 | open | spec-explorer |
| I-005 | bug | spec-executor | `npm --prefix receiver test` 永不退出：`media-relay.ts` 的保活 `setInterval` 未 unref，单测里没有其它句柄 | 定时器加 `unref()`；撤销上一轮用 `--test-force-exit` 的绕过（该参数在 Windows 上会触发 libuv 断言） | receiver/src/media-relay.ts:98 | closed | spec-executor |
| I-006 | bug | spec-executor | 托盘被强杀后 `artemis-decode-host.exe` 残留，占住共享内存与音频设备 | 两个子进程加入同一 Job Object（KILL_ON_JOB_CLOSE），实测强杀后残留 0 | native/tray/ProcessManager.cpp | closed | spec-executor |
| I-007 | bug | spec-executor | `--selftest` 选中 198.18.0.1（Clash/WARP 网段），接收服务只接受 RFC1918 地址导致启动即 E_CONFIG | 三级回退：默认路由网卡的私有地址 → 任意网卡私有地址 → 默认路由地址 | native/tray/NetworkAddress.cpp | closed | spec-executor |
| I-008 | bug | spec-executor | 干净账户下 `%LOCALAPPDATA%\Artemis` 不存在，`CreateDirectoryW` 因父目录缺失失败 | 改用 `SHCreateDirectoryExW` 逐级创建 | native/tray/ProcessManager.cpp | closed | spec-executor |
| I-009 | env | spec-executor | 仓库内 `dist\` 目录带沙箱写入的 `Everyone:(CI)(DENY)(DC)` 继承 ACE，Inno 加载器在该目录下无法解包（`is-XXXX.tmp` 创建失败，退出码 1） | 同一 exe 放到 `%TEMP%` 正常；安装验证改从 `%TEMP%` 副本执行，并记入 summary §4。用户从 Release 下载的文件不带该 ACL | executor/artifacts/install-verify.log | closed | spec-executor |
| I-010 | env | spec-tester | Smart App Control 进入强制模式后，`Start-Process`(CreateProcess) 启动本 Spec 新构建的未签名 exe/安装包一律被拦截（事件 3077/3033，Policy `{0283ac0f-…}`）；`cmd /c start`(ShellExecute) 可绕过 | 记录为环境阻断：TC-02/03/04/10/13 与 OBS 采集无法在本机稳定复现；需用户决定是否关闭 SAC 后补测 | tester/artifacts/test-logs/20261106-1810/ | open | spec-tester |
| I-011 | bug | spec-tester | TC-09 卸载后残留 `Artemis.exe`、`node.exe`、`decode-host.exe` 与 4 个 FFmpeg DLL（CLSID 已正确删除） | 根因：Inno `[UninstallRun]` 在删文件之后才跑 `taskkill`。改为 `[Code] CurUninstallStepChanged(usUninstall)` 先停进程、等待 1.5s 再反注册；复测残留 0 | tester/artifacts/test-logs/20261106-1810/tc09-uninstall-running-retest.log | closed | spec-tester |
| I-012 | bug | spec-tester | TC-10 端口被占用时无可读提示，只留「a service exited unexpectedly」，且中文 stderr 变问号 | 启动前 Winsock 独占绑定探测 3000/3443/3450，命中即写可读原因到 `tray.log` 与 stderr；stderr 改 UTF-8。复测通过 | tester/artifacts/test-logs/20261106-1810/tc10-port-conflict-retest.log | closed | spec-tester |
| I-013 | bug | spec-tester | 控制页响应已发出后再次写头 → `ERR_HTTP_HEADERS_SENT` 未捕获，整个接收服务进程退出（用户侧表现为「服务莫名重启、控制页偶发打不开」） | `json()` 与 catch 分支先判断 `res.headersSent`；新增回归用例（日志回调抛错场景），67 项单测通过 | tester/artifacts/test-logs/20261106-1810/tc08b-obs-recording.log；receiver/test/control-http.test.ts | closed | spec-tester |
| I-014 | bug | spec-tester | 托盘在 GUI 模式下不落子进程输出，失败时只有一句「service exited」，无法排障 | `CreateProcessW` 时把子进程 stdout/stderr 重定向到 `logs\receiver.log` 与 `logs\decode-host.log` | tester/artifacts/test-logs/20261106-1810/ | closed | spec-tester |
| I-015 | env | spec-tester | 加图标后重新构建的 `artemis-decode-host.exe` 被 Code Integrity 拦截：`CreateProcessW` 返回 4551（`ERROR_SYSTEM_INTEGRITY_POLICY_VIOLATION`），服务起不来 | 与 I-010 同源（CI/SAC 按文件信誉判定，新构建即被拦）；图标构建的功能代码与已全通过的上一构建一致，差异仅为图标资源与清单字段。待 CI 放行后复验 | spec/versions/v0.1/specs/20261106-1615-tech-发布交付化/executor/artifacts/ | open | spec-tester |
| I-016 | bug | spec-tester | 托盘没有单实例保护：同时启动两个 `Artemis.exe` 时，第二个抢不到 3000 端口，按 60 秒一轮重试并**每轮弹一次**「端口被占用」通知，用户侧表现为「一直弹窗报错」 | ①`CreateMutexW(Local\ArtemisTraySingleton)` 单实例守卫，重复启动直接把控制页调出来并退出；②启动失败只提示一次（`failureNotified`），之后静默重试 | native/tray/main.cpp、native/tray/TrayApp.cpp；实测第二个实例 exit=0、实例数=1 | closed | spec-tester |

## 决策记录

> 共享维护区：任何角色遇到需要用户或角色拍板的岔路口，落一行。

| 决策号 | 阶段 | 提出者 | 议题 | 候选项 | 结论 | 理由 | 拍板者 | 决策时间 | 依据 |
|--------|------|--------|------|--------|------|------|--------|----------|------|
| D-001 | intent | TeamLead | 开发流程资产如何移出发布仓库 | A 拆开发仓+发布仓并单向导出 / B 单仓库、main 改孤儿历史 / C 挪到仓库外本地目录 / D 提交时不带 spec 目录 | D：单仓库；`dev` 全量保留流程资产，发布线（导出树 / `main` 与 GitHub Release 资产）只含产品子树，`spec/`、`.agents/`、`.codex/` 永不进发布线 | 用户否决 A/B/C 的复杂度，认为只需发版时不把 spec 目录带上去；不新建仓库、不做双向同步 | user | 2026-11-06T16:18:00+08:00 | 用户原话「不就是到时候提交的时候不提交spec目录吗，整这么麻烦干什么？」 |
| D-002 | intent | TeamLead | Windows 安装器技术选型 | A Inno Setup / B WiX+MSI / C NSIS 或 Velopack | A Inno Setup 6 | 免费、单 exe、原生支持 `regsvr32` 注册过滤器与提权、卸载反注册，脚本化程度最高 | user | 2026-11-06T16:16:00+08:00 | 用户在 gate-1 问答中选择「Inno Setup（推荐）」 |
| D-003 | intent | TeamLead | 安装包由谁构建 | A 本地脚本一键构建 / B GitHub Actions / C 两者 | A 本地脚本 | 无外部依赖、验收链路最短；本 Spec 不引入 CI | user | 2026-11-06T16:16:00+08:00 | 用户在 gate-1 问答中选择「本地脚本一键构建（推荐）」 |
| D-004 | intent | TeamLead | 安装包验收环境 | A 本机卸载后全新安装 / B 装到独立目录 / C 只做静态校验 | A 本机卸载后全新安装 | 最接近真实用户路径，可同时验证注册、启动、录制与卸载回滚；会改动本机现有开发环境 | user | 2026-11-06T16:16:00+08:00 | 用户在 gate-1 问答中选择「本机卸载后全新安装验证（推荐）」 |
| D-005 | intent | TeamLead | 分发渠道与安装包体积 | A GitHub Releases 附件 / B 自建下载页 / C 另建发布仓库 | A GitHub Releases 附件 | 仓库自带 Release 页面即可承载 exe 与 apk；`avcodec-63.dll` 等 FFmpeg DLL 合计约 150–200 MB，用户明确表示不算大，不裁剪 | user | 2026-11-06T16:24:00+08:00 | 用户原话「这个安装包不算大，最终的发布走的是github仓库自带的release页面」 |
| D-006 | intent | TeamLead | 运行模式与执行方式 | A gated + serial / B autopilot / C swarm | A | 项目默认；本 Spec 无并发角色需求 | TeamLead | 2026-11-06T16:22:00+08:00 | `.agents/rules/spec-workflow.md` 默认 gated；前序 Spec 均为 serial |
| D-007 | intent | TeamLead | 运行时签发证书怎么摆脱外部程序 | A 随包独立 OpenSSL / B 纯 JS 在 Node 内签发 / C 要求用户自备 Git | B：用 `@peculiar/x509` 在 Node 内构造自签 X.509，保留 P-256、IP SAN、30 天、同钥续签语义；删除 `ARTEMIS_OPENSSL_PATH` 与 openssl 探测 | 用户追问「安装包为什么需要这个，还需要 git？」，确认 Git 只是开发机碰巧有 openssl 的地方；外部程序依赖应当消除而不是随包固化 | user | 2026-11-06T16:30:00+08:00 | 用户原话「所以安装包为什么需要这个，还需要git？」；`receiver/src/identity.ts:25` 证据 |
| D-008 | intent | TeamLead | 装完用户怎么启动 | A 控制台窗口 / B PowerShell+WinForms 托盘 / C 独立托盘 exe | C 独立托盘 exe，但只做进程管家 + 控制页入口：不含设置面板、不含开机自启 | 用户选择独立托盘 exe；职责收窄以保证范围可控 | user | 2026-11-06T16:30:00+08:00 | 用户在 gate-1 后续问答中选择「写一个独立托盘 exe」与「只做进程管家 + 控制页入口」 |
| D-009 | intent | TeamLead | 托盘可执行文件叫什么 | A ArtemisTray.exe（原稿）/ B Artemis.exe | B：可执行文件与安装器入口统一叫 `Artemis.exe` | 用户要求「干净一点叫 Artemis」，托盘只是名字里的实现细节，不该出现在产品名上 | user | 2026-11-06T16:42:00+08:00 | 用户原话「那个exe必须叫ArtemisTray.exe吗？干净一点叫Artemis不行吗？」 |
| D-010 | intent | TeamLead | 发布物用哪个开源许可证 | A MIT / B Apache-2.0 / C GPL-3.0 | A MIT | 用户选定；与随包分发 FFmpeg（独立进程调用、按 GPL 单独声明）不冲突 | user | 2026-11-06T16:42:00+08:00 | 用户在 gate-2 问答中选择「MIT」 |
| D-011 | implementation | spec-executor | `licenses/FFmpeg-GPL.txt` 是提交进仓库还是构建时生成 | 构建时从 FFmpeg 发行包 `LICENSE.txt` 复制，仓库只提交 `THIRD-PARTY.md` | 许可证原文属于上游产物，手工入库容易与随包版本不一致；由构建步骤取当前实际使用的构建，分发义务才对应得上 | spec-executor | 2026-11-06T17:50:00+08:00 | `scripts/build-release.ps1` 的 FFmpeg 许可证步骤；plan §5 任务 5 文件清单 |
| D-012 | implementation | spec-executor | stage 里的 `node_modules` 是否包含 devDependencies | 只装生产依赖（stage 内 `npm ci --omit=dev`） | 安装包从 66.4 MB 降到 63.4 MB，且不把 typescript/@types 这类构建期包发给用户 | spec-executor | 2026-11-06T17:48:00+08:00 | 两次构建产物体积对比见 executor/artifacts/build-release.log |
| D-013 | implementation | spec-executor | `Artemis.exe` 用控制台子系统还是 GUI 子系统 | `/SUBSYSTEM:WINDOWS` + `wWinMain`，`--selftest`/`--console` 时按需 `AttachConsole` | 控制台子系统双击会闪黑框；纯 GUI 又拿不到 stdout。按需附加两者兼得 | spec-executor | 2026-11-06T17:20:00+08:00 | native/tray/main.cpp:36-44 |
| D-014 | 收尾前 | user | 是否给托盘、安装包与 APK 加图标 | 采用 `C:\MISC\Artemis-icons` 提供的资源：`Artemis.ico`（exe/安装器）、`Artemis-tray.ico`（托盘）、Android 自适应图标（`artemis_eye.xml` + `ic_artemis.xml` + `artemis_colors.xml`） | 用户明确要求「把图标什么的都加上」；之前托盘用系统默认图标，混在托盘里无法辨认 | user | 2026-11-06T23:50:00+08:00 | 用户原话「C:\\MISC\\Artemis-icons 把图标什么的都加上吧」 |

## 角色运行句柄

| 角色 id | 适配层 | 运行时角色名 | agent_id | thread_id | session_id | 状态 | 续接方式 | 累计参与 Spec 数 | 最近产物 | 更新时间 |
|---------|--------|--------------|----------|-----------|------------|------|----------|------------------|----------|----------|
| spec-explorer | .agents/roles | 串行承担 | - | - | - | running | respawn+rebuild | 8 | explorer/exploration-report.html | 2026-11-06T16:26:00+08:00 |
| spec-writer | .agents/roles | 串行承担 | - | - | - | idle | respawn+rebuild | 8 | writer/plan.html | 2026-11-06T16:26:00+08:00 |
| spec-tester | .agents/roles | 串行承担 | - | - | - | idle | respawn+rebuild | 9 | tester/test-plan.html | 2026-11-06T16:26:00+08:00 |
| spec-executor | .agents/roles | 串行承担 | - | - | - | idle | respawn+rebuild | 7 | executor/summary.html | 2026-11-06T16:26:00+08:00 |
| spec-debugger | .agents/roles | 串行承担 | - | - | - | idle | respawn+rebuild | 7 | debugger/debug-*.html | 2026-11-06T16:26:00+08:00 |
| spec-reviewer | .agents/roles | 串行承担 | - | - | - | idle | respawn+rebuild | 5 | reviewer/review.html | 2026-11-06T16:26:00+08:00 |
| spec-ender | .agents/roles | 串行承担 | - | - | - | idle | respawn+rebuild | 7 | ender/end-report.html | 2026-11-06T16:26:00+08:00 |

## 产物注册表

| 产物 | 负责角色 | 状态 | 已确认 | 更新时间 |
|------|----------|------|--------|----------|
| rk-manifest.js | TeamLead | done | yes | 2026-11-06T16:52:00+08:00 |
| explorer/exploration-report.html | spec-explorer | done (r1) | no | 2026-11-06T16:52:00+08:00 |
| writer/plan.html | spec-writer | done (r1) | no | 2026-11-06T16:31:00+08:00 |
| tester/test-plan.html | spec-tester | done (r1) | no | 2026-11-06T16:35:00+08:00 |
| executor/summary.html | spec-executor | done (r1) | no | 2026-11-06T17:55:00+08:00 |
| tester/test-report.html | spec-tester | done (r1) | no | 2026-11-06T18:35:00+08:00 |
| ender/end-report.html | spec-ender | done (r1) | no | 2026-11-07T00:20:00+08:00 |

## 门禁决策

| 门禁 | 确认对象 | 决策 | 判定方式 | 决策时间 | 备注 |
|------|----------|------|----------|----------|------|
| gate-1 | 需求对齐 | pass | user | 2026-11-06T16:24:00+08:00 | 用户先定安装器/构建/验收三项，再以「发布走 GitHub Releases、体积不算大」放行；移出方式按 D-001 简化 |
| gate-2 | writer/plan.html + tester/test-plan.html | pending | user | | |
| gate-3 | executor/summary.html | pass | user | 2026-11-06T18:06:00+08:00 | 用户选择「确认，进入测试」 |
| gate-4 | tester/test-report.html | pass | user | 2026-11-07T00:00:00+08:00 | 用户选择「确认，开始收尾」；此前要求先清理本机环境 |
| gate-5 | ender/end-report.html（归档+PR） | pass | user | 2026-11-07T00:12:00+08:00 | 用户放行提交/推送/PR；已推送并创建 PR #9 |

## 角色交接

| 来源角色 | 接收角色 | 交接原因 | 产物 | 状态 | 更新时间 |
|----------|----------|----------|------|------|----------|
| TeamLead | spec-explorer | gate-1 通过，开始阶段二探索 | 本文件 | done | 2026-11-06T16:26:00+08:00 |

## 修复循环预算

| 循环 | 最大轮数 | 最大无进展轮数 | 已用轮数 | 连续无进展 | 状态 | 用户已确认 | 更新时间 |
|------|----------|----------------|----------|------------|------|------------|----------|
| test-debug | 待确认 | 待确认 | 0 | 0 | not-started | no | |

## 开放问题与阻塞

| 编号 | 负责角色 | 问题或阻塞 | 状态 | 解决情况 |
|------|----------|------------|------|----------|
| Q-001 | spec-executor | Inno Setup 6 本机未安装 | closed | 已装 6.7.4（官方签名安装包）到 `C:\DEV\ArtemisEnv\artemis-tools\inno-setup`；本机无 E 盘，改放现有 SDK 同级的 `C:\DEV\ArtemisEnv` 下 |
| Q-002 | spec-writer | 「发布线」的具体落地形态待定：`main` 分支导出 vs `dist/` 产物 + Release 附件；影响验收与后续发版操作 | closed | 探索确认两者不冲突：`dist/` 出安装包，GitHub Release 挂附件；`main` 只需在产品发版时由导出脚本承接（见探索报告 §7）。本 Spec 只产出导出脚本与自动化，不实际切 `main` |
| Q-003 | spec-tester | 安装验收需先卸载现有开发版（反注册 `ArtemisCamera.dll`、清 `%LOCALAPPDATA%\Artemis\data`），会中断当前可用环境 | open | 测试计划中写明顺序：先备份数据与注册信息，再卸载 |
| Q-004 | spec-explorer | 音频在没有 VB-CABLE 的验收机上无法验证出声（D-012/D-013） | closed | 验收只验「未装声卡时明确提示且视频不受影响」，真实出声留 v0.1.1；探索报告 §8 已列为 tester 边界 |
| Q-005 | TeamLead | openssl 怎么随包：A 随包独立 OpenSSL / B 纯 JS 生成 / C 要求用户自备 Git | closed | 按 D-007 取 B：纯 JS 签发，外部依赖彻底消除 |
| Q-006 | TeamLead | 安装后的启动形态：控制台窗口 / PowerShell+WinForms 托盘 / 独立托盘 exe | closed | 按 D-008 取独立托盘 exe，职责限于进程管家与控制页入口 |
| Q-007 | spec-writer | 仓库没有 LICENSE 文件，而发版必须有；许可证选型只能由用户决定 | closed | 按 D-010 定为 MIT：根目录新增 `LICENSE`，README 加许可节，`licenses/` 保留 FFmpeg 的 GPL 文本 |

## 下一步动作

- gate-3 已放行（用户「确认，进入测试」）。阶段四执行完成：14 条用例全部通过（0 失败 / 0 未实测），`tester/test-report.html` 已到 r2，等待 gate-4 用户确认。
- 测试期间发现并修复 3 个真实缺陷：I-011（卸载残留被占用的可执行文件）、I-012（端口占用无可读提示）、I-013（控制页重复写头导致接收服务崩溃）；另修 I-014（托盘不落子进程日志）。全部复测通过。
- 手机接入后 TC-08b 已补测通过：OBS 经 obs-websocket 建 dshow 源，录制 11.97 秒 / 1280×720 / 30fps / YAVG 65.4（非黑）。全部 14 条用例通过、0 未实测。\n- 仍未覆盖：音频真实出声（D-013 排入 v0.1.1）。
- 确认后进入阶段五：spec-ender 收尾归档，届时需用户放行提交/推送/PR。