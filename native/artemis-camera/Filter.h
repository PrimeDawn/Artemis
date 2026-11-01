// DirectShow 源过滤器：对外暴露一个输出引脚，类名 Artemis Camera。
// 不依赖 BaseClasses；CLSID 与注册逻辑见 ArtemisCamera.cpp。
#pragma once

#include <windows.h>
#include <dshow.h>

#include <atomic>

namespace artemis
{
    class OutputPin;

    // {7E1F3A10-2C4B-4D8E-9A55-3F0C1B7D9E21}
    extern const CLSID kFilterClsid;

    class Filter : public IBaseFilter, public IAMFilterMiscFlags
    {
    public:
        Filter();
        virtual ~Filter();

        // IUnknown
        STDMETHODIMP QueryInterface(REFIID riid, void **value) override;
        STDMETHODIMP_(ULONG) AddRef() override;
        STDMETHODIMP_(ULONG) Release() override;

        // IBaseFilter
        STDMETHODIMP GetClassID(CLSID *clsid) override;
        STDMETHODIMP Stop() override;
        STDMETHODIMP Pause() override;
        STDMETHODIMP Run(REFERENCE_TIME start) override;
        STDMETHODIMP GetState(DWORD milliseconds, FILTER_STATE *state) override;
        STDMETHODIMP SetSyncSource(IReferenceClock *clock) override;
        STDMETHODIMP GetSyncSource(IReferenceClock **clock) override;
        STDMETHODIMP EnumPins(IEnumPins **pins) override;
        STDMETHODIMP FindPin(LPCWSTR id, IPin **pin) override;
        STDMETHODIMP QueryFilterInfo(FILTER_INFO *info) override;
        STDMETHODIMP JoinFilterGraph(IFilterGraph *graph, LPCWSTR name) override;
        STDMETHODIMP QueryVendorInfo(LPWSTR *vendor) override;

        // IAMFilterMiscFlags
        STDMETHODIMP_(ULONG) GetMiscFlags() override;

        IFilterGraph *graph() const { return graph_; }

    private:
        std::atomic<ULONG> references_{1};
        OutputPin *pin_ = nullptr;
        IFilterGraph *graph_ = nullptr;
        IReferenceClock *clock_ = nullptr;
        std::atomic<FILTER_STATE> state_{State_Stopped};
    };
}
