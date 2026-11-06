#include "TrayApp.h"

#include <shellapi.h>

#include <cstring>

namespace {

constexpr wchar_t kWindowClass[] = L"ArtemisTrayWnd";
constexpr int kAppIconResource = 101;
constexpr int kTrayIconResource = 102;
constexpr wchar_t kIconHint[] = L"Artemis";
constexpr wchar_t kWindowTitle[] = L"Artemis";
constexpr UINT kTrayMessage = WM_APP + 1;
constexpr UINT kWatchTimer = 1;
constexpr UINT kSlowTimer = 2;
constexpr UINT kMenuOpenControl = 1001;
constexpr UINT kMenuRestart = 1002;
constexpr UINT kMenuOpenLogs = 1003;
constexpr UINT kMenuExit = 1004;
constexpr int kMaxAutoRestarts = 1;

struct TrayState {
    ArtemisLayout layout;
    ArtemisConfig config;
    std::wstring lanIp;
    ServiceHandles services;
    bool servicesStarted = false;
    int autoRestarts = 0;
    bool failureNotified = false;   // 启动失败只提示一次，之后静默重试，避免每轮弹一次通知
};

TrayState* State(HWND window) {
    return reinterpret_cast<TrayState*>(GetWindowLongPtrW(window, GWLP_USERDATA));
}

void ShowBalloon(HWND window, const wchar_t* title, const std::wstring& text) {
    NOTIFYICONDATAW data{};
    data.cbSize = sizeof(data);
    data.hWnd = window;
    data.uID = 1;
    data.uFlags = NIF_INFO;
    data.dwInfoFlags = NIIF_WARNING;
    wcsncpy_s(data.szInfoTitle, title, _TRUNCATE);
    wcsncpy_s(data.szInfo, text.c_str(), _TRUNCATE);
    Shell_NotifyIconW(NIM_MODIFY, &data);
}

void StartAndArm(HWND window) {
    TrayState* state = State(window);
    if (state == nullptr) return;
    std::wstring error;
    if (!StartServices(state->layout, state->config, state->lanIp, state->services, error)) {
        state->servicesStarted = false;
        AppendTrayLog(state->layout, L"start failed: " + error);
        if (!state->failureNotified) {
            state->failureNotified = true;
            ShowBalloon(window, L"Artemis 无法启动", error + L"（详见 tray.log）");
        }
        SetTimer(window, kSlowTimer, 60000, nullptr);
        return;
    }
    state->servicesStarted = true;
    state->failureNotified = false;
    SetTimer(window, kWatchTimer, 3000, nullptr);
}

}  // namespace

bool OpenControlPage(const ArtemisConfig& config) {
    const std::wstring url = L"http://127.0.0.1:" + std::to_wstring(config.controlPort) + L"/control";
    return reinterpret_cast<INT_PTR>(ShellExecuteW(nullptr, L"open", url.c_str(), nullptr, nullptr, SW_SHOWNORMAL)) > 32;
}

bool OpenLogDirectory(const ArtemisLayout& layout) {
    return reinterpret_cast<INT_PTR>(ShellExecuteW(nullptr, L"open", layout.logDir.c_str(), nullptr, nullptr, SW_SHOWNORMAL)) > 32;
}

int RunTray(HINSTANCE instance, const ArtemisLayout& layout, const ArtemisConfig& config, const std::wstring& lanIp) {
    TrayState state;
    state.layout = layout;
    state.config = config;
    state.lanIp = lanIp;

    WNDCLASSEXW windowClass{};
    windowClass.cbSize = sizeof(windowClass);
    windowClass.lpfnWndProc = [](HWND window, UINT message, WPARAM wParam, LPARAM lParam) -> LRESULT {
        TrayState* state = State(window);
        switch (message) {
        case kTrayMessage:
            if (LOWORD(lParam) == WM_LBUTTONDBLCLK && state != nullptr) {
                OpenControlPage(state->config);
                return 0;
            }
            if (LOWORD(lParam) == WM_RBUTTONUP || LOWORD(lParam) == WM_CONTEXTMENU) {
                POINT cursor{};
                GetCursorPos(&cursor);
                HMENU menu = CreatePopupMenu();
                AppendMenuW(menu, MF_STRING, kMenuOpenControl, L"打开控制页");
                AppendMenuW(menu, MF_STRING, kMenuRestart, L"重启服务");
                AppendMenuW(menu, MF_STRING, kMenuOpenLogs, L"打开日志目录");
                AppendMenuW(menu, MF_SEPARATOR, 0, nullptr);
                AppendMenuW(menu, MF_STRING, kMenuExit, L"退出");
                SetForegroundWindow(window);
                const UINT command = TrackPopupMenu(menu, TPM_RETURNCMD | TPM_RIGHTBUTTON, cursor.x, cursor.y, 0, window, nullptr);
                DestroyMenu(menu);
                if (command != 0) PostMessageW(window, WM_COMMAND, command, 0);
                return 0;
            }
            return 0;
        case WM_COMMAND:
            if (state == nullptr) return 0;
            switch (LOWORD(wParam)) {
            case kMenuOpenControl:
                OpenControlPage(state->config);
                return 0;
            case kMenuRestart:
                KillTimer(window, kSlowTimer);
                StopServices(state->services, 3000);
                state->autoRestarts = 0;
                StartAndArm(window);
                return 0;
            case kMenuOpenLogs:
                OpenLogDirectory(state->layout);
                return 0;
            case kMenuExit:
                DestroyWindow(window);
                return 0;
            default:
                return 0;
            }
        case WM_TIMER:
            if (state == nullptr) return 0;
            if (wParam == kSlowTimer) {
                // 之前启动失败，慢速探测，不在后台反复拉起。
                KillTimer(window, kSlowTimer);
                StartAndArm(window);
                return 0;
            }
            if (wParam == kWatchTimer && state->servicesStarted && !IsRunning(state->services)) {
                KillTimer(window, kWatchTimer);
                AppendTrayLog(state->layout, L"a service exited unexpectedly");
                if (state->autoRestarts < kMaxAutoRestarts) {
                    state->autoRestarts += 1;
                    StopServices(state->services, 1000);
                    ShowBalloon(window, L"Artemis 服务已停止", L"正在尝试重启一次，详见 tray.log");
                    StartAndArm(window);
                } else {
                    state->servicesStarted = false;
                    ShowBalloon(window, L"Artemis 服务反复退出", L"已停止自动重启，请右键「重启服务」或查看 tray.log");
                    SetTimer(window, kSlowTimer, 60000, nullptr);
                }
            }
            return 0;
        case WM_DESTROY:
            if (state != nullptr) {
                StopServices(state->services, 3000);
                AppendTrayLog(state->layout, L"tray exited after stopping services");
            }
            {
                NOTIFYICONDATAW data{};
                data.cbSize = sizeof(data);
                data.hWnd = window;
                data.uID = 1;
                Shell_NotifyIconW(NIM_DELETE, &data);
            }
            PostQuitMessage(0);
            return 0;
        default:
            return DefWindowProcW(window, message, wParam, lParam);
        }
    };
    windowClass.hInstance = instance;
    windowClass.lpszClassName = kWindowClass;
    windowClass.hIcon = LoadIconW(instance, MAKEINTRESOURCEW(kAppIconResource));
    windowClass.hIconSm = LoadIconW(instance, MAKEINTRESOURCEW(kTrayIconResource));
    windowClass.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    if (!RegisterClassExW(&windowClass)) return 5;

    HWND window = CreateWindowExW(0, kWindowClass, kWindowTitle, 0, 0, 0, 0, 0, nullptr, nullptr, instance, nullptr);
    if (window == nullptr) return 6;
    SetWindowLongPtrW(window, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(&state));

    NOTIFYICONDATAW icon{};
    icon.cbSize = sizeof(icon);
    icon.hWnd = window;
    icon.uID = 1;
    icon.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
    icon.uCallbackMessage = kTrayMessage;
    icon.hIcon = LoadIconW(GetModuleHandleW(nullptr), MAKEINTRESOURCEW(kTrayIconResource));
    if (icon.hIcon == nullptr) icon.hIcon = LoadIconW(nullptr, IDI_APPLICATION);
    wcsncpy_s(icon.szTip, L"Artemis", _TRUNCATE);
    if (!Shell_NotifyIconW(NIM_ADD, &icon)) {
        DestroyWindow(window);
        return 7;
    }

    StartAndArm(window);

    MSG message{};
    while (GetMessageW(&message, nullptr, 0, 0) > 0) {
        TranslateMessage(&message);
        DispatchMessageW(&message);
    }
    return 0;
}
