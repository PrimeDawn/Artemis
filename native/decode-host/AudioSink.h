// 音频输出抽象，对应 writer/plan.html §5.1：WAV 落盘用于可判定证据，WASAPI 用于真实跳板。
#pragma once

#include <cstddef>
#include <cstdint>

namespace artemis
{
    class AudioSink
    {
    public:
        virtual ~AudioSink() = default;

        virtual bool open(uint32_t sampleRate, uint32_t channels) = 0;
        // 交错 float 采样；frames 为每声道采样数。
        virtual bool write(const float *samples, uint32_t frames) = 0;
        virtual void close() = 0;
        virtual const char *name() const = 0;
    };
}
