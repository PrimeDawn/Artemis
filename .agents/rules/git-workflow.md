# Git 工作流

- 主干为 `main`，日常开发集成为 `dev`；远端为 `PrimeDawn/Artemis` 私有 GitHub 仓库。
- 新 Spec 从 dev 创建 `<type>/spec-<slug>`，通过 PR 合入 dev。
- 提测从 dev 创建 `release/<version>`，冻结后仅合入经验证的 fix 分支。
- 发版通过 PR 合入 main，打 `vX.Y.Z` Tag，并将发布修复回流 dev。
- 热修从已发布 Tag 创建 `hotfix/*`，验证后回流 main、dev 和在研版本。
- 版本收尾提交复盘，清理临时 release 分支和对应 worktree；保留发布 Tag。
- 禁止提交凭据、签名密钥、个人机器路径、运行时数据库与构建产物。
- `.agents/skills/` 独立 clone，不作为父项目嵌套仓库提交；报告联接和运行时状态保持本地。
- 项目 Codex 角色与配置随源码版本化；`.codex/skills` 联接不入库。
