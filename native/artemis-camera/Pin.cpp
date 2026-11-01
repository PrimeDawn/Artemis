#include "Pin.h"
#include "Filter.h"

#include <dvdmedia.h>
#include <new>

namespace artemis
{
    namespace
    {
        constexpr uint32_t kWidth = 1280;
        constexpr uint32_t kHeight = 720;
        constexpr REFERENCE_TIME kFrameDuration = 333333; // 30fps，单位 100ns

        void FreeMediaType(AM_MEDIA_TYPE &type)
        {
            if (type.cbFormat != 0)
            {
                CoTaskMemFree(type.pbFormat);
                type.cbFormat = 0;
                type.pbFormat = nullptr;
            }
            if (type.pUnk != nullptr)
            {
                type.pUnk->Release();
                type.pUnk = nullptr;
            }
        }

        void CopyMediaType(AM_MEDIA_TYPE &destination, const AM_MEDIA_TYPE &source)
        {
            destination = source;
            if (source.cbFormat != 0)
            {
                destination.pbFormat = static_cast<BYTE *>(CoTaskMemAlloc(source.cbFormat));
                if (destination.pbFormat != nullptr)
                    memcpy(destination.pbFormat, source.pbFormat, source.cbFormat);
                else
                    destination.cbFormat = 0;
            }
            if (destination.pUnk != nullptr)
                destination.pUnk->AddRef();
        }

        void FillVideoFormat(AM_MEDIA_TYPE &type, VIDEOINFOHEADER &header)
        {
            ZeroMemory(&type, sizeof(type));
            ZeroMemory(&header, sizeof(header));
            header.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
            header.bmiHeader.biWidth = static_cast<LONG>(kWidth);
            header.bmiHeader.biHeight = -static_cast<LONG>(kHeight); // 顶行优先
            header.bmiHeader.biPlanes = 1;
            header.bmiHeader.biBitCount = 32;
            header.bmiHeader.biCompression = BI_RGB;
            header.bmiHeader.biSizeImage = kWidth * kHeight * 4;
            header.AvgTimePerFrame = kFrameDuration;

            type.majortype = MEDIATYPE_Video;
            type.subtype = MEDIASUBTYPE_RGB32;
            type.bFixedSizeSamples = TRUE;
            type.bTemporalCompression = FALSE;
            type.lSampleSize = kWidth * kHeight * 4;
            type.formattype = FORMAT_VideoInfo;
            type.cbFormat = sizeof(VIDEOINFOHEADER);
            type.pbFormat = reinterpret_cast<BYTE *>(&header);
        }

        // 把栈上的 VIH 提升为堆上 AM_MEDIA_TYPE（OBS 会长期持有）。
        AM_MEDIA_TYPE *CreateVideoType()
        {
            VIDEOINFOHEADER header;
            AM_MEDIA_TYPE stack;
            FillVideoFormat(stack, header);
            auto *result = static_cast<AM_MEDIA_TYPE *>(CoTaskMemAlloc(sizeof(AM_MEDIA_TYPE)));
            if (result == nullptr)
                return nullptr;
            CopyMediaType(*result, stack);
            return result;
        }

        bool MatchesVideoFormat(const AM_MEDIA_TYPE *type)
        {
            if (type == nullptr)
                return false;
            if (type->majortype != MEDIATYPE_Video || type->subtype != MEDIASUBTYPE_RGB32)
                return false;
            if (type->formattype == FORMAT_VideoInfo && type->cbFormat >= sizeof(VIDEOINFOHEADER))
            {
                const auto *header = reinterpret_cast<const VIDEOINFOHEADER *>(type->pbFormat);
                return header->bmiHeader.biWidth == static_cast<LONG>(kWidth)
                    && (header->bmiHeader.biHeight == -static_cast<LONG>(kHeight) || header->bmiHeader.biHeight == static_cast<LONG>(kHeight))
                    && header->bmiHeader.biBitCount == 32;
            }
            if (type->formattype == FORMAT_VideoInfo2 && type->cbFormat >= sizeof(VIDEOINFOHEADER2))
            {
                const auto *header = reinterpret_cast<const VIDEOINFOHEADER2 *>(type->pbFormat);
                return header->bmiHeader.biWidth == static_cast<LONG>(kWidth)
                    && (header->bmiHeader.biHeight == -static_cast<LONG>(kHeight) || header->bmiHeader.biHeight == static_cast<LONG>(kHeight))
                    && header->bmiHeader.biBitCount == 32;
            }
            return false;
        }

        class MediaTypesEnumerator : public IEnumMediaTypes
        {
        public:
            MediaTypesEnumerator(AM_MEDIA_TYPE *type, ULONG index) : type_(type), index_(index) {}

            STDMETHODIMP QueryInterface(REFIID riid, void **value) override
            {
                if (value == nullptr)
                    return E_POINTER;
                if (riid == IID_IUnknown || riid == IID_IEnumMediaTypes)
                {
                    *value = static_cast<IEnumMediaTypes *>(this);
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

            STDMETHODIMP Next(ULONG count, AM_MEDIA_TYPE **types, ULONG *fetched) override
            {
                if (types == nullptr)
                    return E_POINTER;
                ULONG done = 0;
                while (done < count && index_ == 0)
                {
                    auto *copy = static_cast<AM_MEDIA_TYPE *>(CoTaskMemAlloc(sizeof(AM_MEDIA_TYPE)));
                    if (copy == nullptr)
                        break;
                    CopyMediaType(*copy, *type_);
                    types[done] = copy;
                    ++done;
                    ++index_;
                }
                if (fetched != nullptr)
                    *fetched = done;
                return done == count ? S_OK : S_FALSE;
            }

            STDMETHODIMP Skip(ULONG count) override
            {
                index_ += count;
                return index_ <= 1 ? S_OK : S_FALSE;
            }

            STDMETHODIMP Reset() override
            {
                index_ = 0;
                return S_OK;
            }

            STDMETHODIMP Clone(IEnumMediaTypes **types) override
            {
                if (types == nullptr)
                    return E_POINTER;
                *types = new (std::nothrow) MediaTypesEnumerator(type_, index_);
                return *types == nullptr ? E_OUTOFMEMORY : S_OK;
            }

        private:
            std::atomic<ULONG> references_{1};
            AM_MEDIA_TYPE *type_ = nullptr;
            ULONG index_ = 0;
        };
    }

    Sample::Sample(size_t capacity) : capacity_(capacity)
    {
        buffer_ = new (std::nothrow) BYTE[capacity];
        if (buffer_ == nullptr)
            capacity_ = 0;
    }

    Sample::~Sample()
    {
        delete[] buffer_;
        if (mediaType_ != nullptr)
        {
            FreeMediaType(*mediaType_);
            CoTaskMemFree(mediaType_);
        }
    }

    STDMETHODIMP Sample::QueryInterface(REFIID riid, void **value)
    {
        if (value == nullptr)
            return E_POINTER;
        if (riid == IID_IUnknown || riid == IID_IMediaSample)
        {
            *value = static_cast<IMediaSample *>(this);
            AddRef();
            return S_OK;
        }
        *value = nullptr;
        return E_NOINTERFACE;
    }

    STDMETHODIMP_(ULONG) Sample::AddRef() { return ++references_; }

    STDMETHODIMP_(ULONG) Sample::Release()
    {
        const ULONG remaining = --references_;
        if (remaining == 0)
            delete this;
        return remaining;
    }

    STDMETHODIMP Sample::GetPointer(BYTE **value)
    {
        if (value == nullptr)
            return E_POINTER;
        *value = buffer_;
        return S_OK;
    }

    STDMETHODIMP_(LONG) Sample::GetSize() { return static_cast<LONG>(capacity_); }

    STDMETHODIMP Sample::GetTime(REFERENCE_TIME *start, REFERENCE_TIME *end)
    {
        if (start != nullptr)
            *start = start_;
        if (end != nullptr)
            *end = end_;
        return S_OK;
    }

    STDMETHODIMP Sample::SetTime(REFERENCE_TIME *start, REFERENCE_TIME *end)
    {
        if (start != nullptr)
            start_ = *start;
        if (end != nullptr)
            end_ = *end;
        return S_OK;
    }

    STDMETHODIMP Sample::GetMediaTime(LONGLONG *start, LONGLONG *end)
    {
        if (start != nullptr)
            *start = mediaStart_;
        if (end != nullptr)
            *end = mediaEnd_;
        return S_OK;
    }

    STDMETHODIMP Sample::SetMediaTime(LONGLONG *start, LONGLONG *end)
    {
        if (start != nullptr)
            mediaStart_ = *start;
        if (end != nullptr)
            mediaEnd_ = *end;
        return S_OK;
    }

    STDMETHODIMP Sample::IsSyncPoint() { return sync_ ? S_OK : S_FALSE; }
    STDMETHODIMP Sample::SetSyncPoint(BOOL value) { sync_ = value; return S_OK; }
    STDMETHODIMP Sample::IsPreroll() { return preroll_ ? S_OK : S_FALSE; }
    STDMETHODIMP Sample::SetPreroll(BOOL value) { preroll_ = value; return S_OK; }
    STDMETHODIMP Sample::GetActualDataLength() { return dataLength_; }

    STDMETHODIMP Sample::SetActualDataLength(LONG value)
    {
        if (value < 0 || static_cast<size_t>(value) > capacity_)
            return E_INVALIDARG;
        dataLength_ = value;
        return S_OK;
    }

    STDMETHODIMP Sample::GetMediaType(AM_MEDIA_TYPE **value)
    {
        if (value == nullptr)
            return E_POINTER;
        *value = mediaType_;
        return mediaType_ != nullptr ? S_OK : S_FALSE;
    }

    STDMETHODIMP Sample::SetMediaType(AM_MEDIA_TYPE *value)
    {
        if (mediaType_ != nullptr)
        {
            FreeMediaType(*mediaType_);
            CoTaskMemFree(mediaType_);
            mediaType_ = nullptr;
        }
        if (value == nullptr)
            return S_OK;
        mediaType_ = static_cast<AM_MEDIA_TYPE *>(CoTaskMemAlloc(sizeof(AM_MEDIA_TYPE)));
        if (mediaType_ == nullptr)
            return E_OUTOFMEMORY;
        CopyMediaType(*mediaType_, *value);
        return S_OK;
    }

    STDMETHODIMP Sample::IsDiscontinuity() { return discontinuity_ ? S_OK : S_FALSE; }
    STDMETHODIMP Sample::SetDiscontinuity(BOOL value) { discontinuity_ = value; return S_OK; }

    OutputPin::OutputPin(Filter *filter, const wchar_t *name) : filter_(filter)
    {
        wcscpy_s(name_, name == nullptr ? L"Capture" : name);
        current_ = new (std::nothrow) Sample(static_cast<size_t>(kWidth) * kHeight * 4u);
        if (current_ != nullptr)
            current_->AddRef();
    }

    OutputPin::~OutputPin()
    {
        Stop();
        if (current_ != nullptr)
            current_->Release();
        if (connectionType_ != nullptr)
        {
            FreeMediaType(*connectionType_);
            CoTaskMemFree(connectionType_);
        }
        if (input_ != nullptr)
            input_->Release();
        if (connection_ != nullptr)
            connection_->Release();
    }

    STDMETHODIMP OutputPin::QueryInterface(REFIID riid, void **value)
    {
        if (value == nullptr)
            return E_POINTER;
        if (riid == IID_IUnknown || riid == IID_IPin)
            *value = static_cast<IPin *>(this);
        else if (riid == IID_IAMStreamConfig)
            *value = static_cast<IAMStreamConfig *>(this);
        else
        {
            *value = nullptr;
            return E_NOINTERFACE;
        }
        AddRef();
        return S_OK;
    }

    STDMETHODIMP_(ULONG) OutputPin::AddRef() { return ++references_; }

    STDMETHODIMP_(ULONG) OutputPin::Release()
    {
        const ULONG remaining = --references_;
        if (remaining == 0)
            delete this;
        return remaining;
    }

    STDMETHODIMP OutputPin::Connect(IPin *receivePin, const AM_MEDIA_TYPE *)
    {
        if (receivePin == nullptr)
            return E_POINTER;
        if (connection_ != nullptr)
            return VFW_E_ALREADY_CONNECTED;

        PIN_DIRECTION direction;
        if (FAILED(receivePin->QueryDirection(&direction)) || direction != PINDIR_INPUT)
            return VFW_E_INVALID_DIRECTION;

        auto *type = CreateVideoType();
        if (type == nullptr)
            return E_OUTOFMEMORY;
        const HRESULT result = receivePin->ReceiveConnection(this, type);
        if (SUCCEEDED(result))
        {
            connection_ = receivePin;
            connection_->AddRef();
            receivePin->QueryInterface(IID_IMemInputPin, reinterpret_cast<void **>(&input_));
            connectionType_ = type;
        }
        else
        {
            FreeMediaType(*type);
            CoTaskMemFree(type);
        }
        return result;
    }

    STDMETHODIMP OutputPin::ReceiveConnection(IPin *, const AM_MEDIA_TYPE *) { return E_UNEXPECTED; }

    STDMETHODIMP OutputPin::Disconnect()
    {
        Stop();
        if (input_ != nullptr)
        {
            input_->Release();
            input_ = nullptr;
        }
        if (connection_ != nullptr)
        {
            connection_->Release();
            connection_ = nullptr;
        }
        if (connectionType_ != nullptr)
        {
            FreeMediaType(*connectionType_);
            CoTaskMemFree(connectionType_);
            connectionType_ = nullptr;
        }
        return S_OK;
    }

    STDMETHODIMP OutputPin::ConnectedTo(IPin **pin)
    {
        if (pin == nullptr)
            return E_POINTER;
        *pin = connection_;
        if (connection_ != nullptr)
        {
            connection_->AddRef();
            return S_OK;
        }
        return VFW_E_NOT_CONNECTED;
    }

    STDMETHODIMP OutputPin::ConnectionMediaType(AM_MEDIA_TYPE *mt)
    {
        if (mt == nullptr)
            return E_POINTER;
        if (connectionType_ == nullptr)
            return VFW_E_NOT_CONNECTED;
        CopyMediaType(*mt, *connectionType_);
        return S_OK;
    }

    STDMETHODIMP OutputPin::QueryPinInfo(PIN_INFO *info)
    {
        if (info == nullptr)
            return E_POINTER;
        info->pFilter = static_cast<IBaseFilter *>(filter_);
        if (filter_ != nullptr)
            filter_->AddRef();
        info->dir = PINDIR_OUTPUT;
        wcscpy_s(info->achName, name_);
        return S_OK;
    }

    STDMETHODIMP OutputPin::QueryDirection(PIN_DIRECTION *direction)
    {
        if (direction == nullptr)
            return E_POINTER;
        *direction = PINDIR_OUTPUT;
        return S_OK;
    }

    STDMETHODIMP OutputPin::QueryId(LPWSTR *id)
    {
        if (id == nullptr)
            return E_POINTER;
        const size_t bytes = (wcslen(name_) + 1) * sizeof(wchar_t);
        *id = static_cast<LPWSTR>(CoTaskMemAlloc(bytes));
        if (*id == nullptr)
            return E_OUTOFMEMORY;
        memcpy(*id, name_, bytes);
        return S_OK;
    }

    STDMETHODIMP OutputPin::QueryAccept(const AM_MEDIA_TYPE *mt) { return MatchesVideoFormat(mt) ? S_OK : S_FALSE; }

    STDMETHODIMP OutputPin::EnumMediaTypes(IEnumMediaTypes **types)
    {
        if (types == nullptr)
            return E_POINTER;
        auto *type = CreateVideoType();
        if (type == nullptr)
            return E_OUTOFMEMORY;
        auto *enumerator = new (std::nothrow) MediaTypesEnumerator(type, 0);
        if (enumerator == nullptr)
        {
            FreeMediaType(*type);
            CoTaskMemFree(type);
            return E_OUTOFMEMORY;
        }
        *types = enumerator;
        return S_OK;
    }

    STDMETHODIMP OutputPin::QueryInternalConnections(IPin **, ULONG *count)
    {
        if (count != nullptr)
            *count = 0;
        return E_NOTIMPL;
    }

    STDMETHODIMP OutputPin::EndOfStream() { return S_OK; }
    STDMETHODIMP OutputPin::BeginFlush() { flushing_ = true; return S_OK; }
    STDMETHODIMP OutputPin::EndFlush() { flushing_ = false; return S_OK; }
    STDMETHODIMP OutputPin::NewSegment(REFERENCE_TIME, REFERENCE_TIME, double) { return S_OK; }

    STDMETHODIMP OutputPin::SetFormat(AM_MEDIA_TYPE *mt)
    {
        if (!MatchesVideoFormat(mt))
            return VFW_E_INVALIDMEDIATYPE;
        return S_OK;
    }

    STDMETHODIMP OutputPin::GetFormat(AM_MEDIA_TYPE **mt)
    {
        if (mt == nullptr)
            return E_POINTER;
        *mt = CreateVideoType();
        return *mt == nullptr ? E_OUTOFMEMORY : S_OK;
    }

    STDMETHODIMP OutputPin::GetNumberOfCapabilities(int *count, int *size)
    {
        if (count == nullptr || size == nullptr)
            return E_POINTER;
        *count = 1;
        *size = sizeof(VIDEO_STREAM_CONFIG_CAPS);
        return S_OK;
    }

    STDMETHODIMP OutputPin::GetStreamCaps(int index, AM_MEDIA_TYPE **mt, BYTE *capability)
    {
        if (index != 0 || mt == nullptr || capability == nullptr)
            return E_INVALIDARG;
        *mt = CreateVideoType();
        if (*mt == nullptr)
            return E_OUTOFMEMORY;
        auto *caps = reinterpret_cast<VIDEO_STREAM_CONFIG_CAPS *>(capability);
        ZeroMemory(caps, sizeof(*caps));
        caps->guid = FORMAT_VideoInfo;
        caps->VideoStandard = AnalogVideo_None;
        caps->InputSize.cx = kWidth;
        caps->InputSize.cy = kHeight;
        caps->MinCroppingSize.cx = kWidth;
        caps->MinCroppingSize.cy = kHeight;
        caps->MaxCroppingSize.cx = kWidth;
        caps->MaxCroppingSize.cy = kHeight;
        caps->CropGranularityX = 1;
        caps->CropGranularityY = 1;
        caps->MinOutputSize.cx = kWidth;
        caps->MinOutputSize.cy = kHeight;
        caps->MaxOutputSize.cx = kWidth;
        caps->MaxOutputSize.cy = kHeight;
        caps->OutputGranularityX = 1;
        caps->OutputGranularityY = 1;
        caps->MinFrameInterval = kFrameDuration;
        caps->MaxFrameInterval = kFrameDuration;
        caps->MinBitsPerSecond = static_cast<LONG>(kWidth) * kHeight * 32 * 30;
        caps->MaxBitsPerSecond = caps->MinBitsPerSecond;
        return S_OK;
    }

    void OutputPin::Start()
    {
        if (running_)
            return;
        running_ = true;
        nextStart_ = 0;
        worker_ = std::thread(&OutputPin::DeliveryLoop, this);
    }

    void OutputPin::Stop()
    {
        running_ = false;
        if (worker_.joinable())
            worker_.join();
    }

    void OutputPin::DeliveryLoop()
    {
        while (running_)
        {
            const auto began = std::chrono::steady_clock::now();
            PushFrame();
            const auto elapsed = std::chrono::duration_cast<std::chrono::microseconds>(
                std::chrono::steady_clock::now() - began);
            const auto period = std::chrono::microseconds(kFrameDuration / 10);
            if (elapsed < period)
                std::this_thread::sleep_for(period - elapsed);
        }
    }

    void OutputPin::PushFrame()
    {
        if (input_ == nullptr || current_ == nullptr || flushing_)
            return;

        BYTE *buffer = nullptr;
        if (FAILED(current_->GetPointer(&buffer)) || buffer == nullptr)
            return;

        source_.FillFrame(kWidth, kHeight, buffer, kWidth * 4u);

        const REFERENCE_TIME start = nextStart_;
        const REFERENCE_TIME end = start + kFrameDuration;
        nextStart_ = end;
        current_->SetTime(const_cast<REFERENCE_TIME *>(&start), const_cast<REFERENCE_TIME *>(&end));
        current_->SetActualDataLength(static_cast<LONG>(kWidth) * kHeight * 4);

        const HRESULT result = input_->Receive(current_);
        if (result == S_FALSE)
            std::this_thread::sleep_for(std::chrono::milliseconds(2));
    }
}
