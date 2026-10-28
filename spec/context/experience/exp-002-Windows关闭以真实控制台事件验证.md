---
id: EXP-002
title: Windows关闭以真实控制台事件验证
keywords: [Windows, Ctrl+C, Node.js, 控制台, 进程退出]
scenario: 验证Windows本地服务的真实信号处理、退出与资源释放
created: 2026-10-28
---

# Windows关闭以真实控制台事件验证

## 困境

PTY 传输 Ctrl+C 可能中断外层会话。强杀子进程或仅调用服务的 close 函数，也不能证明实际 CLI 收到信号后执行了正常关闭逻辑。

## 策略

1. 测试为自己的 Node CLI 创建隐藏独立控制台，避免影响用户终端。
2. 由独立发送进程只附着该测试控制台，调用 GenerateConsoleCtrlEvent 发送 CTRL_C_EVENT。
3. 联合断言应用输出 receiver_stopped、进程退出0、未触发强制清理。
4. 在进程退出后验证原端口能重新绑定，CLI 可以再次启动。
5. 保留信号发送结果、应用事件、退出码和超时审计；无法交付真实事件时明确记未实测，不冒充通过。

## 理由

信号交付、应用事件和操作系统资源释放分别证明生命周期的不同环节。联合观察可区分应用正常关闭和测试夹具事后清理。

该经验已在本次 Windows / Node24 组合验证；其它平台或控制台传输仍需各自实测。强制清理只用于回收测试自建进程，不能作为正常关闭证据。

## 相关文件

- [真实控制台测试](../../../tests/windows-cli-signal.py)
- [CLI集成测试](../../../tests/receiver-smoke.mjs)
- [本轮信号结果](../../versions/v0.1/specs/20261028-1059-tech-SDK与工具链可行性/tester/artifacts/test-logs/20261028-203139-closeout/receiver/signal-summary.json)
- [收尾报告](../../versions/v0.1/specs/20261028-1059-tech-SDK与工具链可行性/ender/end-report.html#memory-drafts)

## 参考

- Spec 决策 D-005、D-012；EXP-001 覆盖原生库页面布局，二者不互相替代。
