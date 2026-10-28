# Artemis

把手机变成电脑的摄像头和麦克风。

Artemis 计划通过原生安卓 App 采集视频与麦克风音频，在局域网内通过 WebRTC 传入 Windows 上的 OBS 浏览器源。电脑侧提供本地配对、信令和控制页面，音视频不由 Node.js 服务转码。

当前仅完成产品规划与研发工作流初始化，尚无可运行的 App、接收服务或经过验证的音视频链路。范围和验收目标见 [产品规划](产品规划.md)。

## 计划技术与目录

| 目录 | 职责 | 计划技术 |
| --- | --- | --- |
| `android/` | 安卓采集与推流 App | Kotlin、Jetpack Compose、原生 WebRTC SDK |
| `receiver/` | 电脑本地服务、控制页与 OBS 接收页 | Node.js、TypeScript、WebSocket、浏览器 WebRTC API |
| `protocol/` | 配对、信令、状态与错误码约定 | 由首个技术 Spec 确定 |
| `docs/` | 使用指南与维护文档 | Markdown |
| `spec/` | 版本计划、Spec、测试证据与项目记忆 | R&K Flow |

前三个业务模块及开发工具链将在技术预研与基础工程阶段建立；依赖版本尚未锁定。

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
