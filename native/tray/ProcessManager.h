#pragma once

#include <windows.h>

#include <string>

// 端口与数据目录的可选覆盖，来源优先级：config.json > 内置默认值（writer/plan.html §3.3.1）。
struct ArtemisConfig {
    int mediaPort = 3450;
    int controlPort = 3000;
    int tlsPort = 3443;
    std::wstring dataDir;
};

// 安装布局与开发布局的路径解析结果。
struct ArtemisLayout {
    std::wstring root;
    std::wstring nodePath;
    std::wstring receiverEntry;
    std::wstring nativeDir;
    std::wstring dataDir;
    std::wstring logDir;
    bool installed = false;
};

struct ServiceHandles {
    // 子进程加入同一个 Job：托盘被强杀时 Job 关闭，子进程不会变成孤儿。
    HANDLE job = nullptr;
    HANDLE nodeProcess = nullptr;
    HANDLE decodeProcess = nullptr;
    DWORD nodePid = 0;
    DWORD decodePid = 0;
};

bool LoadConfig(const std::wstring& exeDir, ArtemisConfig& out, std::wstring& error);
bool ResolveLayout(const std::wstring& exeDir, const ArtemisConfig& config, ArtemisLayout& out, std::wstring& error);
bool StartServices(const ArtemisLayout& layout, const ArtemisConfig& config, const std::wstring& lanIp,
                   ServiceHandles& out, std::wstring& error);
void StopServices(ServiceHandles& handles, DWORD graceMs);
bool IsRunning(const ServiceHandles& handles);
void AppendTrayLog(const ArtemisLayout& layout, const std::wstring& message);
