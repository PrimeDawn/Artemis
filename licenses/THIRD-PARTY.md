# 随包第三方组件

Artemis 以 MIT 许可证发布（见根目录 `LICENSE`）。安装包内还包含下列第三方组件，它们各自保留原有许可证。

## 运行时组件

| 组件 | 版本 | 许可证 | 来源 |
| --- | --- | --- | --- |
| Node.js（`runtime\node.exe`） | 24.x | MIT | <https://nodejs.org/> |
| FFmpeg 共享库（`app\native\avcodec-63.dll` 等 5 个 DLL） | master 分支 GPL shared 构建 | GPL v3 | <https://ffmpeg.org/> |
| ws | 8.22.0 | MIT | <https://github.com/websockets/ws> |
| bonjour-service | 1.4.4 | MIT | <https://github.com/onlxltd/bonjour-service> |
| @peculiar/x509 | 3.1.0 | MIT | <https://github.com/PeculiarVentures/x509> |
| reflect-metadata | 0.2.2 | Apache-2.0 | <https://github.com/rbuckton/reflect-metadata> |

## FFmpeg 的 GPL 义务

`app\native` 下的 FFmpeg 动态库是 GPL v3 构建，随包分发时必须同时提供：

1. 许可证原文：`licenses\FFmpeg-GPL.txt`（构建时从 FFmpeg 发行包复制）；
2. 对应源码的获取方式：<https://ffmpeg.org/download.html>，构建配置为 `--enable-gpl --enable-shared`。

Artemis 通过独立进程调用 FFmpeg 解码库，自身代码仍以 MIT 发布。

## 构建期组件（不随包分发）

| 组件 | 用途 |
| --- | --- |
| Inno Setup 6 | 生成 Windows 安装包 |
| MSVC（VS 2022 Build Tools） | 编译 DirectShow 过滤器与解码进程 |
| JDK 17+ / Android SDK 36 / Build Tools 36.0.0 | 构建安卓 APK |
