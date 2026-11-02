#include "WasapiSink.h"

#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <functiondiscoverykeys_devpkey.h>
#include <propsys.h>

#include <cstdio>
#include <cwchar>

namespace artemis
{
    namespace
    {
        std::string toUtf8(const wchar_t *text)
        {
            if (text == nullptr)
                return {};
            const int size = WideCharToMultiByte(CP_UTF8, 0, text, -1, nullptr, 0, nullptr, nullptr);
            if (size <= 1)
                return {};
            std::string out(static_cast<size_t>(size - 1), '\0');
            WideCharToMultiByte(CP_UTF8, 0, text, -1, out.data(), size, nullptr, nullptr);
            return out;
        }

        std::wstring toWide(const std::string &text)
        {
            if (text.empty())
                return {};
            const int size = MultiByteToWideChar(CP_UTF8, 0, text.c_str(), -1, nullptr, 0);
            std::wstring out(static_cast<size_t>(size), L'\0');
            MultiByteToWideChar(CP_UTF8, 0, text.c_str(), -1, out.data(), size);
            if (!out.empty() && out.back() == L'\0')
                out.pop_back();
            return out;
        }

        std::string friendlyName(IMMDevice *device)
        {
            IPropertyStore *store = nullptr;
            if (device == nullptr || FAILED(device->OpenPropertyStore(STGM_READ, &store)))
                return {};
            PROPVARIANT value;
            PropVariantInit(&value);
            std::string name;
            if (SUCCEEDED(store->GetValue(PKEY_Device_FriendlyName, &value)) && value.vt == VT_LPWSTR)
                name = toUtf8(value.pwszVal);
            PropVariantClear(&value);
            store->Release();
            return name;
        }
    }

    struct WasapiSink::Impl
    {
        IMMDeviceEnumerator *enumerator = nullptr;
        IMMDevice *device = nullptr;
        IAudioClient *client = nullptr;
        IAudioRenderClient *render = nullptr;
        WAVEFORMATEX *format = nullptr;
        HANDLE event = nullptr;
        uint32_t bufferFrames = 0;
        uint32_t sampleRate = 48000;
        uint32_t channels = 1;
        std::vector<float> pending;
        UINT32 deviceChannels = 1;
    };

    std::vector<std::string> listRenderEndpoints()
    {
        std::vector<std::string> names;
        IMMDeviceEnumerator *enumerator = nullptr;
        if (FAILED(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
                                    __uuidof(IMMDeviceEnumerator), reinterpret_cast<void **>(&enumerator))))
            return names;

        IMMDeviceCollection *collection = nullptr;
        if (SUCCEEDED(enumerator->EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE, &collection)))
        {
            UINT count = 0;
            collection->GetCount(&count);
            for (UINT index = 0; index < count; ++index)
            {
                IMMDevice *device = nullptr;
                if (SUCCEEDED(collection->Item(index, &device)))
                {
                    const std::string name = friendlyName(device);
                    if (!name.empty())
                        names.push_back(name);
                    device->Release();
                }
            }
            collection->Release();
        }
        enumerator->Release();
        return names;
    }

    bool WasapiSink::open(uint32_t sampleRate, uint32_t channels)
    {
        close();

        impl_ = new Impl();
        impl_->sampleRate = sampleRate;

        if (FAILED(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
                                    __uuidof(IMMDeviceEnumerator), reinterpret_cast<void **>(&impl_->enumerator))))
        {
            close();
            return false;
        }

        IMMDeviceCollection *collection = nullptr;
        if (FAILED(impl_->enumerator->EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE, &collection)))
        {
            close();
            return false;
        }

        const std::wstring wanted = toWide(deviceName_);
        UINT count = 0;
        collection->GetCount(&count);
        for (UINT index = 0; index < count && impl_->device == nullptr; ++index)
        {
            IMMDevice *candidate = nullptr;
            if (FAILED(collection->Item(index, &candidate)))
                continue;
            const std::string name = friendlyName(candidate);
            bool matches = deviceName_.empty();
            if (!matches)
            {
                std::string lower = name;
                for (char &c : lower)
                    c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
                std::string needle = deviceName_;
                for (char &c : needle)
                    c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
                matches = lower.find(needle) != std::string::npos;
            }
            if (matches)
                impl_->device = candidate;
            else
                candidate->Release();
        }
        collection->Release();
        if (impl_->device == nullptr)
        {
            close();
            return false;
        }

        if (FAILED(impl_->device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr,
                                           reinterpret_cast<void **>(&impl_->client))))
        {
            close();
            return false;
        }
        if (FAILED(impl_->client->GetMixFormat(&impl_->format)))
        {
            close();
            return false;
        }

        impl_->event = CreateEventW(nullptr, FALSE, FALSE, nullptr);
        const DWORD flags = AUDCLNT_STREAMFLAGS_EVENTCALLBACK;
        // 100 ms 共享模式缓冲：足够吸收调度抖动，又不至于让延迟不可接受。
        if (FAILED(impl_->client->Initialize(AUDCLNT_SHAREMODE_SHARED, flags,
                                             1000000, 0, impl_->format, nullptr)))
        {
            close();
            return false;
        }
        if (FAILED(impl_->client->SetEventHandle(impl_->event)))
        {
            close();
            return false;
        }
        if (FAILED(impl_->client->GetBufferSize(&impl_->bufferFrames)))
        {
            close();
            return false;
        }
        if (FAILED(impl_->client->GetService(__uuidof(IAudioRenderClient),
                                             reinterpret_cast<void **>(&impl_->render))))
        {
            close();
            return false;
        }

        impl_->deviceChannels = impl_->format->nChannels;
        (void)channels;
        if (FAILED(impl_->client->Start()))
        {
            close();
            return false;
        }
        return true;
    }

    bool WasapiSink::write(const float *samples, uint32_t frames)
    {
        if (impl_ == nullptr || impl_->render == nullptr || samples == nullptr)
            return false;

        // 设备混音格式可能是多声道，这里把单声道数据复制到每个声道。
        impl_->pending.clear();
        impl_->pending.reserve(static_cast<size_t>(frames) * impl_->deviceChannels);
        for (uint32_t frame = 0; frame < frames; ++frame)
            for (UINT32 channel = 0; channel < impl_->deviceChannels; ++channel)
                impl_->pending.push_back(samples[frame]);

        UINT32 offset = 0;
        const UINT32 total = frames;
        while (offset < total)
        {
            WaitForSingleObject(impl_->event, 100);
            UINT32 padding = 0;
            if (FAILED(impl_->client->GetCurrentPadding(&padding)))
                return false;
            const UINT32 available = impl_->bufferFrames - padding;
            if (available == 0)
                continue;

            const UINT32 chunk = (total - offset) < available ? (total - offset) : available;
            BYTE *buffer = nullptr;
            if (FAILED(impl_->render->GetBuffer(chunk, &buffer)))
                return false;
            std::memcpy(buffer, impl_->pending.data() + static_cast<size_t>(offset) * impl_->deviceChannels,
                        static_cast<size_t>(chunk) * impl_->deviceChannels * sizeof(float));
            impl_->render->ReleaseBuffer(chunk, 0);
            offset += chunk;
        }
        return true;
    }

    void WasapiSink::close()
    {
        if (impl_ == nullptr)
            return;
        if (impl_->client != nullptr)
        {
            impl_->client->Stop();
            impl_->client->Release();
        }
        if (impl_->render != nullptr)
            impl_->render->Release();
        if (impl_->format != nullptr)
            CoTaskMemFree(impl_->format);
        if (impl_->event != nullptr)
            CloseHandle(impl_->event);
        if (impl_->device != nullptr)
            impl_->device->Release();
        if (impl_->enumerator != nullptr)
            impl_->enumerator->Release();
        delete impl_;
        impl_ = nullptr;
    }
}
