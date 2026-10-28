# Spec 工作流规范

- 遵循 Project → Version → Spec；每个 Spec 位于 `spec/versions/<version>/specs/<spec-dir>/`。
- 启动时明确所属版本与性质：feat、tech、debt、fix；使用 `spec-start`，已有 Spec 小迭代使用 `spec-update`。
- 默认 `mode: gated`、`execution: serial`；改变运行模式须经用户明确选择。
- 角色权威源是 `.agents/roles/`；TeamLead 调度 7 个角色，运行账本保存到 `lead/team-context.md`。
- 实现前须有已确认的 `writer/plan.html`；按阶段确认，不扩张计划外功能。
- 测试先行、根因优先、新鲜验证；不产生可观察行为的纯格式或注释改动按 Skill 例外处理。
- autopilot 也须保留机械证据；治理规则修改、主干改动、合并或 force push 等永远门禁按用户授权执行。
- 审阅报告前检索 `rk-note`，将批注、决策及问题闭环登记到账本。
- 收尾由 `spec-end` 原位归档；跨版本经验与知识沉淀到 `spec/context/`。
- 完整门禁、批注闭环和角色协议见 `.agents/skills/.agents/rules/spec-workflow.md` 与对应 Skill。
- 用户当前明确授权优先于项目规则；初始化请求已授权本次骨架、初始提交与私有远端建立。
