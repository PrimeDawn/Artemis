// 音频缓冲调节器，对应 writer/plan.html §5.2「线程与缓冲」。
// 目标缓冲 60 ms，按欠载/过载在 40–200 ms 间调整；判定逻辑与时钟无关，便于用假时钟或直接注入水位验证。
#pragma once

#include <cstdint>

namespace artemis
{
    class AudioRegulator
    {
    public:
        enum class Action
        {
            None,          // 水位正常，照常输出
            InsertSilence, // 欠载：补静音，避免播放线程被饿死
            DropOldest,    // 过载：丢弃最旧数据，避免延迟越积越大
        };

        static constexpr uint32_t kMinTargetMs = 40;
        static constexpr uint32_t kDefaultTargetMs = 60;
        static constexpr uint32_t kMaxTargetMs = 200;
        static constexpr uint32_t kStepMs = 10;

        explicit AudioRegulator(uint32_t targetMs = kDefaultTargetMs)
            : targetMs_(clampTarget(targetMs)) {}

        uint32_t targetMs() const { return targetMs_; }
        uint32_t underruns() const { return underruns_; }
        uint32_t overruns() const { return overruns_; }

        // 以当前缓冲水位采样一次，返回本轮应采取的动作。
        Action observe(uint32_t bufferedMs)
        {
            if (bufferedMs * 2 < targetMs_)
            {
                ++underruns_;
                // 欠载说明数据来得慢：降低目标缓冲，让输出更跟手。
                targetMs_ = clampTarget(targetMs_ > kStepMs ? targetMs_ - kStepMs : kMinTargetMs);
                return Action::InsertSilence;
            }
            if (bufferedMs > targetMs_ * 2)
            {
                ++overruns_;
                // 过载说明数据堆积：提高目标缓冲并丢弃最旧数据。
                targetMs_ = clampTarget(targetMs_ + kStepMs);
                return Action::DropOldest;
            }
            return Action::None;
        }

    private:
        static uint32_t clampTarget(uint32_t value)
        {
            if (value < kMinTargetMs)
                return kMinTargetMs;
            if (value > kMaxTargetMs)
                return kMaxTargetMs;
            return value;
        }

        uint32_t targetMs_;
        uint32_t underruns_ = 0;
        uint32_t overruns_ = 0;
    };
}
