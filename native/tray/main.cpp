// Artemis.exe：安装后的唯一入口。默认托盘常驻；--selftest 只做配置与网卡解析并输出 JSON；
// --console 无界面运行服务，供自动化与排障使用（writer/plan.html §3.3）。
#include <windows.h>
#include <shellapi.h>

#include <cstdio>
#include <string>

#include "NetworkAddress.h"
#include "ProcessManager.h"
#include "TrayApp.h"

namespace {

HANDLE gStopEvent = nullptr;

BOOL WINAPI ConsoleControl(DWORD) {
    if (gStopEvent != nullptr) SetEvent(gStopEvent);
    return TRUE;
}

void AttachParentConsole() {
    // 输出已被重定向到文件/管道时保持原句柄，不要把流改到控制台。
    const HANDLE existing = GetStdHandle(STD_OUTPUT_HANDLE);
    if (existing != nullptr && existing != INVALID_HANDLE_VALUE) return;
    if (!AttachConsole(ATTACH_PARENT_PROCESS)) return;
    FILE* stream = nullptr;
    freopen_s(&stream, "CONOUT$", "w", stdout);
    freopen_s(&stream, "CONOUT$", "w", stderr);
}

std::wstring ExeDirectory() {
    wchar_t path[MAX_PATH * 2] = {0};
    const DWORD length = GetModuleFileNameW(nullptr, path, static_cast<DWORD>(std::size(path)));
    if (length == 0 || length >= std::size(path)) return L"";
    std::wstring full(path, length);
    const size_t slash = full.find_last_of(L"\\/");
    return slash == std::wstring::npos ? L"" : full.substr(0, slash);
}

std::string Utf8(const std::wstring& text) {
    if (text.empty()) return "";
    const int bytes = WideCharToMultiByte(CP_UTF8, 0, text.c_str(), static_cast<int>(text.size()), nullptr, 0, nullptr, nullptr);
    std::string out(static_cast<size_t>(bytes), '\0');
    WideCharToMultiByte(CP_UTF8, 0, text.c_str(), static_cast<int>(text.size()), out.data(), bytes, nullptr, nullptr);
    return out;
}

std::string JsonEscape(const std::wstring& text) {
    std::string escaped;
    for (const char c : Utf8(text)) {
        if (c == '\\' || c == '"') escaped.push_back('\\');
        escaped.push_back(c);
    }
    return escaped;
}

void WriteStandardError(const std::wstring& message) {
    // 宽字符直接 fwprintf 到重定向的流会按本地代码页转换，中文变成问号；统一按 UTF-8 输出。
    const std::string utf8 = Utf8(message);
    std::fwrite(utf8.data(), 1, utf8.size(), stderr);
    std::fputc('\n', stderr);
    std::fflush(stderr);
}
int SelfTest(const ArtemisLayout& layout, const ArtemisConfig& config, const std::wstring& lanIp) {
    std::printf(
        "{\"lanIp\":\"%s\",\"controlPort\":%d,\"tlsPort\":%d,\"mediaPort\":%d,\"installed\":%s,"
        "\"dataDir\":\"%s\",\"logDir\":\"%s\",\"receiverEntry\":\"%s\"}\n",
        JsonEscape(lanIp).c_str(), config.controlPort, config.tlsPort, config.mediaPort,
        layout.installed ? "true" : "false", JsonEscape(layout.dataDir).c_str(),
        JsonEscape(layout.logDir).c_str(), JsonEscape(layout.receiverEntry).c_str());
    std::fflush(stdout);
    return 0;
}

int ConsoleMode(const ArtemisLayout& layout, const ArtemisConfig& config, const std::wstring& lanIp) {
    ServiceHandles services;
    std::wstring error;
    if (!StartServices(layout, config, lanIp, services, error)) {
        WriteStandardError(L"artemis: " + error);
        return 3;
    }
    std::wprintf(L"artemis: services started (decode pid %lu, node pid %lu)\n", services.decodePid, services.nodePid);
    std::wprintf(L"artemis: control page http://127.0.0.1:%d/control\n", config.controlPort);
    std::fflush(stdout);

    gStopEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    SetConsoleCtrlHandler(ConsoleControl, TRUE);
    while (WaitForSingleObject(gStopEvent, 500) == WAIT_TIMEOUT) {
        if (!IsRunning(services)) {
            AppendTrayLog(layout, L"console mode: a service exited unexpectedly");
            StopServices(services, 2000);
            return 4;
        }
    }
    StopServices(services, 3000);
    return 0;
}

}  // namespace

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR, int) {
    int argc = 0;
    LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
    bool selfTest = false;
    bool consoleMode = false;
    for (int i = 1; i < argc; ++i) {
        const std::wstring argument(argv[i]);
        if (argument == L"--selftest") selfTest = true;
        else if (argument == L"--console") consoleMode = true;
        else if (argument == L"--help" || argument == L"-h") {
            AttachParentConsole();
            std::printf("Artemis.exe [--selftest] [--console]\n");
            LocalFree(argv);
            return 0;
        } else {
            WriteStandardError(L"artemis: unknown argument " + argument);
            LocalFree(argv);
            return 2;
        }
    }
    LocalFree(argv);

    if (selfTest || consoleMode) AttachParentConsole();

    const std::wstring exeDir = ExeDirectory();
    if (exeDir.empty()) {
        WriteStandardError(L"artemis: cannot resolve the executable directory");
        return 2;
    }


    // 单实例：托盘是常驻程序，第二个实例抢不到端口会不断重试并弹通知（实测踩过）。
    // 已存在实例时先把控制页调出来，然后安静退出。
    HANDLE singleton = CreateMutexW(nullptr, TRUE, L"Local\\ArtemisTraySingleton");
    if (singleton != nullptr && GetLastError() == ERROR_ALREADY_EXISTS && !selfTest && !consoleMode) {
        ArtemisConfig existing;
        std::wstring ignored;
        if (LoadConfig(exeDir, existing, ignored)) OpenControlPage(existing);
        CloseHandle(singleton);
        return 0;
    }
    ArtemisConfig config;
    std::wstring error;
    if (!LoadConfig(exeDir, config, error)) {
        WriteStandardError(L"artemis: " + error);
        ArtemisLayout fallback;
        fallback.root = exeDir;
        fallback.dataDir = config.dataDir;
        fallback.logDir = exeDir;
        AppendTrayLog(fallback, L"config error: " + error);
        return 3;
    }

    ArtemisLayout layout;
    if (!ResolveLayout(exeDir, config, layout, error)) {
        WriteStandardError(L"artemis: " + error);
        AppendTrayLog(layout, L"layout error: " + error);
        return 3;
    }

    std::wstring networkError;
    const std::wstring lanIp = SelectLanIpv4(networkError);
    if (lanIp.empty()) {
        WriteStandardError(L"artemis: " + networkError);
        AppendTrayLog(layout, L"network error: " + networkError);
        return 3;
    }

    if (selfTest) return SelfTest(layout, config, lanIp);
    if (consoleMode) return ConsoleMode(layout, config, lanIp);

    return RunTray(instance, layout, config, lanIp);
}