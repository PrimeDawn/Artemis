// COM DLL 入口与注册逻辑。不依赖 BaseClasses。
// 依据 writer/plan.html §2 与 §4。
#include "Filter.h"
#include "Pin.h"

#include <windows.h>
#include <olectl.h>

#include <new>
#include <string>

using namespace artemis;

namespace
{
    const wchar_t kFriendlyName[] = L"Artemis Camera";
    const wchar_t kDeviceCategory[] = L"{860BB310-5D01-11D0-BD3B-00A0C911CE86}";

    class ClassFactory : public IClassFactory
    {
    public:
        STDMETHODIMP QueryInterface(REFIID riid, void **value) override
        {
            if (value == nullptr)
                return E_POINTER;
            if (riid == IID_IUnknown || riid == IID_IClassFactory)
            {
                *value = static_cast<IClassFactory *>(this);
                AddRef();
                return S_OK;
            }
            *value = nullptr;
            return E_NOINTERFACE;
        }

        STDMETHODIMP_(ULONG) AddRef() override { return ++references_; }

        STDMETHODIMP_(ULONG) Release() override
        {
            const ULONG remaining = --references_;
            if (remaining == 0)
                delete this;
            return remaining;
        }

        STDMETHODIMP CreateInstance(IUnknown *outer, REFIID riid, void **value) override
        {
            if (value == nullptr)
                return E_POINTER;
            *value = nullptr;
            if (outer != nullptr)
                return CLASS_E_NOAGGREGATION;
            auto *filter = new (std::nothrow) Filter();
            if (filter == nullptr)
                return E_OUTOFMEMORY;
            const HRESULT result = filter->QueryInterface(riid, value);
            filter->Release();
            return result;
        }

        STDMETHODIMP LockServer(BOOL) override { return S_OK; }

    private:
        std::atomic<ULONG> references_{1};
    };

    HRESULT WriteString(HKEY root, const wchar_t *subKey, const wchar_t *name, const wchar_t *value)
    {
        HKEY key = nullptr;
        const LSTATUS status = RegCreateKeyExW(root, subKey, 0, nullptr, 0, KEY_WRITE, nullptr, &key, nullptr);
        if (status != ERROR_SUCCESS)
            return HRESULT_FROM_WIN32(status);
        const auto bytes = static_cast<DWORD>((wcslen(value) + 1) * sizeof(wchar_t));
        const LSTATUS written = RegSetValueExW(key, name, 0, REG_SZ, reinterpret_cast<const BYTE *>(value), bytes);
        RegCloseKey(key);
        return written == ERROR_SUCCESS ? S_OK : HRESULT_FROM_WIN32(written);
    }

    HRESULT ModulePath(wchar_t *path, DWORD size)
    {
        HMODULE module = nullptr;
        if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                                reinterpret_cast<LPCWSTR>(&ModulePath), &module))
            return HRESULT_FROM_WIN32(GetLastError());
        const DWORD written = GetModuleFileNameW(module, path, size);
        return written == 0 ? HRESULT_FROM_WIN32(GetLastError()) : S_OK;
    }

    std::wstring ClsidString(const CLSID &clsid)
    {
        wchar_t buffer[64] = {};
        StringFromGUID2(clsid, buffer, 64);
        return buffer;
    }
}

extern "C" HRESULT __stdcall DllGetClassObject(REFCLSID clsid, REFIID riid, void **value)
{
    if (value == nullptr)
        return E_POINTER;
    *value = nullptr;
    if (!IsEqualCLSID(clsid, kFilterClsid))
        return CLASS_E_CLASSNOTAVAILABLE;
    auto *factory = new (std::nothrow) ClassFactory();
    if (factory == nullptr)
        return E_OUTOFMEMORY;
    const HRESULT result = factory->QueryInterface(riid, value);
    factory->Release();
    return result;
}

extern "C" HRESULT __stdcall DllCanUnloadNow() { return S_FALSE; }

extern "C" HRESULT __stdcall DllRegisterServer()
{
    wchar_t module[MAX_PATH] = {};
    HRESULT result = ModulePath(module, MAX_PATH);
    if (FAILED(result))
        return result;

    const std::wstring clsid = ClsidString(kFilterClsid);
    const std::wstring clsidKey = L"Software\\Classes\\CLSID\\" + clsid;

    result = WriteString(HKEY_CURRENT_USER, clsidKey.c_str(), nullptr, kFriendlyName);
    if (FAILED(result))
        return result;
    result = WriteString(HKEY_CURRENT_USER, (clsidKey + L"\\InprocServer32").c_str(), nullptr, module);
    if (FAILED(result))
        return result;
    result = WriteString(HKEY_CURRENT_USER, (clsidKey + L"\\InprocServer32").c_str(), L"ThreadingModel", L"Both");
    if (FAILED(result))
        return result;

    // 登记到 VideoInputDeviceCategory，OBS 只枚举这个类别。
    const std::wstring instance = std::wstring(L"Software\\Classes\\CLSID\\") + kDeviceCategory + L"\\Instance\\" + clsid;
    result = WriteString(HKEY_CURRENT_USER, instance.c_str(), L"FriendlyName", kFriendlyName);
    if (FAILED(result))
        return result;
    result = WriteString(HKEY_CURRENT_USER, instance.c_str(), L"CLSID", clsid.c_str());
    if (FAILED(result))
        return result;
    // OBS 从 DevicePath 构造设备 ID；与 moniker 显示名保持一致。
    const std::wstring devicePath = std::wstring(L"@device:sw:") + kDeviceCategory + L"\\" + clsid;
    return WriteString(HKEY_CURRENT_USER, instance.c_str(), L"DevicePath", devicePath.c_str());
}

extern "C" HRESULT __stdcall DllUnregisterServer()
{
    const std::wstring clsid = ClsidString(kFilterClsid);
    const std::wstring clsidKey = L"Software\\Classes\\CLSID\\" + clsid;
    const std::wstring instance = std::wstring(L"Software\\Classes\\CLSID\\") + kDeviceCategory + L"\\Instance\\" + clsid;

    RegDeleteTreeW(HKEY_CURRENT_USER, instance.c_str());
    RegDeleteTreeW(HKEY_CURRENT_USER, clsidKey.c_str());
    return S_OK;
}

BOOL APIENTRY DllMain(HMODULE, DWORD, LPVOID) { return TRUE; }
