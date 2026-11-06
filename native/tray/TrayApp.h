#pragma once

#include <windows.h>
#include <string>

#include "ProcessManager.h"

// 托盘界面：图标 + 右键菜单（打开控制页 / 重启服务 / 打开日志目录 / 退出）。
// 只做进程管家，不提供设置面板与开机自启（writer/plan.html §3.3、D-008）。
int RunTray(HINSTANCE instance, const ArtemisLayout& layout, const ArtemisConfig& config, const std::wstring& lanIp);

bool OpenControlPage(const ArtemisConfig& config);
bool OpenLogDirectory(const ArtemisLayout& layout);
