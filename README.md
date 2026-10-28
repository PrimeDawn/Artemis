# Artemis

把手机变成电脑的摄像头和麦克风。

Artemis 计划通过原生安卓 App 采集视频与麦克风音频，在局域网内通过 WebRTC 传入 Windows 上的 OBS 浏览器源。电脑侧提供本地配对、信令和控制页面，音视频不由 Node.js 服务转码。

当前按 [v0.1 技术预研规划](spec/versions/v0.1/plan.html)建立首个工具链工程：Android 静态验证页与本机健康检查服务。音视频采集、配对和 OBS 接收仍未实现。范围和验收目标见 [产品规划](产品规划.md)；版本状态以 [运行账本](spec/versions/v0.1/version-context.md) 为准。

## 计划技术与目录

| 目录 | 职责 | 计划技术 |
| --- | --- | --- |
| `android/` | 安卓采集与推流 App | Kotlin、Jetpack Compose、原生 WebRTC SDK |
| `receiver/` | 电脑本地服务、控制页与 OBS 接收页 | Node.js、TypeScript、WebSocket、浏览器 WebRTC API |
| `protocol/` | 配对、信令、状态与错误码约定 | 由离线配对与信令 Spec 确定 |
| `docs/` | 使用指南与维护文档 | Markdown |
| `spec/` | 版本计划、Spec、测试证据与项目记忆 | R&K Flow |

`android/` 与 `receiver/` 已有最小工程；`protocol/` 尚未建立。固定工具链见 [toolchain-lock.json](docs/toolchain-lock.json)，来源与许可证见 [依赖来源](docs/dependency-provenance.md)。

## 构建与运行

Windows 准备 JDK 17、Node 24、Android API 36 和 Build Tools 36.0.0，具体安装、许可和镜像切换见 [工具链复现指南](docs/toolchain.md)。

```powershell
# JAVA_HOME 与 ANDROID_HOME 指向本机 JDK 17 和 SDK；不提交个人路径。
.\android\gradlew.bat -p android --no-daemon clean :app:assembleDebug
npm --prefix receiver ci --ignore-scripts
npm --prefix receiver test
npm --prefix receiver start
```

PC 服务仅监听 `127.0.0.1:3000`，`GET /healthz` 用于检查进程可用性；Ctrl+C 关闭。它还不能接收手机媒体。Android 构建产物为 `android/app/build/outputs/apk/debug/app-debug.apk`；设备运行与正式集成结果以当前 Spec 测试报告为准。

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
