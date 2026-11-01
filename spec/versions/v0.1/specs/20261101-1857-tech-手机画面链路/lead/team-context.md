---
type: team-context
schema_version: 1
team_name: spec-20261101-1857-手机画面链路
spec_dir: spec/versions/v0.1/specs/20261101-1857-tech-手机画面链路
task_description: 手机 Camera2 采集 + MediaCodec 编码 H.264，经 TCP 传到 PC，FFmpeg 解码后写入共享内存，让 OBS 的 Artemis Camera 显示手机实时画面
status: archived
phase: archived
runtime: generic
mode: gated
execution: serial
git_branch: tech/spec-20261101-1857-phone-media
base_branch: dev
pr_url: https://github.com/PrimeDawn/Artemis/pull/6
created_at: 2026-11-01T18:57:00+08:00
updated_at: 2026-11-01T18:57:00+08:00
---

# 团队运行账本

## 当前运行路径

| 步骤 | 阶段 | 负责角色 | 动作 | 状态 | 产物 | 门禁 | 更新时间 |
|------|------|----------|------|------|------|------|----------|
| 1 | intent | TeamLead | 需求对齐与参考实现调研 | done | 本文件 | gate-1 | 2026-11-01T18:57:00+08:00 |
| 2 | intent | TeamLead | 创建分支与目录 | done | `tech/spec-20261101-1857-phone-media` | - | 2026-11-01T18:57:00+08:00 |
| 3 | intent | TeamLead | 原生依赖（FFmpeg 开发库）安装 | done | 链接验证通过 | - | 2026-11-01T19:40:00+08:00 |
| 4 | exploration | spec-explorer | 探索 scrcpy 包格式与 MediaCodec 配置 | done | explorer/exploration-report.html | - | 2026-11-01T19:15:00+08:00 |
| 5 | spec-writing | spec-writer | 方案与测试计划 | done | writer/plan.html、tester/test-plan.html | gate-2 | 2026-11-01T19:18:00+08:00 |

## 任务进度

| 任务号 | 负责角色 | 任务 | 状态 | 产物 | 完成时间 | 更新者 |
|--------|----------|------|------|------|----------|--------|
| T-001 | spec-explorer | 探索传输格式、编码参数与解码依赖 | done | explorer/exploration-report.html | 2026-11-01T19:15:00+08:00 | spec-explorer |
| T-002 | spec-writer | 编写实现方案 | done | writer/plan.html | 2026-11-01T19:18:00+08:00 | spec-writer |
| T-003 | spec-tester | 编写测试计划 | done | tester/test-plan.html | 2026-11-01T19:18:00+08:00 | spec-tester |
| T-004 | spec-executor | 实现手机端采集编码与 PC 端接收解码 | done | executor/summary.html | 2026-11-01T22:30:00+08:00 | spec-executor |
| T-005 | spec-tester | 独立测试（手机画面出现在 OBS） | done | tester/test-report.html | 2026-11-01T23:10:00+08:00 | spec-tester |
| T-006 | spec-ender | 收尾归档与 PR | done | ender/end-report.html | 2026-11-02T00:05:00+08:00 | spec-ender |

## 问题闭环记录

| 问题号 | 分类 | 发现者 | 负责角色 | 问题 | 解决方案 | 关联产物 | 状态 | 更新者 |
|--------|------|--------|----------|------|----------|----------|------|--------|
| I-001 | env | TeamLead | TeamLead | 本机无 FFmpeg 开发库，无法链接 libavcodec | 已装到 `C:\DEV\ArtemisEnv\ffmpeg`；链接验证通过（avcodec 63.25.102 / avutil 61.20.100 / swscale 10.6.100，h264 解码器存在，YUV420P→BGRA 可创建） | 本文件 | closed | TeamLead |

| I-002 | bug | spec-executor | spec-executor | 解码组件启动即退出 | avcodec-63.dll 依赖 swresample-7.dll 未拷贝，构建脚本补齐 | executor/artifacts/decode-host-stream-test.log | closed | spec-executor |
| I-003 | bug | spec-executor | spec-executor | 配置帧单独送包报错、断流后解码器状态未复位、FFmpeg 日志噪声 | 配置帧缓存后拼帧、新增 Decoder::reset()、日志回调过滤 | executor/artifacts/dh-out.txt | closed | spec-executor |
| I-004 | bug | spec-tester | spec-debugger | 已连接后接收服务收不到 /media 升级 | 媒体连接使用默认 OkHttpClient，未复用证书固定；新增 pinnedClientFor | debugger/debug-001-fix.html | verified | spec-debugger |
| I-005 | bug | spec-tester | spec-debugger | 媒体绑定被拒 media_bind_rejected | 绑定消息误用包名作设备标识，改为手机身份 ID | debugger/debug-002-fix.html | verified | spec-debugger |
| I-006 | bug | user | spec-debugger | 画面高频闪烁色条 | 读共享内存失败即回退色条；改为保持上一帧 | debugger/debug-003-fix.html | verified | spec-debugger |
| I-007 | bug | spec-tester | spec-debugger | 解码进程重启后画面不恢复 | 无重连策略、服务端不关手机连接、send 返回值不代表存活；补心跳与配置帧重发 | debugger/debug-004-fix.html | verified | spec-debugger |

## 决策记录

| 决策号 | 阶段 | 提出者 | 议题 | 候选项 | 结论 | 理由 | 拍板者 | 决策时间 | 依据 |
|--------|------|--------|------|--------|------|------|--------|----------|------|
| D-001 | intent | TeamLead | 解码器选型 | A FFmpeg / B Windows Media Foundation | A | 参考实现 scrcpy 用 FFmpeg 覆盖多平台多编码并带软件回退；我们要复刻它的传输与解码语义，同栈可降低未知；MF 的 H.264 MFT 在 N 版系统可能缺失 | TeamLead（用户要求先看参考） | 2026-11-01T18:57:00+08:00 | scrcpy `doc/build.md:33`、`app/src/decoder.c`、`app/src/interop.c`；本机 `msmpeg2vdec.dll` 存在但 MFT CLSID 仅系统自带 |
| D-002 | intent | TeamLead | 媒体传输通道 | A 复用配对用的 TLS WebSocket / B 独立 TCP 端口 + 12 字节包头 | B | 视频帧走控制通道会互相阻塞；12 字节包头是 scrcpy 验证过的帧边界方案；认证沿用已建立的配对信任 | TeamLead | 2026-11-01T18:57:00+08:00 | 版本账本 D-008、D-009；scrcpy `Streamer.java` 包格式 |
| D-003 | intent | TeamLead | 首版分辨率与编码 | 固定 720p30 / 多分辨率协商 | 固定 720p30：过滤器当前只协商 1280×720 RGB32，避免首版做缩放；不是产品只支持这一档，多分辨率在设备层放开能力后再上 | TeamLead | 2026-11-01T18:57:00+08:00 | 设备层测试报告「未覆盖项：非 720p 协商」 |
| D-004 | spec-writing | spec-writer | 媒体通道实现方式 | 复用现有控制连接 / 新增独立媒体连接（TLS 仍由 Node 终止）/ 解码组件自建 TLS 直连 / 明文 TCP | 新增独立媒体连接：同一端口同一证书，路径 `/media`，用控制连接下发的 sessionId 做绑定校验 | 视频是持续大流量、控制是稀疏小消息，共用一条 TCP 会队头阻塞；scrcpy 自身用视频/音频/控制三条独立 socket（DesktopConnection.java:93-99）；不自己实现 TLS 可避免引入 OpenSSL 与端口发现问题 | TeamLead | 2026-11-01T21:50:00+08:00 | explorer/exploration-report.html §3.1、§3.3、§4；scrcpy DesktopConnection.java |

## 角色运行句柄

| 角色 id | 适配层 | 运行时角色名 | agent_id | thread_id | session_id | 状态 | 续接方式 | 累计参与 Spec 数 | 最近产物 | 更新时间 |
|---------|--------|--------------|----------|-----------|------------|------|----------|------------------|----------|----------|
| spec-explorer | .agents | - | - | - | - | idle | respawn+rebuild | 3 | | |
| spec-writer | .agents | - | - | - | - | idle | respawn+rebuild | 3 | | |
| spec-tester | .agents | - | - | - | - | idle | respawn+rebuild | 3 | | |
| spec-executor | .agents | - | - | - | - | idle | respawn+rebuild | 3 | | |
| spec-debugger | .agents | - | - | - | - | idle | respawn+rebuild | 3 | | |
| spec-reviewer | .agents | - | - | - | - | idle | respawn+rebuild | 3 | | |
| spec-ender | .agents | - | - | - | - | idle | respawn+rebuild | 3 | | |

> 本 Spec 采用 serial 执行：由 TeamLead 按七角色协议依次承担。

## 产物注册表

| 产物 | 负责角色 | 状态 | 已确认 | 更新时间 |
|------|----------|------|--------|----------|
| explorer/exploration-report.html | spec-explorer | pending | no | |
| writer/plan.html | spec-writer | pending | no | |
| tester/test-plan.html | spec-tester | pending | no | |
| executor/summary.html | spec-executor | pending | no | |
| tester/test-report.html | spec-tester | pending | no | |
| ender/end-report.html | spec-ender | pending | no | |

## 门禁决策

| 门禁 | 确认对象 | 决策 | 判定方式 | 决策时间 | 备注 |
|------|----------|------|----------|----------|------|
| gate-1 | 需求对齐 | pass | user | 2026-11-01T18:57:00+08:00 | 用户要求先看参考实现；已调研 scrcpy 并据此定 FFmpeg |
| gate-2 | 方案与测试计划 | pass | user | 2026-11-01T22:01:00+08:00 | 用户执行 /spec-execute 视为放行 |
| gate-3 | 实现确认 | pass | user | 2026-11-01T22:45:00+08:00 | 用户执行 /spec-test 视为放行 |
| gate-4 | 测试报告 | pass | user | 2026-11-02T00:00:00+08:00 | 用户指示按当前工作区提交并收尾 |
| gate-5 | 归档 | pass | user | 2026-11-02T00:05:00+08:00 | 本报告归档 |

## 角色交接

| 来源角色 | 接收角色 | 交接原因 | 产物 | 状态 | 更新时间 |
|----------|----------|----------|------|------|----------|
| TeamLead | spec-explorer | 启动阶段二探索 | 本文件 | pending | |

## 修复循环预算

| 循环 | 最大轮数 | 最大无进展轮数 | 已用轮数 | 连续无进展 | 状态 | 用户已确认 | 更新时间 |
|------|----------|----------------|----------|------------|------|------------|----------|
| test-debug | 待确认 | 待确认 | 0 | 0 | not-started | no | |

## 开放问题与阻塞

| 编号 | 负责角色 | 问题或阻塞 | 状态 | 解决情况 |
|------|----------|------------|------|----------|
| B-001 | TeamLead | FFmpeg 开发库下载需要外网，可能受代理影响 | open | 待尝试下载 |

## 下一步动作

- 启动 spec-explorer：调研 scrcpy 的 12 字节包头与 MediaCodec 配置、PC 端 FFmpeg 解码接入方式、共享内存写入衔接，产出 `explorer/exploration-report.html`。
