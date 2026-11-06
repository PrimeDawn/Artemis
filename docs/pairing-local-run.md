# 本地设备连接原型

> 开发文档，不随发布包分发。使用者请看仓库根 `README.md` 与 `docs/user/`。

工具链、配对/信令、应用层无感改造、系统摄像头设备层、手机画面链路与音频链路已交付并合入 dev。控制页负责发现、选择、断开与取消信任；手机画面经 H.264 媒体通道进入 OBS 的 `Artemis Camera`。音频需要本机装有 VB-CABLE（真实出声验证排在 v0.1.1）；端到端延迟未实测；真实手机换 IP 未测，实际断公网按用户要求不测。

## 启动电脑服务

需要 Node 24 与一个可用的 OpenSSL。依赖由 package-lock.json 固定；数据目录默认在 `%LOCALAPPDATA%\Artemis\data`，可用 `-DataDir` 改到别处。

```powershell
npm --prefix receiver ci --ignore-scripts
npm --prefix receiver run build
# 从实际网卡选择能与手机互访的私有 IPv4，不照抄示例地址。
Get-NetIPAddress -AddressFamily IPv4 | Select-Object InterfaceAlias, IPAddress
$env:ARTEMIS_LAN_HOST = '<本机局域网 IPv4>'
# 数据目录与 OpenSSL 用默认值即可；需要显式指定时：
$env:ARTEMIS_DATA_DIR = Join-Path $env:LOCALAPPDATA 'Artemis\data'
$env:ARTEMIS_OPENSSL_PATH = '<可用的 openssl.exe 路径>'
npm --prefix receiver run pairing
```

打开 `http://127.0.0.1:3000/control`。可用 ARTEMIS_CONTROL_PORT / ARTEMIS_TLS_PORT 显式配置端口，默认3000/3443，不能相同。使用数字 loopback Host；localhost 别名不在该入口允许范围内。

这是只启动配对/控制服务的手工方式；本机 `/media` 没有解码进程可转发，OBS 不会出现手机画面。完整试用请先按 [README](../README.md) 构建并注册 `native/`，再双击 `Start-Artemis.cmd`，它同时启动解码进程与接收服务。

`Start-Artemis.cmd` 调用的脚本支持这些参数：`-DataDir`（默认 `%LOCALAPPDATA%\Artemis\data`）、`-OpenSslPath`（省略时自动探测并对候选做一次真实生成探测，避免用到缺少默认配置的 OpenSSL）、`-LanIp`（省略时按默认路由选取）、`-NoBrowser`、`-NonInteractive`。脚本和文档都不含某台机器的固定路径。

其他机器应显式选择能正常运行 `openssl req` 的绝对路径。本机 PATH 还存在一个缺少默认配置的 Conda OpenSSL，不能仅凭 `Get-Command` 找到命令就认定可用。

首次启动在私有目录生成 P-256 身份和带当前 IP SAN 的自签名证书，目录只允许当前用户。设备信任绑定稳定公钥；30天叶证书在余期不足7天时同钥续签，不要求重新配对。运行中同一网卡地址变化会重绑 LAN 入口；重启服务时显式配置仍须指向当前有效地址，IP变化本身不改变信任。

原 npm start 仍为 Spec1 健康服务，不能和新控制端占同一端口。Ctrl+C 正常关闭后保留身份、信任与设备意图，不要通过删除身份文件“恢复连接”。

## 画面链路

1. 先构建 `native/` 并注册 `Artemis Camera`（`.\native\build.ps1`、`.\native\register.ps1 register`），确认 `artemis-decode-host.exe` 与 FFmpeg 运行库在同一目录。
2. 双击 `Start-Artemis.cmd`，它会拉起解码进程、接收服务并打开控制页。
3. 手机连接成功后，OBS 添加「视频采集设备」并选择 `Artemis Camera`，即可看到手机画面。

当前链路固定 720p30（1280×720、4 Mbps、10 秒 I 帧），实测约 30fps，端到端延迟未实测。手机断开后 OBS 保留最后一帧；解码进程重启后手机无需操作，约 6 秒自动恢复。麦克风尚未实现，控制页也不显示分辨率/帧率等推流统计。

## 手机连接

1. 启动电脑服务，手机打开 App，双方位于可互访的局域网。
2. 电脑控制页自动显示手机，操作者单击连接。
3. 首次手机选择“允许并记住”；后续重开 App、服务重启或短暂掉线，凭保存身份认证，免扫码/输码/重复首次确认。
4. 控制页只负责配对与连接状态，不再提供接收页；媒体由解码进程写入共享内存，由 OBS 的 `Artemis Camera` 消费。

发现只定位入口，名称和IP不是权限。首次确认是可信家庭/工作室 LAN 内的 TOFU 选择，手机显示电脑名和身份摘要；不宣称抵抗首次主动中间人。已保存公钥不被新广播静默覆盖。

## 连接与用户控制

- 信任和活动连接无固定/空闲到期；短期握手 nonce、未消费接收票据的时效不继承到活动连接。
- 心跳判断故障，软件无限次尝试恢复原选身份；连接或恢复后若已获得相机权限会自动启用摄像头，断开即停止（麦克风尚未实现）。
- “断开连接”停止活动意图和恢复，保留信任；受限 presence 可继续供列表发现，再次电脑单击才产生新意图。
- “取消信任”删除该端信任并结束授权；以后再次连接需首次允许。
- 页面重建不销毁应用级控制器。手机画面已接入，但前台服务与通知尚未实现；后台/锁屏按前台边界暂停。断电、网络中断、系统终止无法保证同一个socket永存。

PC 私有目录含 identity-key.pem、certificate.pem、trust-store.json、selection.json 和运行锁。手机私钥保存在 Android Keystore，信任在应用私有 noBackup 目录。不要提交或公开私钥。

单独维护证书使用 scripts/create-local-tls.ps1，显式传 HostIp、DataDir、OpenSslPath。默认复用身份；Renew 保留私钥；Rotate 只在明确需更换身份且服务已停止时使用，会保留备份并要求重新信任，不是日常连接步骤。信任文件损坏会报错，不默默清空为无认证状态；遗留运行锁只在原PID已退出时自动回收。

## 聚焦验证与后续验收

```powershell
# JAVA_HOME / ANDROID_HOME 按本机实际路径设置（构建工具链不随仓库携带）。
npm --prefix receiver test
.\android\gradlew.bat -p android --no-daemon -PartemisMirror=true testDebugUnitTest :app:assembleDebug :app:assembleDebugAndroidTest
```

APK：android/app/build/outputs/apk/debug/app-debug.apk。协议见 [pairing-v2.md](../protocol/pairing-v2.md)。独立浏览器/CLI信号/真实65分钟保活已有本轮证据，详细结果见Spec2测试报告；原生手机NSD已有历史真机通过记录，最新生命周期已补测；不再安排长稳等待，手机画面链路已交付、音频仍未实现。

手机接入后的步骤与通过条件见 [真机复测清单](pairing-phone-retest.md)。独立测试入口 `tests/pairing-*.mjs` 使用真实本地服务与受控身份；`pairing-candidate-cap.mjs` 会启动九个实际 PC 入口并为 JVM 集成测试提供端点。独立浏览器测试仅需 `playwright-core` 和已有 Chrome，不运行 `playwright install`。主机目录、证书和临时资料放在 `-DataDir` 指定的数据目录（默认 `%LOCALAPPDATA%\Artemis\data`）；签名环境不一致会造成 APK 覆盖安装被拒绝，不应通过卸载 App 丢弃信任来掩盖配置错误。

本轮保持公网连接，不改网卡、代理、路由器或防火墙制造断网；保留无公网信令/STUN/TURN/CDN目标，实际断公网运行未实测，见 [后续验证](validation-followups.md)。

## 验证方式与当前使用边界（2026-10-31）

用户已取消每轮五分钟硬上限；按改动做必要聚焦验证，不逐次全量重测，不做65分钟等长稳等待。等待用户解锁时保留原服务，业务恢复断言与ADB操作分别设置合理超时。

App仅在前台且未锁屏时使用并请求常亮；切其他App/锁屏暂停连接、发现和重试，返回自动恢复原电脑。连接或恢复后会自动启用摄像头（需已获相机权限），主动断开或取消信任保持停止；麦克风尚未实现。

PC每1秒检查、2秒无Pong判定失联，实际省电锁屏2649ms清除会话；网络持续短时卡顿也可能触发重连。手机前台自动重试没有次数上限，当前没有“达到次数后手动重试”的入口。

原始证据已按用户要求精简，见[证据索引](../spec/versions/v0.1/specs/20261029-0934-tech-离线配对与信令信任/evidence/index.md)。当前连续锁屏解锁已经通过，不再有该项待补；真实换IP仍未测。
