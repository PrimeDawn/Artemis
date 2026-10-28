# AWR 运行时接入

- 使用 AWR 0.6.0；权威源由 `.awr/project.toml` 显式声明，数据库仅为本地投影。
- GOALS.md、work-ledger.yaml、AGENTS.md、项目规则和实际验证证据为权威来源。
- 初始化先预览来源映射，确认草稿后接受；`.awr/state.db` 及其它运行时状态不入库。
- 查看 `awr status` 接续进行中的工作，用 `awr ready` 查找尚未认领的候选工作。
- 开工须有工作项、有效 claim 与 session；prepare 绑定 session，ready 须先推进到 in_progress。
- 阶段完成记录 checkpoint；角色接力使用 resume，运行句柄落 Spec 账本。
- 完工按 acceptance 注册真实证据，执行 work complete 后由同一持有会话释放租约。
- 不将 ready、source_completed 或初始化成功表述为产品验收完成。
- 检查点辅助脚本位于 `scripts/rk-awr-checkpoint.{ps1,sh}`；调用前按实际 CLI help 核对参数。
- 完整生命周期参考 `.agents/skills/.agents/rules/awr-integration.md`；历史 0.5 示例与 0.6 CLI 不一致时以当前 CLI 为准。
