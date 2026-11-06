# 依赖来源

> 开发文档，不随发布包分发。使用者请看仓库根 `README.md` 与 `docs/user/`。

基础工具链版本与校验值集中在 [toolchain-lock.json](toolchain-lock.json)。连接依赖另见下表及实际包锁/版本目录；聚焦测试不代表真机局域网、完整媒体或最终验收通过。

| 组件 | 来源与校验 |
| --- | --- |
| Android SDK | Google 官方 CLI tools 19.0；包下载前校验官方 SHA1，平台与工具修订由环境报告记录 |
| Gradle 8.13 | 官方 Wrapper JAR SHA256 和 distributionSha256Sum；不使用未校验的本机全局 Gradle |
| AGP / Kotlin / Compose | Google Maven、Maven Central、Gradle Plugin Portal，版本固定在版本目录；`-PartemisMirror=true` 时优先使用阿里云对应镜像 |
| WebRTC | `io.github.webrtc-sdk:android:150.7871.01`，Maven AAR SHA256 为 `0a1627b1a48c2bc17d9a40d62fc47bd45166f44a311e95917f147c402de379b0`；构建前 `verifyWebRtcArtifact` 强制校验 |
| Node 开发依赖 | npm 官方 registry，TypeScript 6.0.3、@types/node 24.10.1；package-lock.json 保存解析 URL 与 integrity，`npm ci --ignore-scripts` 安装 |

Node 开发依赖的 lockfile 记录 TypeScript 为 Apache-2.0、@types/node 及其 undici-types 为 MIT；它们仅用于开发编译。AndroidX/Kotlin 的随包通知由依赖携带，本次不裁剪 APK 的 LICENSE 元数据。

WebRTC 分发是第三方发布，并非 Google 官方 AAR。发布源为 [webrtc-sdk/android v150.7871.01](https://github.com/webrtc-sdk/android/tree/v150.7871.01)。GitHub 原始附件与 Maven 分发的容器哈希不同：Maven 发布流程将 433 个 class 的版本头从 Java 21 降至 Java 17；本次比较中其余 class 字节及 native 库相同。处理脚本和比较记录位于首个 Spec 的探索报告；固定使用 Maven 字节，不替换成 GitHub 附件。

许可证分层保留：发布仓库自身 MIT，POM 声明 WebRTC BSD-3-Clause，原生依赖另有第三方通知。对应版本的发布仓库许可与完整通知已合并保存于 [第三方通知](third-party/WEBRTC-150.7871.01.md)。不将全部依赖概括为 MIT。

64 位库检查 PT_LOAD 对齐、地址/文件偏移一致性及 GNU_RELRO。按 [Android 官方 16KB 说明](https://developer.android.com/guide/practices/page-sizes)，RELRO 独占完整 LOAD 且保护范围不覆盖其它可写数据时，段末端余数不为零仍可静态合规。校验脚本覆盖共享段失败及独立段例外；最终 APK 另用 zipalign，实际加载仍需真机或对应模拟器。

Maven 下载发生超时或不可达时允许切换镜像；不得为下载成功降低 TLS 或哈希校验、改用动态版本。记录实际使用仓库及失败输出；镜像内容与固定 WebRTC 哈希不一致时立即失败。


## Spec2 连接依赖

| 直接依赖 | 固定版本/许可 | 用途与来源 |
|---|---|---|
| ws / @types/ws | 8.22.0 / 8.18.2，MIT | npm官方registry；WS及编译类型，禁可选native加速和perMessageDeflate |
| bonjour-service | 1.4.4，MIT | npm官方registry / onlxltd维护源；纯Node mDNS，无系统Bonjour安装 |
| OkHttp / okhttp-tls / mockwebserver3 | 5.4.0，Apache-2.0 | Maven Central；Android HTTPS/WSS及测试 |
| JUnit | 4.13.2，EPL-1.0 | 仅JVM测试 |
| org.json:json | 20250517，该版本POM声明Public Domain | 仅JVM测试，设备使用Android JSON |

Node传递版本/integrity在receiver/package-lock.json；Android固定版本在android/gradle/libs.versions.toml。已授权 -PartemisMirror=true 可优先镜像，不降低TLS或固定版本验证。

原候选5.5.1的Android AAR要求SDK37；官方5.4.0要求SDK36，SHA256为 `0e9cbf6c7c373a5f0b0cde7f773185eb69b485faa19f76bcfab3310badbda901`。用户已批准r3固定5.4.0，保留SDK36/AGP8.13.2，不安装SDK37。5.5.1公共CA撤销列表更新见[维护方变更记录](https://github.com/lysine-dev/okhttp/blob/main/CHANGELOG.md)；本项目手机入口只接受绑定的自签名SPKI并保留默认主机名校验，不以公共CA授权本地设备，不宣称通用互联网客户端安全等价。

未安装qrcode，扫码/连接串已移出正常路径。独立tester已将 playwright-core 1.64.1（Apache-2.0）安装到项目忽略的 E 盘测试工具目录，复用已安装 Chrome 156.0.8078.73，没有下载浏览器。它不进入接收端运行包或 APK；正式接收端依赖仍以 package-lock.json 为准。

## 媒体与音频依赖

| 组件 | 版本 / 许可 | 用途与来源 |
|---|---|---|
| FFmpeg 运行库（avcodec / avutil / swscale / swresample） | `N-128227-g4811625b5f-20261031`，GPL 共享构建（`win64-gpl-shared`） | 解码进程用 H.264 与 Opus/AAC 解码、色彩转换与重采样；随 `native/build.ps1` 从本机固定的 FFmpeg 目录复制到 `native/out`。因是 GPL 共享构建，分发安装包时必须同时提供其源码获取方式与许可文本 |
| Android 平台 Opus 编码器 | 系统 `c2.android.opus.encoder`，随 Android 平台 | 手机端音频编码，不引入第三方 Opus 库 |
| Android 平台 MediaCodec H.264 编码器 | 随 Android 平台 | 手机端视频编码 |

FFmpeg 只在 Windows 侧的解码进程中使用；手机端不链接 FFmpeg。安装包分发前需按 GPL 要求随包提供 FFmpeg 许可与对应源码的获取说明，这一项在 `SPEC-release-package` 打包时落实。
