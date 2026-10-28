# 编码风格

- Kotlin 遵循官方命名约定；类型用 PascalCase，函数和变量用 lowerCamelCase，常量用 UPPER_SNAKE_CASE。
- TypeScript 开启严格类型检查；变量和函数用 camelCase，类型与组件用 PascalCase。
- 相机、音频、连接与界面状态分离；采集和编码不得阻塞 UI 线程。
- 函数保持单一职责；仅为关键约束和非显然逻辑写注释。
- 依赖版本由技术预研验证后锁定，不引入未经验证的 WebRTC AAR。
- 改动只覆盖当前 Spec 范围，避免无关格式化。
