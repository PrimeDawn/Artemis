# Android兼容环境与复现

> 开发文档，不随发布包分发。使用者请看仓库根 `README.md` 与 `docs/user/`。

此文件记录SDK与工具链Spec已实际执行的兼容测试，不包含媒体性能结论。

## 已验证环境

- Android Emulator 37.2.12；硬件加速自检返回WHPX可用。
- `system-images;android-29;default;x86_64` revision8：Android10/API29，4096字节页面。
- `system-images;android-36;google_apis_ps16k;x86_64` revision7：Android16/API36，16384字节页面。
- 镜像均来自官方sdkmanager，使用已有android-sdk-license；本轮没有新许可接受输入、Windows功能切换或电脑重启。

## 复现入口

沿用toolchain.md中的JDK17和SDK根。通过sdkmanager安装上述两个镜像及emulator，先执行`emulator -accel-check`确认实际后端。Windows可选功能清单不能单独证明模拟器是否可运行。

用avdmanager分别创建虚拟设备，AVD目录放入项目`.cache/android-avd`，并在创建和运行进程中显式设置ANDROID_AVD_HOME。测试时一次只启动一台虚拟设备，可使用`-no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader -camera-front none -camera-back none -memory 2048 -cores 2`；实际启动参数和退出码保存在各自emulator-boot.log。

确认`sys.boot_completed=1`后执行项目测试入口：

```powershell
python tests/android-runtime-smoke.py --sdk-root $SdkRoot --device-kind emulator --expected-api 29 --expected-page-size 4096 --report-dir $Api29Report
python tests/android-runtime-smoke.py --sdk-root $SdkRoot --device-kind emulator --expected-api 36 --expected-page-size 16384 --report-dir $Page16kReport
```

两条命令分别在对应虚拟设备启动后运行，不能同时用`-e`指向多台模拟器。脚本先读取并断言真实环境，再实际安装主APK和AndroidTest APK、运行JNI、启动验证页、检查文本并采集本应用截图。仅关闭本次创建的模拟器；本轮两个模拟器退出码均为0。

汇总器tests/collect-runtime-matrix.py要求三个环境APK哈希一致、必测代码和测试输入未变、每项证据存在以及实际运行通过。原始历史日志与本轮执行时间保持独立；新汇总不改写历史回执。

16KB镜像的x86_64运行结果不能直接外推到全部arm64设备或真实音视频性能；当前arm64手机的4KB运行已另有实测。后续媒体链路仍使用现有手机验证。

官方参考：[16KB测试环境](https://developer.android.com/guide/practices/page-sizes#16kb-emulator)、[虚拟设备](https://developer.android.com/studio/run/managing-avds)、[硬件加速](https://developer.android.com/studio/run/emulator-acceleration)。

本次来源：[SDK与工具链测试报告](../spec/versions/v0.1/specs/20261028-1059-tech-SDK与工具链可行性/tester/test-report.html)。
