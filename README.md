# Artemis

把安卓手机变成 Windows 电脑上的摄像头：手机画面以 **720p / 30fps** 通过局域网送进电脑，在 OBS 等程序里显示为 `Artemis Camera`。麦克风声音可同时送到你自备的虚拟声卡（见[音频说明](docs/user/audio-vbcable.md)）。

- 手机端：`Artemis-android.apk`（Android 10 及以上）
- 电脑端：`Artemis-Setup-<版本>.exe`（Windows 10 1809 及以上，64 位）

两台设备需要在同一个可互访的局域网里，不经过任何服务器或云端。

## 安装

1. 运行 `Artemis-Setup-<版本>.exe`，按提示安装。安装到当前用户目录，**不需要管理员权限**，也不会弹出 UAC。
2. 把 `Artemis-android.apk` 传到手机上安装。首次安装需要在系统设置里允许「安装未知来源应用」。
3. 安装完成后，开始菜单里会出现 **Artemis**。

## 第一次连接

1. 双击开始菜单里的 **Artemis**。托盘会出现 Artemis 图标，控制页会在浏览器里打开（`http://127.0.0.1:3000/control`）。
2. 手机打开 Artemis，保持在前台、不要锁屏。
3. 电脑的控制页里会自动列出这台手机，点一下选择它。
4. 手机上会弹出确认，选择「允许并记住」。这一步每台手机只需做一次，以后重连不用再确认。
5. 连接成功后，控制页会显示连接状态。

手机 App 只在前台且未锁屏时工作；切到别的应用或锁屏会暂停推流，回到 Artemis 后自动恢复。

## 在 OBS 里使用

1. 在来源里添加「**视频采集设备**」。
2. 设备选择 `Artemis Camera`。
3. 分辨率与帧率按 720p / 30fps 使用。

其他支持 DirectShow 摄像头的程序同理，`Artemis Camera` 会出现在系统摄像头列表里。

## 音频

Artemis 不自带虚拟麦克风驱动。要听到手机麦克风，需要先安装免费的 [VB-CABLE](https://vb-audio.com/Cable/)：

- 安装后 Artemis 会把声音写入 `CABLE Input`；
- 在 OBS 里添加「音频输入采集」，设备选 `CABLE Output`。

没装虚拟声卡时，Artemis 会提示「未检测到虚拟声卡」，画面不受影响。详细步骤见[音频说明](docs/user/audio-vbcable.md)。

## 出问题了

先看[常见问题](docs/user/troubleshooting.md)。日志在：

```
%LOCALAPPDATA%\Artemis\logs\
    tray.log         启动、停止与错误
    receiver.log     连接与配对
    decode-host.log  画面解码
```

## 停止与卸载

- 托盘图标右键 →「退出」即可停止全部服务；关闭浏览器标签页不会停止服务。
- 卸载：设置 →「应用」→「已安装的应用」→ Artemis → 卸载。程序文件会被删除，`%LOCALAPPDATA%\Artemis\data` 里的配对记录会保留；需要彻底清空时手动删掉该目录。

## 已知限制

- 只支持 Windows 的 x64 版本；不支持 macOS / Linux。
- 只验证过 720p / 30fps 单一档位。
- 端到端延迟尚未测量。
- 虚拟声卡目前只支持 VB-CABLE。
- 安装包尚未做代码签名，Windows 可能显示「未知发布者」；如果系统启用了「智能应用控制（Smart App Control）」，未签名程序可能被直接拦截，需要在系统设置里关闭该功能后才能运行。
- 换用新签名的版本时，手机上需要先卸载旧版再装（会丢失已保存的配对，需要重新允许一次）。

## 源码与许可证

源码仓库：<https://github.com/PrimeDawn/Artemis>

Artemis 以 [MIT 许可证](LICENSE) 发布。安装包内含的第三方组件及其许可证见 `licenses\THIRD-PARTY.md`（其中 FFmpeg 为 GPL v3 构建，许可证原文见 `licenses\FFmpeg-GPL.txt`）。
