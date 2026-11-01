// 帧源：优先从共享内存读取 producer 写入的帧；读不到时输出合成色条。
// 依据 writer/plan.html §2 与 §3.2。
#pragma once

#include <cstdint>
#include <vector>

namespace artemis
{
    struct FrameView
    {
        const uint8_t *data = nullptr;
        uint32_t width = 0;
        uint32_t height = 0;
        uint32_t stride = 0;
        uint64_t frameIndex = 0;
    };

    class FrameSource
    {
    public:
        FrameSource() = default;
        ~FrameSource();

        FrameSource(const FrameSource &) = delete;
        FrameSource &operator=(const FrameSource &) = delete;

        // producer 不在时填充合成色条，保证过滤器始终有画面。
        void FillFrame(uint32_t width, uint32_t height, uint8_t *destination, uint32_t stride);

    private:
        bool TryOpenMapping();
        bool TryReadShared(FrameView &view);
        void RenderBars(uint32_t width, uint32_t height, uint8_t *destination, uint32_t stride, uint64_t frameIndex);

        void *mapping_ = nullptr;
        const uint8_t *mapped_ = nullptr;
        uint64_t lastFrameIndex_ = 0;
        std::vector<uint8_t> lastCopy_;
        bool lastCopyValid_ = false;
        uint64_t syntheticIndex_ = 0;
    };
}
