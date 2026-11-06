# 工具链与本地复现

> 开发文档，不随发布包分发。使用者请看仓库根 `README.md` 与 `docs/user/`。

固定组合见 [toolchain-lock.json](toolchain-lock.json)，供应链与通知见 [dependency-provenance.md](dependency-provenance.md)。本工程仅有 Android 静态验证页和 loopback 健康服务，尚无配对、信令或媒体链路。

## Windows 环境

- JDK 17；本轮使用 Liberica 17.0.19。Android Studio 自带运行时与项目 Gradle JDK 分别配置，构建仍选择 JDK 17。
- Node 24.18.0、npm 11.16.0；无需全局 TypeScript。
- Python 3.10+ 用于原生库只读校验。
- SDK 平台 `platforms;android-36`、`build-tools;36.0.0`、`platform-tools`。CLI 安装脚本固定 tools 19.0；已有 SDK 可通过 `-SdkRoot` 复用。

安装 Android Studio 后，也可在 Tools → SDK Manager 选择上述 SDK 包并接受所需许可，然后记下 Android SDK Location。IDE 与命令行应使用同一个 SDK 目录，不必重复下载。

下载前先确认 SDK、模拟器、镜像及缓存的目录、预计空间与影响。安装 Android Studio 时也应将 SDK Location 指向选定位置。命令行安装须显式指定目录，或先设置 `ANDROID_HOME`；脚本不再自动选择系统盘目录。

命令行安装时，先准备校验过的工具（路径按本机选择调整）：

```powershell
$env:ANDROID_HOME = 'E:/Dev/Artemis/Android/Sdk'
powershell -NoProfile -File scripts/bootstrap-android-sdk.ps1 -DownloadOnly
```

脚本不接受许可证。用户审阅并同意 [Google SDK 协议](https://developer.android.com/studio/terms)后，可使用 SDK Manager 接受所选包许可，或交互执行：

```powershell
$SdkRoot = $env:ANDROID_HOME
& "$SdkRoot/cmdline-tools/19.0/bin/sdkmanager.bat" "--sdk_root=$SdkRoot" 'platforms;android-36' 'build-tools;36.0.0' 'platform-tools'
# 仅在同意实际显示的协议时接受提示。
powershell -NoProfile -File scripts/bootstrap-android-sdk.ps1 -SdkRoot $SdkRoot
```

## Android 构建

下面环境变量只影响当前 PowerShell；将 JAVA_HOME 替换为实际 JDK 17，SdkRoot 使用 SDK Manager 显示的路径：

```powershell
$env:JAVA_HOME = '<已有的 JDK 17 目录>'
$SdkRoot = $env:ANDROID_HOME
$env:ANDROID_HOME = $SdkRoot
powershell -NoProfile -File scripts/verify-toolchain.ps1 -SdkRoot $SdkRoot -ReportPath '.cache/preflight.json'
.\android\gradlew.bat -p android --no-daemon clean :app:assembleDebug
.\android\gradlew.bat -p android --no-daemon clean :app:assembleDebug
python scripts/verify-native-libs.py --apk android/app/build/outputs/apk/debug/app-debug.apk --report '.cache/native-check.json'
& "$SdkRoot/build-tools/36.0.0/zipalign.exe" -c -P 16 -v 4 android/app/build/outputs/apk/debug/app-debug.apk
```

预期 APK 为 `android/app/build/outputs/apk/debug/app-debug.apk`。两次 clean 构建均应退出 0；调试签名和 ZIP 元数据不保证 APK 字节相同。APK、下载缓存、`local.properties`、SDK 本身和个人代理配置均不提交。

本机迁移后的独立环境位于 `E:/Dev/Artemis`：SDK 在 `Android/Sdk`，AVD 在 `avd`，Android 配置与原有调试签名在 `.android`，本轮依赖调研下载在 `downloads`，迁入的 npm 缓存在 `cache/npm`。新终端读取用户级 Android 环境变量；已有终端可执行 `. E:/Dev/Artemis/activate.ps1`，该激活脚本同时将本次命令的临时文件和 npm 缓存指向 E 盘。Gradle 缓存继续使用项目内 `.cache/gradle`。未激活时，项目 `.npmrc` 使用当前项目目录下的 `.cache/npm`，避免 npm 写入默认系统盘缓存。迁移保留原先已安装的 JDK，不更改它的目录。

Google Maven / Central / Plugin Portal 不可用时：

```powershell
.\android\gradlew.bat -p android --no-daemon -PartemisMirror=true clean :app:assembleDebug
```

这会优先使用阿里云 Google/Public/Gradle Plugin 镜像，保留固定版本与 WebRTC 哈希检查。需要代理时仅在本机或当前进程设置 Gradle JVM 的 HTTP/HTTPS proxyHost、proxyPort；不要把个人代理或凭据写入仓库。

## PC 实验服务

```powershell
npm --prefix receiver ci --ignore-scripts
npm --prefix receiver test
npm --prefix receiver start
# 如需其它端口，先在当前进程设置 $env:PORT = '3001'。
```

启动会输出 `receiver_started` 和实际端口，默认只监听 `127.0.0.1:3000`。精确 `GET /healthz` 返回 service/status/version；其它路径 404，非 GET 的 `/healthz` 返回 405。无效 PORT、占用端口会输出 `receiver_error` 并非零退出。用 Ctrl+C 正常关闭；Windows 强杀不作为优雅信号退出证据。

## 验证边界

`npm test` 包含端口和公共服务函数的聚焦测试；独立 CLI 集成、设备安装/JNI、API29 与 16KB 运行由 Spec 测试阶段执行并单独记账。没有对应设备或环境时记 not-run。`verify-native-libs.py` 和 zipalign 都不能代替运行兼容性验收。

原生校验脚本自身的聚焦测试：

```powershell
python scripts/tests/test_verify_native_libs.py
```
