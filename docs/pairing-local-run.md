# 本地设备连接原型

Spec2的自动发现、电脑单击选手机、首次允许后持久信任、无固定连接期限、自动恢复及授权信令已实现。真实S24已完成首次连接与控制流程，前台常亮、切App暂停/返回恢复及省电锁屏→正常解锁连续恢复均有通过记录。最新连续流程全程同一服务，锁屏2649ms清除旧会话、解锁建立新会话。当前已原位归档，PR #3（https://github.com/PrimeDawn/Artemis/pull/3）待审阅、未合并；手机真实换IP仍未测，实际断公网按用户要求不测，音视频采集、媒体WebRTC及OBS播放尚未实现。

## 启动电脑服务

使用现有 Node24、OpenSSL 和 E 盘开发环境。依赖由 package-lock.json 固定，私有数据和新增缓存放 E 盘。

```powershell
npm --prefix receiver ci --ignore-scripts
npm --prefix receiver run build
# 从实际网卡选择能与手机互访的私有 IPv4，不照抄示例地址。
Get-NetIPAddress -AddressFamily IPv4 | Select-Object InterfaceAlias, IPAddress
$env:ARTEMIS_LAN_HOST = '192.168.1.50'
$env:ARTEMIS_DATA_DIR = 'E:\Dev\Artemis\data\receiver'
$env:ARTEMIS_OPENSSL_PATH = 'E:\Dev\Git\usr\bin\openssl.exe' # 本机已验证的 Git 自带 OpenSSL
npm --prefix receiver run pairing
```

打开 `http://127.0.0.1:3000/control`。可用 ARTEMIS_CONTROL_PORT / ARTEMIS_TLS_PORT 显式配置端口，默认3000/3443，不能相同。使用数字 loopback Host；localhost 别名不在该入口允许范围内。

其他机器应显式选择能正常运行 `openssl req` 的绝对路径。本机 PATH 还存在一个缺少默认配置的 Conda OpenSSL，不能仅凭 `Get-Command` 找到命令就认定可用。

首次启动在私有目录生成 P-256 身份和带当前 IP SAN 的自签名证书，目录只允许当前用户。设备信任绑定稳定公钥；30天叶证书在余期不足7天时同钥续签，不要求重新配对。运行中同一网卡地址变化会重绑 LAN 入口；重启服务时显式配置仍须指向当前有效地址，IP变化本身不改变信任。

原 npm start 仍为 Spec1 健康服务，不能和新控制端占同一端口。Ctrl+C 正常关闭后保留身份、信任与设备意图，不要通过删除身份文件“恢复连接”。

## 手机连接

1. 启动电脑服务，手机打开 App，双方位于可互访的局域网。
2. 电脑控制页自动显示手机，操作者单击连接。
3. 首次手机选择“允许并记住”；后续重开 App、服务重启或短暂掉线，凭保存身份认证，免扫码/输码/重复首次确认。
4. 控制页可以打开接收验证页；它只验证授权信令状态，尚不能播放手机音视频。

发现只定位入口，名称和IP不是权限。首次确认是可信家庭/工作室 LAN 内的 TOFU 选择，手机显示电脑名和身份摘要；不宣称抵抗首次主动中间人。已保存公钥不被新广播静默覆盖。

## 连接与用户控制

- 信任和活动连接无固定/空闲到期；短期握手 nonce、未消费接收票据的时效不继承到活动连接。
- 心跳判断故障，软件无限次尝试恢复原选身份；恢复不自动启动采集。
- “断开连接”停止活动意图和恢复，保留信任；受限 presence 可继续供列表发现，再次电脑单击才产生新意图。
- “取消信任”删除该端信任并结束授权；以后再次连接需首次允许。
- 页面重建不销毁应用级控制器。后台/锁屏调度及真实媒体前台服务仍需后续真机验证；断电、网络中断、系统终止无法保证同一个socket永存。

PC 私有目录含 identity-key.pem、certificate.pem、trust-store.json、selection.json 和运行锁。手机私钥保存在 Android Keystore，信任在应用私有 noBackup 目录。不要提交或公开私钥。

单独维护证书使用 scripts/create-local-tls.ps1，显式传 HostIp、DataDir、OpenSslPath。默认复用身份；Renew 保留私钥；Rotate 只在明确需更换身份且服务已停止时使用，会保留备份并要求重新信任，不是日常连接步骤。信任文件损坏会报错，不默默清空为无认证状态；遗留运行锁只在原PID已退出时自动回收。

## 聚焦验证与后续验收

```powershell
# 本机先加载已迁移的 E 盘 SDK、Android 用户目录/调试签名、Gradle 与临时目录。
. E:\Dev\Artemis\activate.ps1
npm --prefix receiver test
.\android\gradlew.bat -p android --no-daemon -PartemisMirror=true testDebugUnitTest :app:assembleDebug :app:assembleDebugAndroidTest
```

APK：android/app/build/outputs/apk/debug/app-debug.apk。协议见 [pairing-v2.md](../protocol/pairing-v2.md)。独立浏览器/CLI信号/真实65分钟保活已有本轮证据，详细结果见Spec2测试报告；原生手机NSD已有历史真机通过记录，最新生命周期已补测；不再安排长稳等待，真实媒体仍未实现。

手机接入后的步骤与通过条件见 [真机复测清单](pairing-phone-retest.md)。独立测试入口 `tests/pairing-*.mjs` 使用真实本地服务与受控身份；`pairing-candidate-cap.mjs` 会启动九个实际 PC 入口并为 JVM 集成测试提供端点。独立浏览器测试仅需 `playwright-core` 和已有 Chrome，不运行 `playwright install`。主机目录、证书和临时资料必须留在 E 盘；签名环境不一致会造成 APK 覆盖安装被拒绝，不应通过卸载 App 丢弃信任来掩盖配置错误。

本轮保持公网连接，不改网卡、代理、路由器或防火墙制造断网；保留无公网信令/STUN/TURN/CDN目标，实际断公网运行未实测，见 [后续验证](validation-followups.md)。

## 验证方式与当前使用边界（2026-10-31）

用户已取消每轮五分钟硬上限；按改动做必要聚焦验证，不逐次全量重测，不做65分钟等长稳等待。等待用户解锁时保留原服务，业务恢复断言与ADB操作分别设置合理超时。

App仅在前台且未锁屏时使用并请求常亮；切其他App/锁屏暂停连接、发现和重试，返回自动恢复原电脑。主动断开或取消信任保持停止，不自动开始媒体采集。

PC每1秒检查、2秒无Pong判定失联，实际省电锁屏2649ms清除会话；网络持续短时卡顿也可能触发重连。手机前台自动重试没有次数上限，当前没有“达到次数后手动重试”的入口。

原始证据已按用户要求精简，见[证据索引](../spec/versions/v0.1/specs/20261029-0934-tech-离线配对与信令信任/evidence/index.md)。当前连续锁屏解锁已经通过，不再有该项待补；真实换IP仍未测。
