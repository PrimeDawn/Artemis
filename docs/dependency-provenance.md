# 依赖来源

版本与校验值集中在 [toolchain-lock.json](toolchain-lock.json)。项目尚处于工具链验证阶段，静态检查不代表设备运行或音视频可用。

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
