// 共享内存帧协议，producer 与 DirectShow 过滤器共用。
// 依据 writer/plan.html §3.1。
#pragma once

#include <cstdint>

namespace artemis
{
    constexpr uint32_t kFrameMagic = 0x41435456u; // "ACTV"
    constexpr uint32_t kFrameVersion = 1u;
    constexpr uint32_t kFrameFormatRgb32 = 1u;
    constexpr uint32_t kMaxWidth = 1920u;
    constexpr uint32_t kMaxHeight = 1080u;
    constexpr uint32_t kBytesPerPixel = 4u;
    constexpr wchar_t kSharedFrameName[] = L"Local\\ArtemisCameraFrames";

    struct FrameHeader
    {
        uint32_t magic;
        uint32_t version;
        uint32_t width;
        uint32_t height;
        uint32_t stride;
        uint32_t format;
        uint64_t writeIndex;
        uint64_t frameIndex;
        uint64_t timestampUs;
        uint32_t reserved[5];
    };

    // 头部之后紧跟两个缓冲块，按 frameIndex % 2 轮换。
    constexpr uint64_t kFrameHeaderBytes = 64ull;
    constexpr uint64_t kMaxFrameBytes = static_cast<uint64_t>(kMaxWidth) * kMaxHeight * kBytesPerPixel;
    constexpr uint64_t kSharedFrameBytes = kFrameHeaderBytes + kMaxFrameBytes * 2ull;

    inline uint64_t FrameOffset(uint64_t frameIndex)
    {
        return kFrameHeaderBytes + (frameIndex % 2ull) * kMaxFrameBytes;
    }
}
