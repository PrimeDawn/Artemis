# 设备条件补测清单（已完成）

2026-10-28，最初因缺环境登记延期；随后完成真实USB手机和两个官方模拟器的实际运行，三项均按原条件通过。

| 跟踪项 | 用例 | 实际环境 | 结果 |
| --- | --- | --- | --- |
| DEVICE-001 | TC-D1 安装、启动与JNI | SM-S9210真机，Android16/API36，arm64-v8a，4096字节页面 | 通过：安装、验证页、截图、JNI创建/释放 |
| DEVICE-002 | TC-D2 最低系统版本 | 官方Android10/API29默认镜像r8，x86_64 | 通过：实际安装、启动，并额外通过JNI |
| DEVICE-003 | TC-D3 16KB系统运行 | 官方Android16/API36 Google APIs 16KB镜像r7，x86_64，PAGE_SIZE=16384 | 通过：页面大小断言、安装、启动、JNI |

[最新测试报告](../spec/versions/v0.1/specs/20261028-1059-tech-SDK与工具链可行性/tester/test-report.html)；[机器矩阵](../spec/versions/v0.1/specs/20261028-1059-tech-SDK与工具链可行性/tester/artifacts/test-logs/20261028-184012-emulator/consolidated-test-results.json)；[环境与复现](android-compatibility-testing.md)。

三个环境的主APK与测试APK哈希分别相同。16KB实测为x86_64模拟器，现有arm64手机使用4KB页面；结果仅覆盖所列环境与当前最小工程。相机、麦克风、OBS与真机性能仍由后续Spec验收，本清单不替代它们。

SDK模拟器及镜像已安装；项目AVD保留在忽略的.cache目录中。本次没有更改Windows功能或重启，测试后两个模拟器均已关闭。此前Windows功能列表的缺项判断已由实际加速自检及成功启动修正。
