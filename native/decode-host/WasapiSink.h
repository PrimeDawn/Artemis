// WASAPI 共享模式渲染 sink，对应 writer/plan.html §5.1。
// 目标端点按名字匹配（本版只认 CABLE Input）；设备缺失时 open() 返回 false，由调用方降级。
#pragma once

#include "AudioSink.h"

#include <string>
#include <vector>

namespace artemis
{
    // 枚举当前活动的渲染端点名；无设备时返回空列表。
    std::vector<std::string> listRenderEndpoints();

    class WasapiSink : public AudioSink
    {
    public:
        explicit WasapiSink(std::string deviceName) : deviceName_(std::move(deviceName)) {}
        ~WasapiSink() override { close(); }

        bool open(uint32_t sampleRate, uint32_t channels) override;
        bool write(const float *samples, uint32_t frames) override;
        void close() override;
        const char *name() const override { return "wasapi"; }

    private:
        struct Impl;
        Impl *impl_ = nullptr;
        std::string deviceName_;
    };
}
