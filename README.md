# Artemis

把手机变成电脑的摄像头和麦克风。

Artemis 计划通过原生安卓 App 采集视频与麦克风音频，在局域网内把画面与声音送到 Windows，并呈现为系统摄像头 `Artemis Camera` 与系统麦克风 `Artemis Microphone`。电脑侧提供本地配对与控制页面；OBS 只作为验收代表，不再是媒体接收端，音视频不由 Node.js 服务转码。

当前按 [v0.1 技术预研规划](spec/versions/v0.1/plan.html)推进。工具链、配对/信令、应用层改造、系统摄像头设备层、手机画面链路已交付并合入 dev；真机 S24 的相机画面已能以 720p30 出现在 OBS 的 `Artemis Camera`。音频采集、`Artemis Microphone` 与真机验证基线尚未完成，端到端延迟未实测。手机真实换 IP 未测，实际断公网按用户要求不测。使用方式见[运行说明](docs/pairing-local-run.md)，验证范围以各 Spec 测试报告为准。

## 计划技术与目录

| 目录 | 职责 | 计划技术 |
| --- | --- | --- |
| `android/` | 安卓采集 App | Kotlin、Jetpack Compose、Camera2、MediaCodec（H.264） |
| `receiver/` | 电脑本地服务与控制页（配对、信任、连接状态） | Node.js、TypeScript、WebSocket；媒体只转发不转码 |
| `native/` | Windows 系统摄像头过滤器与 FFmpeg 解码进程 | C++、DirectShow、FFmpeg |
| `protocol/` | 配对、状态、错误码与媒体帧头约定 | 见 `pairing-v2.md` |
| `docs/` | 使用指南与维护文档 | Markdown |
| `spec/` | 版本计划、Spec、测试证据与项目记忆 | R&K Flow |

`android/` 与 `receiver/` 已有可构建工程；协议见 [pairing-v2.md](protocol/pairing-v2.md)（含媒体通道）。固定工具链见 [toolchain-lock.json](docs/toolchain-lock.json)，来源与许可证见 [依赖来源](docs/dependency-provenance.md)。

## 构建与运行

Windows 准备 JDK 17、Node 24、Android API 36 和 Build Tools 36.0.0；原生端另需 VS Build Tools（MSVC）与 FFmpeg 开发库。具体安装、许可和镜像切换见 [工具链复现指南](docs/toolchain.md)。

```powershell
# JAVA_HOME / ANDROID_HOME 按本机实际路径设置（构建工具链不随仓库携带）。
.\android\gradlew.bat -p android --no-daemon clean :app:assembleDebug
npm --prefix receiver ci --ignore-scripts
npm --prefix receiver test
.\native\build.ps1                 # 需 VS Build Tools 与 FFmpeg 开发库
.\native\register.ps1 register     # 逐用户注册 Artemis Camera，无需管理员
Start-Artemis.cmd                  # 拉起解码进程 + 接收服务 + 打开控制页
```

`Start-Artemis.cmd` 是当前唯一同时启动解码进程与接收服务的入口；单独执行 `npm --prefix receiver run pairing` 只提供配对与控制，`/media` 没有本机解码进程可转发，OBS 不会出现手机画面。手工启动接收服务时，按 [本地连接说明](docs/pairing-local-run.md)配置实际 LAN 地址、私有数据目录与 OpenSSL。APK 为 `android/app/build/outputs/apk/debug/app-debug.apk`；真机与集成结果以 Spec 测试报告为准。

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
