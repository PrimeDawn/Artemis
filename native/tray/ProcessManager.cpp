#include "ProcessManager.h"

#include <windows.h>
#include <shlobj.h>
#include <winsock2.h>
#include <ws2tcpip.h>
#include <shellapi.h>

#include <algorithm>
#include <cwctype>
#include <cstdio>
#include <string>
#include <vector>

namespace {

// 端口被占用时子进程会直接退出，托盘只剩一句「service exited」；先自己探测才能给出可读原因。
bool IsPortFree(int port) {
    // 未调用 WSAStartup 时 socket() 直接失败，探测会被误判成「端口空闲」。
    static const bool winsockReady = []() {
        WSADATA data{};
        return WSAStartup(MAKEWORD(2, 2), &data) == 0;
    }();
    if (!winsockReady) return true;
    SOCKET socket = ::socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (socket == INVALID_SOCKET) return true;
    const BOOL exclusive = TRUE;
    setsockopt(socket, SOL_SOCKET, SO_EXCLUSIVEADDRUSE, reinterpret_cast<const char*>(&exclusive), sizeof(exclusive));
    sockaddr_in address{};
    address.sin_family = AF_INET;
    address.sin_port = htons(static_cast<unsigned short>(port));
    address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    const bool free = bind(socket, reinterpret_cast<sockaddr*>(&address), sizeof(address)) == 0;
    closesocket(socket);
    return free;
}

std::wstring ToLower(std::wstring text) {
    std::transform(text.begin(), text.end(), text.begin(), [](wchar_t c) { return static_cast<wchar_t>(towlower(c)); });
    return text;
}

bool FileExists(const std::wstring& path) {
    const DWORD attributes = GetFileAttributesW(path.c_str());
    return attributes != INVALID_FILE_ATTRIBUTES && (attributes & FILE_ATTRIBUTE_DIRECTORY) == 0;
}

bool DirectoryExists(const std::wstring& path) {
    const DWORD attributes = GetFileAttributesW(path.c_str());
    return attributes != INVALID_FILE_ATTRIBUTES && (attributes & FILE_ATTRIBUTE_DIRECTORY) != 0;
}

std::wstring Join(const std::wstring& base, const std::wstring& name) {
    if (base.empty()) return name;
    return base + L"\\" + name;
}

bool ReadWholeFile(const std::wstring& path, std::string& out) {
    HANDLE file = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (file == INVALID_HANDLE_VALUE) return false;
    LARGE_INTEGER size{};
    if (!GetFileSizeEx(file, &size) || size.QuadPart > 64 * 1024) {
        CloseHandle(file);
        return false;
    }
    out.assign(static_cast<size_t>(size.QuadPart), '\0');
    DWORD read = 0;
    const BOOL ok = out.empty() || ReadFile(file, out.data(), static_cast<DWORD>(out.size()), &read, nullptr);
    CloseHandle(file);
    return ok && read == out.size();
}

// config.json 只承载一层扁平字段：整数字段与字符串字段。解析保持严格，
// 遇到未知结构直接报错，避免悄悄用了默认值却以为配置生效。
bool ReadFlatValue(const std::string& json, const std::string& key, std::string& value, bool& isString) {
    const std::string needle = "\"" + key + "\"";
    const size_t keyAt = json.find(needle);
    if (keyAt == std::string::npos) return false;
    size_t cursor = json.find(':', keyAt + needle.size());
    if (cursor == std::string::npos) return false;
    ++cursor;
    while (cursor < json.size() && (json[cursor] == ' ' || json[cursor] == '\t' || json[cursor] == '\r' || json[cursor] == '\n')) ++cursor;
    if (cursor >= json.size()) return false;
    if (json[cursor] == '"') {
        const size_t end = json.find('"', cursor + 1);
        if (end == std::string::npos) return false;
        value = json.substr(cursor + 1, end - cursor - 1);
        isString = true;
        return true;
    }
    size_t end = cursor;
    while (end < json.size() && json[end] != ',' && json[end] != '}' && json[end] != '\r' && json[end] != '\n') ++end;
    value = json.substr(cursor, end - cursor);
    while (!value.empty() && (value.back() == ' ' || value.back() == '\t')) value.pop_back();
    isString = false;
    return !value.empty();
}

bool ParsePort(const std::string& raw, int& out) {
    if (raw.empty() || raw.size() > 5) return false;
    for (const char c : raw) {
        if (c < '0' || c > '9') return false;
    }
    const int value = std::stoi(raw);
    if (value < 1024 || value > 65535) return false;
    out = value;
    return true;
}

std::wstring Widen(const std::string& text) {
    if (text.empty()) return L"";
    const int count = MultiByteToWideChar(CP_UTF8, 0, text.c_str(), static_cast<int>(text.size()), nullptr, 0);
    std::wstring wide(static_cast<size_t>(count), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, text.c_str(), static_cast<int>(text.size()), wide.data(), count);
    return wide;
}

std::wstring ResolveNodeFromPath() {
    wchar_t buffer[MAX_PATH] = {0};
    const DWORD found = SearchPathW(nullptr, L"node.exe", nullptr, MAX_PATH, buffer, nullptr);
    return found > 0 && found < MAX_PATH ? std::wstring(buffer, found) : L"";
}

std::wstring BuildEnvironment(const ArtemisLayout& layout, const ArtemisConfig& config, const std::wstring& lanIp) {
    std::vector<std::wstring> entries;
    if (wchar_t* block = GetEnvironmentStringsW()) {
        for (const wchar_t* cursor = block; *cursor != L'\0'; cursor += wcslen(cursor) + 1) {
            const std::wstring entry(cursor);
            const std::wstring lower = ToLower(entry);
            if (lower.rfind(L"artemis_", 0) == 0) continue;
            if (lower.rfind(L"path=", 0) == 0) continue;
            entries.push_back(entry);
        }
        FreeEnvironmentStringsW(block);
    }

    std::wstring path = Join(layout.root, L"runtime");
    const DWORD pathLength = GetEnvironmentVariableW(L"PATH", nullptr, 0);
    if (pathLength > 1) {
        std::wstring inherited(pathLength, L'\0');
        const DWORD copied = GetEnvironmentVariableW(L"PATH", inherited.data(), pathLength);
        inherited.resize(copied);
        path += L";" + inherited;
    }
    entries.push_back(L"PATH=" + path);
    entries.push_back(L"ARTEMIS_LAN_HOST=" + lanIp);
    entries.push_back(L"ARTEMIS_DATA_DIR=" + layout.dataDir);
    entries.push_back(L"ARTEMIS_MEDIA_PORT=" + std::to_wstring(config.mediaPort));
    entries.push_back(L"ARTEMIS_CONTROL_PORT=" + std::to_wstring(config.controlPort));
    entries.push_back(L"ARTEMIS_TLS_PORT=" + std::to_wstring(config.tlsPort));
    entries.push_back(L"ARTEMIS_AUDIO_STATUS_PATH=" + Join(layout.dataDir, L"audio-status.json"));

    std::wstring block;
    for (const auto& entry : entries) {
        block += entry;
        block.push_back(L'\0');
    }
    block.push_back(L'\0');
    return block;
}

bool Spawn(const std::wstring& application, const std::wstring& commandLine, const std::wstring& workingDirectory,
           const std::wstring& environment, const std::wstring& logPath, PROCESS_INFORMATION& info, std::wstring& error) {
    STARTUPINFOW startup{};
    startup.cb = sizeof(startup);

    // GUI 模式下没有可继承的控制台句柄；子进程的输出必须落到文件，否则排障时什么都看不到。
    HANDLE log = INVALID_HANDLE_VALUE;
    if (!logPath.empty()) {
        SECURITY_ATTRIBUTES attributes{};
        attributes.nLength = sizeof(attributes);
        attributes.bInheritHandle = TRUE;
        log = CreateFileW(logPath.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE, &attributes,
                          OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (log != INVALID_HANDLE_VALUE) {
            startup.dwFlags |= STARTF_USESTDHANDLES;
            startup.hStdOutput = log;
            startup.hStdError = log;
        }
    }

    std::vector<wchar_t> mutableCommand(commandLine.begin(), commandLine.end());
    mutableCommand.push_back(L'\0');
    const BOOL created = CreateProcessW(application.c_str(), mutableCommand.data(), nullptr, nullptr,
                                        log != INVALID_HANDLE_VALUE ? TRUE : FALSE,
                                        CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT, const_cast<wchar_t*>(environment.c_str()),
                                        workingDirectory.c_str(), &startup, &info);
    if (log != INVALID_HANDLE_VALUE) CloseHandle(log);
    if (!created) {
        error = L"CreateProcessW failed for " + application + L" (error " + std::to_wstring(GetLastError()) + L")";
        return false;
    }
    return true;
}

std::wstring Quote(const std::wstring& text) {
    return L"\"" + text + L"\"";
}

}  // namespace

bool LoadConfig(const std::wstring& exeDir, ArtemisConfig& out, std::wstring& error) {
    error.clear();
    wchar_t buffer[MAX_PATH * 2] = {0};
    DWORD length = GetEnvironmentVariableW(L"LOCALAPPDATA", buffer, static_cast<DWORD>(std::size(buffer)));
    if (length == 0 || length >= std::size(buffer)) {
        error = L"LOCALAPPDATA is not available";
        return false;
    }
    out.dataDir = std::wstring(buffer, length) + L"\\Artemis\\data";

    const std::wstring configPath = Join(exeDir, L"config.json");
    if (!FileExists(configPath)) return true;

    std::string json;
    if (!ReadWholeFile(configPath, json)) {
        error = L"cannot read " + configPath;
        return false;
    }

    for (const auto& key : {std::string("mediaPort"), std::string("controlPort"), std::string("tlsPort")}) {
        std::string raw;
        bool isString = false;
        if (!ReadFlatValue(json, key, raw, isString)) continue;
        int* target = key == "mediaPort" ? &out.mediaPort : key == "controlPort" ? &out.controlPort : &out.tlsPort;
        if (isString || !ParsePort(raw, *target)) {
            error = L"config.json has an invalid " + Widen(key);
            return false;
        }
    }

    std::string dataDir;
    bool isString = false;
    if (ReadFlatValue(json, "dataDir", dataDir, isString) && isString && !dataDir.empty()) {
        out.dataDir = Widen(dataDir);
    }
    return true;
}

bool ResolveLayout(const std::wstring& exeDir, const ArtemisConfig& config, ArtemisLayout& out, std::wstring& error) {
    error.clear();
    out.root = exeDir;
    out.dataDir = config.dataDir;

    const std::wstring bundledNode = Join(Join(exeDir, L"runtime"), L"node.exe");
    std::wstring logBase = config.dataDir;
    const std::wstring dataSuffix = L"\\data";
    if (logBase.size() > dataSuffix.size() &&
        ToLower(logBase.substr(logBase.size() - dataSuffix.size())) == dataSuffix) {
        logBase = logBase.substr(0, logBase.size() - dataSuffix.size());
    }
    out.logDir = Join(logBase, L"logs");

    if (FileExists(bundledNode)) {
        out.installed = true;
        out.nodePath = bundledNode;
        out.receiverEntry = Join(Join(Join(Join(exeDir, L"app"), L"receiver"), L"dist\\src"), L"pairing-cli.js");
        out.nativeDir = Join(Join(exeDir, L"app"), L"native");
    } else {
        out.installed = false;
        const std::wstring repoRoot = Join(Join(exeDir, L".."), L"..");
        out.nodePath = ResolveNodeFromPath();
        out.receiverEntry = Join(Join(Join(repoRoot, L"receiver"), L"dist\\src"), L"pairing-cli.js");
        out.nativeDir = exeDir;
    }

    if (!FileExists(out.nodePath)) {
        error = L"node.exe not found (expected " + bundledNode + L" or node on PATH)";
        return false;
    }
    if (!FileExists(out.receiverEntry)) {
        error = L"receiver entry not found: " + out.receiverEntry;
        return false;
    }
    if (!FileExists(Join(out.nativeDir, L"artemis-decode-host.exe"))) {
        error = L"artemis-decode-host.exe not found in " + out.nativeDir;
        return false;
    }
    return true;
}

bool StartServices(const ArtemisLayout& layout, const ArtemisConfig& config, const std::wstring& lanIp,
                   ServiceHandles& out, std::wstring& error) {
    error.clear();
    out = ServiceHandles{};

    // 端口占用是最常见的启动失败原因；先自己探测，给出可读原因而不是等子进程静默退出（TC-10）。
    struct PortProbe { int port; const wchar_t* role; };
    const PortProbe probes[] = {{config.controlPort, L"控制页端口"}, {config.tlsPort, L"手机连接端口"}, {config.mediaPort, L"媒体端口"}};
    for (const auto& probe : probes) {
        if (!IsPortFree(probe.port)) {
            error = std::wstring(probe.role) + L" " + std::to_wstring(probe.port) +
                    L" 已被其它程序占用，请关闭占用该端口的程序，或修改 config.json 里的端口";
            AppendTrayLog(layout, L"port conflict: " + error);
            return false;
        }
    }

    if (!DirectoryExists(layout.dataDir)) {
        // 逐级创建：%LOCALAPPDATA%\Artemis 这一层在全新机器上并不存在。
        const int status = SHCreateDirectoryExW(nullptr, layout.dataDir.c_str(), nullptr);
        if (status != ERROR_SUCCESS && status != ERROR_ALREADY_EXISTS) {
            error = L"cannot create data directory: " + layout.dataDir + L" (error " + std::to_wstring(status) + L")";
            return false;
        }
    }

    const std::wstring environment = BuildEnvironment(layout, config, lanIp);
    const std::wstring decodeHost = Join(layout.nativeDir, L"artemis-decode-host.exe");

    HANDLE job = CreateJobObjectW(nullptr, nullptr);
    if (job != nullptr) {
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits, sizeof(limits));
        out.job = job;
    }

    PROCESS_INFORMATION decodeInfo{};
    const std::wstring decodeCommand = Quote(decodeHost) + L" --port " + std::to_wstring(config.mediaPort) +
                                       L" --audio-status " + Quote(Join(layout.dataDir, L"audio-status.json"));
    if (!Spawn(decodeHost, decodeCommand, layout.nativeDir, environment, Join(layout.logDir, L"decode-host.log"), decodeInfo, error)) return false;
    out.decodeProcess = decodeInfo.hProcess;
    out.decodePid = decodeInfo.dwProcessId;
    CloseHandle(decodeInfo.hThread);
    if (out.job != nullptr) AssignProcessToJobObject(out.job, out.decodeProcess);

    PROCESS_INFORMATION nodeInfo{};
    const std::wstring nodeCommand = Quote(layout.nodePath) + L" " + Quote(layout.receiverEntry);
    if (!Spawn(layout.nodePath, nodeCommand, layout.root, environment, Join(layout.logDir, L"receiver.log"), nodeInfo, error)) {
        StopServices(out, 2000);
        return false;
    }
    out.nodeProcess = nodeInfo.hProcess;
    out.nodePid = nodeInfo.dwProcessId;
    CloseHandle(nodeInfo.hThread);
    if (out.job != nullptr) AssignProcessToJobObject(out.job, out.nodeProcess);

    AppendTrayLog(layout, L"services started: decode pid=" + std::to_wstring(out.decodePid) + L", node pid=" +
                             std::to_wstring(out.nodePid) + L", lan=" + lanIp + L", control=" +
                             std::to_wstring(config.controlPort));
    return true;
}

void StopServices(ServiceHandles& handles, DWORD graceMs) {
    for (HANDLE* process : {&handles.nodeProcess, &handles.decodeProcess}) {
        if (*process == nullptr) continue;
        if (WaitForSingleObject(*process, graceMs) == WAIT_TIMEOUT) {
            TerminateProcess(*process, 0);
            WaitForSingleObject(*process, 2000);
        }
        CloseHandle(*process);
        *process = nullptr;
    }
    handles.nodePid = 0;
    handles.decodePid = 0;
    if (handles.job != nullptr) {
        CloseHandle(handles.job);
        handles.job = nullptr;
    }
}

bool IsRunning(const ServiceHandles& handles) {
    if (handles.nodeProcess == nullptr || handles.decodeProcess == nullptr) return false;
    return WaitForSingleObject(handles.nodeProcess, 0) == WAIT_TIMEOUT &&
           WaitForSingleObject(handles.decodeProcess, 0) == WAIT_TIMEOUT;
}

void AppendTrayLog(const ArtemisLayout& layout, const std::wstring& message) {
    if (layout.logDir.empty()) return;
    CreateDirectoryW(layout.logDir.c_str(), nullptr);
    const std::wstring path = Join(layout.logDir, L"tray.log");

    SYSTEMTIME now{};
    GetLocalTime(&now);
    wchar_t stamp[40] = {0};
    swprintf_s(stamp, L"%04u-%02u-%02uT%02u:%02u:%02u", now.wYear, now.wMonth, now.wDay, now.wHour, now.wMinute, now.wSecond);

    const std::wstring line = std::wstring(stamp) + L" " + message + L"\r\n";
    const int bytes = WideCharToMultiByte(CP_UTF8, 0, line.c_str(), static_cast<int>(line.size()), nullptr, 0, nullptr, nullptr);
    std::string utf8(static_cast<size_t>(bytes), '\0');
    WideCharToMultiByte(CP_UTF8, 0, line.c_str(), static_cast<int>(line.size()), utf8.data(), bytes, nullptr, nullptr);

    HANDLE file = CreateFileW(path.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ, nullptr, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (file == INVALID_HANDLE_VALUE) return;
    DWORD written = 0;
    WriteFile(file, utf8.data(), static_cast<DWORD>(utf8.size()), &written, nullptr);
    CloseHandle(file);
}
