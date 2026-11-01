// 输出引脚：只协商一种媒体类型（RGB32 720p30），并向已连接的下游推送样本。
// 不依赖 BaseClasses（streams.h），直接实现 IPin / IAMStreamConfig。
#pragma once

#include <windows.h>
#include <dshow.h>

#include <atomic>
#include <thread>

#include "FrameSource.h"

namespace artemis
{
    class Filter;

    class Sample : public IMediaSample
    {
    public:
        explicit Sample(size_t capacity);
        virtual ~Sample();

        STDMETHODIMP QueryInterface(REFIID riid, void **value) override;
        STDMETHODIMP_(ULONG) AddRef() override;
        STDMETHODIMP_(ULONG) Release() override;

        STDMETHODIMP GetPointer(BYTE **value) override;
        STDMETHODIMP_(LONG) GetSize() override;
        STDMETHODIMP GetTime(REFERENCE_TIME *start, REFERENCE_TIME *end) override;
        STDMETHODIMP SetTime(REFERENCE_TIME *start, REFERENCE_TIME *end) override;
        STDMETHODIMP GetMediaTime(LONGLONG *start, LONGLONG *end) override;
        STDMETHODIMP SetMediaTime(LONGLONG *start, LONGLONG *end) override;
        STDMETHODIMP IsSyncPoint() override;
        STDMETHODIMP SetSyncPoint(BOOL value) override;
        STDMETHODIMP IsPreroll() override;
        STDMETHODIMP SetPreroll(BOOL value) override;
        STDMETHODIMP GetActualDataLength() override;
        STDMETHODIMP SetActualDataLength(LONG value) override;
        STDMETHODIMP GetMediaType(AM_MEDIA_TYPE **value) override;
        STDMETHODIMP SetMediaType(AM_MEDIA_TYPE *value) override;
        STDMETHODIMP IsDiscontinuity() override;
        STDMETHODIMP SetDiscontinuity(BOOL value) override;

    private:
        std::atomic<ULONG> references_{1};
        BYTE *buffer_ = nullptr;
        size_t capacity_ = 0;
        long dataLength_ = 0;
        REFERENCE_TIME start_ = 0;
        REFERENCE_TIME end_ = 0;
        LONGLONG mediaStart_ = 0;
        LONGLONG mediaEnd_ = 0;
        BOOL sync_ = TRUE;
        BOOL preroll_ = FALSE;
        BOOL discontinuity_ = FALSE;
        AM_MEDIA_TYPE *mediaType_ = nullptr;
    };

    class OutputPin : public IPin, public IAMStreamConfig
    {
    public:
        OutputPin(Filter *filter, const wchar_t *name);
        virtual ~OutputPin();

        // IUnknown
        STDMETHODIMP QueryInterface(REFIID riid, void **value) override;
        STDMETHODIMP_(ULONG) AddRef() override;
        STDMETHODIMP_(ULONG) Release() override;

        // IPin
        STDMETHODIMP Connect(IPin *receivePin, const AM_MEDIA_TYPE *mt) override;
        STDMETHODIMP ReceiveConnection(IPin *connector, const AM_MEDIA_TYPE *mt) override;
        STDMETHODIMP Disconnect() override;
        STDMETHODIMP ConnectedTo(IPin **pin) override;
        STDMETHODIMP ConnectionMediaType(AM_MEDIA_TYPE *mt) override;
        STDMETHODIMP QueryPinInfo(PIN_INFO *info) override;
        STDMETHODIMP QueryDirection(PIN_DIRECTION *pinDirection) override;
        STDMETHODIMP QueryId(LPWSTR *id) override;
        STDMETHODIMP QueryAccept(const AM_MEDIA_TYPE *mt) override;
        STDMETHODIMP EnumMediaTypes(IEnumMediaTypes **types) override;
        STDMETHODIMP QueryInternalConnections(IPin **pins, ULONG *count) override;
        STDMETHODIMP EndOfStream() override;
        STDMETHODIMP BeginFlush() override;
        STDMETHODIMP EndFlush() override;
        STDMETHODIMP NewSegment(REFERENCE_TIME start, REFERENCE_TIME end, double rate) override;

        // IAMStreamConfig
        STDMETHODIMP SetFormat(AM_MEDIA_TYPE *mt) override;
        STDMETHODIMP GetFormat(AM_MEDIA_TYPE **mt) override;
        STDMETHODIMP GetNumberOfCapabilities(int *count, int *size) override;
        STDMETHODIMP GetStreamCaps(int index, AM_MEDIA_TYPE **mt, BYTE *capability) override;

        void Start();
        void Stop();

    private:
        void DeliveryLoop();
        void PushFrame();

        std::atomic<ULONG> references_{1};
        Filter *filter_ = nullptr;
        wchar_t name_[64] = {};
        IPin *connection_ = nullptr;
        IMemInputPin *input_ = nullptr;
        AM_MEDIA_TYPE *connectionType_ = nullptr;
        FrameSource source_;
        std::thread worker_;
        std::atomic<bool> running_{false};
        std::atomic<bool> flushing_{false};
        REFERENCE_TIME nextStart_ = 0;
        Sample *current_ = nullptr;
    };
}
