---
id: EXP-001
title: RELRO按实际保护范围判断
keywords: [Android, 16KB, ELF, GNU_RELRO, PT_LOAD]
scenario: 引入或升级Android原生依赖，检查最终APK的16KB静态兼容性
created: 2026-10-28
---

# RELRO按实际保护范围判断

## 困境

原生库检查若只要求 GNU_RELRO 末端能被16KB整除，会误拒绝覆盖完整独立 PT_LOAD、且末端包含填充的布局；只看 PT_LOAD 对齐又会漏掉保护范围覆盖其它可写数据的风险。

## 策略

1. 对64位 ELF 校验 PT_LOAD 对齐以及文件偏移与虚拟地址的一致性。
2. 按页面边界计算 RELRO 实际保护起止，识别从相同起点覆盖完整独立 LOAD 的布局。
3. 允许独立 LOAD 及安全填充；保护范围与其它可写 LOAD 相交时拒绝通过。
4. 保留普通对齐、共享段末端不齐、独立段、安全填充和越界覆盖的回归用例。
5. 对最终 APK 另外运行 ZIP 对齐检查，并在实际16KB环境运行 JNI；静态结果不能代替运行结论。

## 理由

只读保护落到页面范围，是否误保护可写数据取决于段布局与边界。分开验证 ELF、APK 打包和设备加载，能够避免单一静态判据造成误报或过度兼容声明。

本 Spec 的8个原生库静态检查、9项校验器测试及实际16384字节页面模拟器 JNI 均通过；结论只覆盖记录的依赖和 APK。

## 相关文件

- [校验器](../../../scripts/verify-native-libs.py)
- [回归测试](../../../scripts/tests/test_verify_native_libs.py)
- [收尾报告](../../versions/v0.1/specs/20261028-1059-tech-SDK与工具链可行性/ender/end-report.html#memory-drafts)
- [原始实现证据](../../versions/v0.1/specs/20261028-1059-tech-SDK与工具链可行性/executor/artifacts/tdd/)

## 参考

- Spec 决策 D-010；与 EXP-002 分别覆盖二进制布局和进程生命周期。
