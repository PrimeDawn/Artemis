# Version 版本工作流规范

- Version 统筹交付，Spec 为研发原子闭环；目录为 `spec/versions/<version>/`。
- 版本包含 version-context.md、plan.html、specs/、releases/ 与收尾 end-report.html。
- feat、tech、debt、fix 四类需求平权；项目记忆跨版本共享。
- 状态为规划中 → 执行中 → 验收中 → 已发布 → 已归档，原位归档不移动目录。
- 使用 version-start 规划、version-update 调整范围、version-release 验收发版、version-end 交付收尾。
- 尚未验证的产品能力不得因版本规划、初始化提交或空目录而记为完成。
