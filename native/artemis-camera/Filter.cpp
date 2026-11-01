#include "Filter.h"
#include "Pin.h"

#include <new>

namespace artemis
{
    // {7E1F3A10-2C4B-4D8E-9A55-3F0C1B7D9E21}
    const CLSID kFilterClsid = {0x7E1F3A10, 0x2C4B, 0x4D8E, {0x9A, 0x55, 0x3F, 0x0C, 0x1B, 0x7D, 0x9E, 0x21}};

    namespace
    {
        class PinsEnumerator : public IEnumPins
        {
        public:
            PinsEnumerator(IPin *pin, ULONG index) : pin_(pin), index_(index)
            {
                if (pin_ != nullptr)
                    pin_->AddRef();
            }

            virtual ~PinsEnumerator()
            {
                if (pin_ != nullptr)
                    pin_->Release();
            }

            STDMETHODIMP QueryInterface(REFIID riid, void **value) override
            {
                if (value == nullptr)
                    return E_POINTER;
                if (riid == IID_IUnknown || riid == IID_IEnumPins)
                {
                    *value = static_cast<IEnumPins *>(this);
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

            STDMETHODIMP Next(ULONG count, IPin **pins, ULONG *fetched) override
            {
                if (pins == nullptr)
                    return E_POINTER;
                ULONG done = 0;
                while (done < count && index_ == 0 && pin_ != nullptr)
                {
                    pins[done] = pin_;
                    pin_->AddRef();
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

            STDMETHODIMP Clone(IEnumPins **pins) override
            {
                if (pins == nullptr)
                    return E_POINTER;
                *pins = new (std::nothrow) PinsEnumerator(pin_, index_);
                return *pins == nullptr ? E_OUTOFMEMORY : S_OK;
            }

        private:
            std::atomic<ULONG> references_{1};
            IPin *pin_ = nullptr;
            ULONG index_ = 0;
        };
    }

    Filter::Filter()
    {
        pin_ = new (std::nothrow) OutputPin(this, L"Capture");
        if (pin_ != nullptr)
            pin_->AddRef(); // 过滤器持有引脚的生命周期
    }

    Filter::~Filter()
    {
        if (pin_ != nullptr)
            pin_->Release();
        if (clock_ != nullptr)
            clock_->Release();
    }

    STDMETHODIMP Filter::QueryInterface(REFIID riid, void **value)
    {
        if (value == nullptr)
            return E_POINTER;
        if (riid == IID_IUnknown || riid == IID_IPersist || riid == IID_IMediaFilter || riid == IID_IBaseFilter)
            *value = static_cast<IBaseFilter *>(this);
        else if (riid == IID_IAMFilterMiscFlags)
            *value = static_cast<IAMFilterMiscFlags *>(this);
        else
        {
            *value = nullptr;
            return E_NOINTERFACE;
        }
        AddRef();
        return S_OK;
    }

    STDMETHODIMP_(ULONG) Filter::AddRef() { return ++references_; }

    STDMETHODIMP_(ULONG) Filter::Release()
    {
        const ULONG remaining = --references_;
        if (remaining == 0)
            delete this;
        return remaining;
    }

    STDMETHODIMP Filter::GetClassID(CLSID *clsid)
    {
        if (clsid == nullptr)
            return E_POINTER;
        *clsid = kFilterClsid;
        return S_OK;
    }

    STDMETHODIMP Filter::Stop()
    {
        if (pin_ != nullptr)
            pin_->Stop();
        state_ = State_Stopped;
        return S_OK;
    }

    STDMETHODIMP Filter::Pause()
    {
        state_ = State_Paused;
        return S_OK;
    }

    STDMETHODIMP Filter::Run(REFERENCE_TIME)
    {
        state_ = State_Running;
        if (pin_ != nullptr)
            pin_->Start();
        return S_OK;
    }

    STDMETHODIMP Filter::GetState(DWORD, FILTER_STATE *state)
    {
        if (state == nullptr)
            return E_POINTER;
        *state = state_;
        return S_OK;
    }

    STDMETHODIMP Filter::SetSyncSource(IReferenceClock *clock)
    {
        if (clock_ != nullptr)
            clock_->Release();
        clock_ = clock;
        if (clock_ != nullptr)
            clock_->AddRef();
        return S_OK;
    }

    STDMETHODIMP Filter::GetSyncSource(IReferenceClock **clock)
    {
        if (clock == nullptr)
            return E_POINTER;
        *clock = clock_;
        if (clock_ != nullptr)
            clock_->AddRef();
        return S_OK;
    }

    STDMETHODIMP Filter::EnumPins(IEnumPins **pins)
    {
        if (pins == nullptr)
            return E_POINTER;
        *pins = new (std::nothrow) PinsEnumerator(pin_, 0);
        return *pins == nullptr ? E_OUTOFMEMORY : S_OK;
    }

    STDMETHODIMP Filter::FindPin(LPCWSTR id, IPin **pin)
    {
        if (id == nullptr || pin == nullptr)
            return E_POINTER;
        if (_wcsicmp(id, L"Capture") != 0)
        {
            *pin = nullptr;
            return VFW_E_NOT_FOUND;
        }
        *pin = pin_;
        pin_->AddRef();
        return S_OK;
    }

    STDMETHODIMP Filter::QueryFilterInfo(FILTER_INFO *info)
    {
        if (info == nullptr)
            return E_POINTER;
        wcscpy_s(info->achName, L"Artemis Camera");
        info->pGraph = graph_;
        if (graph_ != nullptr)
            graph_->AddRef();
        return S_OK;
    }

    STDMETHODIMP Filter::JoinFilterGraph(IFilterGraph *graph, LPCWSTR)
    {
        if (graph_ != nullptr)
            graph_->Release();
        graph_ = graph;
        if (graph_ != nullptr)
            graph_->AddRef();
        return S_OK;
    }

    STDMETHODIMP Filter::QueryVendorInfo(LPWSTR *vendor)
    {
        if (vendor == nullptr)
            return E_POINTER;
        *vendor = nullptr;
        return S_FALSE;
    }

    STDMETHODIMP_(ULONG) Filter::GetMiscFlags() { return AM_FILTER_MISC_FLAGS_IS_SOURCE; }
}
