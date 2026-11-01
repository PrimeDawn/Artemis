# Artemis

把手机变成电脑的摄像头和麦克风。

Artemis 计划通过原生安卓 App 采集视频与麦克风音频，在局域网内把画面与声音送到 Windows，并呈现为系统摄像头 `Artemis Camera` 与系统麦克风 `Artemis Microphone`。电脑侧提供本地配对与控制页面；OBS 只作为验收代表，不再是媒体接收端，音视频不由 Node.js 服务转码。

当前按 [v0.1 技术预研规划](spec/versions/v0.1/plan.html)推进。Spec2的自动发现、电脑单击选手机、首次允许后持久信任、无固定连接期限、自动恢复及授权信令已实现。真实S24已完成首次连接与控制流程，前台常亮、切App暂停/返回恢复及省电锁屏→正常解锁连续恢复均有通过记录。最新连续流程全程同一服务，锁屏2649ms清除旧会话、解锁建立新会话。当前已原位归档，PR #3（https://github.com/PrimeDawn/Artemis/pull/3）待审阅、未合并；手机真实换IP仍未测，实际断公网按用户要求不测，音视频采集、媒体WebRTC及OBS播放尚未实现。 最新使用方式见[运行说明](docs/pairing-local-run.md)，验证范围见[现状核对报告](spec/versions/v0.1/specs/20261029-0934-tech-离线配对与信令信任/reviewer/review.html)。

## 计划技术与目录

| 目录 | 职责 | 计划技术 |
| --- | --- | --- |
| `android/` | 安卓采集与推流 App | Kotlin、Jetpack Compose、原生 WebRTC SDK |
| `receiver/` | 电脑本地服务与控制页（配对、信任、连接状态） | Node.js、TypeScript、WebSocket |
| `protocol/` | 配对、状态与错误码约定 | 由离线配对与信令 Spec 确定 |
| `docs/` | 使用指南与维护文档 | Markdown |
| `spec/` | 版本计划、Spec、测试证据与项目记忆 | R&K Flow |

`android/` 与 `receiver/` 已有可构建工程；协议见 [pairing-v2.md](protocol/pairing-v2.md)。固定工具链见 [toolchain-lock.json](docs/toolchain-lock.json)，来源与许可证见 [依赖来源](docs/dependency-provenance.md)。

## 构建与运行

Windows 准备 JDK 17、Node 24、Android API 36 和 Build Tools 36.0.0，具体安装、许可和镜像切换见 [工具链复现指南](docs/toolchain.md)。

```powershell
# JAVA_HOME 与 ANDROID_HOME 指向本机 JDK 17 和 SDK；Android 用户目录、签名、Gradle 和临时目录也须指向 E 盘。
# 当前机器可先执行：. E:\Dev\Artemis\activate.ps1
.\android\gradlew.bat -p android --no-daemon clean :app:assembleDebug
npm --prefix receiver ci --ignore-scripts
npm --prefix receiver test
npm --prefix receiver start
```

上面的 start 仅启动原 loopback 健康服务。新入口使用 `npm --prefix receiver run pairing`，先按 [本地连接说明](docs/pairing-local-run.md)配置实际LAN地址、E盘私有数据目录及现有OpenSSL；它提供本机控制页与独立LAN TLS/WSS入口，Ctrl+C关闭。APK为 `android/app/build/outputs/apk/debug/app-debug.apk`，真机和正式集成以Spec测试报告为准。

## 研发工作流

项目采用 R&K Flow，主干为 `main`，日常集成为 `dev`，版本提测使用 `release/<version>`。

1. 用 `version-start` 规划版本，再用 `spec-start` 为具体需求创建设计、实现与验证闭环。
2. 长期规则保存在 `.agents/rules/`，中立角色定义保存在 `.agents/roles/`。
3. 项目目标和当前状态见 `GOALS.md`、`work-ledger.yaml`；业务进度不能从目录或初始化提交推断。

## 恢复本地工作流环境

规范库与运行时数据库不提交到项目仓库。首次克隆项目后，在 PowerShell 中执行：

```powershell
git clone --depth=1 https://github.com/HHU3637kr/skills.git .agents/skills
npm install --global @originoneai/agent-work-runtime@0.6.0 --ignore-scripts
New-Item -ItemType Junction -Path html-report -Target (Resolve-Path .agents/skills/html-report).Path
New-Item -ItemType Junction -Path .codex/skills -Target (Resolve-Path .agents/skills).Path
awr --project . init --manifest .awr/project.toml
# 核对来源映射后接受并重建本地索引：
awr --project . init --manifest .awr/project.toml --accept
awr --project . source reindex
awr --project . intake inspect --json
```

项目规则、中立角色与 Codex 适配已随项目版本化，无需重新生成。目录联接已存在时跳过对应命令；AWR 状态为本地数据，不等同于产品验收。

技能更新使用 `git -C .agents/skills pull --ff-only`，单一报告资产通过根目录 `html-report` 目录联接提供。
