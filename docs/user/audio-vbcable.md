# 让手机麦克风的声音进入 OBS

Artemis **不自带**虚拟麦克风驱动：Windows 只允许微软签名的驱动成为系统录音设备，这个项目没有签名证书，所以声音通过你自己安装的虚拟声卡转交。

目前只支持 **VB-CABLE**。

## 一、安装 VB-CABLE

1. 打开 <https://vb-audio.com/Cable/>，下载 VB-CABLE 的压缩包。
2. 解压后右键 `VBCABLE_Setup_x64.exe` → **以管理员身份运行** → `Install Driver`。
3. 安装完成后建议重启一次电脑。

安装成功后，系统的声音设置里会多出一对设备：

| 设备名 | 作用 |
| --- | --- |
| `CABLE Input (VB-Audio Virtual Cable)` | 播放侧——Artemis 把手机麦克风的声音写到这里 |
| `CABLE Output (VB-Audio Virtual Cable)` | 录音侧——其他程序（OBS、会议软件）从这里读取声音 |

## 二、确认 Artemis 已经接上

1. 启动 Artemis（开始菜单 → Artemis），连接手机。
2. 手机 App 里允许麦克风权限（第一次会询问）。
3. 打开 `%LOCALAPPDATA%\Artemis\logs\decode-host.log`，看到类似下面的行说明已经锁定输出设备：

```
decode-host: virtual cable attached, audio resumed
```

如果看到的是 `virtual cable removed` 或完全没有这行，说明 Artemis 没有找到 VB-CABLE，检查上一步是否安装成功、是否重启过。

## 三、在 OBS 里加上声音

1. 在来源里添加「**音频输入采集**」。
2. 设备选 `CABLE Output (VB-Audio Virtual Cable)`。
3. 如果听不到声音，先看 OBS 的音量表有没有跳动：
   - 有跳动但听不到 → OBS 的监听/输出设置问题，不是 Artemis 的问题；
   - 没有跳动 → 回到第二步检查 `decode-host.log`。

## 四、常见误区

- **不要去找「Artemis Microphone」这样的系统设备**——本项目不安装系统麦克风设备。
- 在系统「声音设置 → 输入」里看不到 Artemis 是正常的，声音是从 `CABLE Output` 读的。
- 不要同时把 `CABLE Output` 用作别处的默认录音设备，否则两个程序会抢同一路音频。
- 手机端断开重连后，声音会自动恢复；如果长时间没有声音，检查 `decode-host.log` 里是否出现过 `virtual cable removed`。

## 五、卸载

在「应用」里卸载 VB-CABLE 即可，不影响 Artemis 的画面功能；卸载后 Artemis 会提示未检测到虚拟声卡。
