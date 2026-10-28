# Artemis

把安卓手机变成电脑的摄像头和麦克风，在局域网内将音视频同步传入 Windows 上的 OBS。

## 项目身份

- 技术栈：Kotlin、Jetpack Compose、原生 WebRTC；Node.js、TypeScript、WebSocket、浏览器 WebRTC API。
- 类型：安卓 App、Windows 本地接收服务与 OBS 接收网页共仓维护。
- 产品权威来源：`产品规划.md`。目前处于初始化阶段，尚未实现或验证音视频功能。
- 运行环境：Codex；中立角色权威定义位于 `.agents/roles/`。

## 工作方式

采用 R&K Flow / Spec 驱动开发，遵循「Project → Version → Spec」。新版本使用 `version-start`；具体需求通过 `spec-start` 开始，已有 Spec 的小迭代使用 `spec-update`。

## 详细规则入口

@import .agents/rules/
@import .agents/skills/

Codex 执行任务前应按任务范围直接读取对应规则与 Skill；导入语句也是目录路由，不假设运行时会自动展开。

## 目录路由

- `.agents/rules/`：长期规则与产品边界。
- `.agents/skills/`：独立 Git clone 的规范库；本地环境恢复步骤见 README。
- `.agents/roles/`：7 个中立角色定义；`.codex/agents/` 为项目 Codex 运行时适配。
- `spec/versions/`：版本与 Spec 交付空间。
- `spec/context/{experience,knowledge}/`：跨版本项目记忆。
- `产品规划.md`：产品目标、技术方向和验收目标。

AGENTS.md 保持精简；长期约束写入 `.agents/rules/`，设计与验证证据写入对应 Spec。
