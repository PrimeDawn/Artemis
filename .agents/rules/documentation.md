# 文档规范

- 产品范围以 `产品规划.md` 为准；规划、已实现、已验证三种状态必须分清。
- 版本与 Spec 报告使用 HTML，遵循 `html-report` 的共享资产、骨架和可追溯修订规范。
- 账本可使用 Markdown 或 HTML；`spec/context/{experience,knowledge}` 保持 Markdown。
- Version 使用 vX.Y；Spec 使用 `YYYYMMDD-HHMM-属性-任务描述`。
- 报告元信息保留机器可读 meta 与 `.rk-meta` 镜像，包含版本、性质、角色与 Git 元数据。
- 文档关联双向维护；报告修订号递增，保留 ins/del 修订标记及原因。
- 样式与脚本引用根目录 `html-report/assets/` 单一源，不写内联样式或依赖外部 CDN。
- Spec 角色报告返回根目录使用 6 层相对路径；其它报告按实际目录计算。
- README 说明实际可用状态和环境恢复；详细设计写入 Spec，长期知识写入 knowledge。
