// 媒体帧头解析，对应 writer/plan.html §3。
// 12 字节：8 字节 ptsAndFlags（大端）+ 4 字节 packetSize（大端）。
// 标志位取自 scrcpy Streamer.java：1<<63 会话首包、1<<62 配置帧、1<<61 关键帧。
#pragma once

#include <cstddef>
#include <cstdint>

namespace artemis
{
    constexpr size_t kFrameHeaderSize = 12;

    // 单帧上限：防止异常长度导致巨额分配（约 32MB，远大于 720p 关键帧）。
    constexpr uint32_t kMaxPacketSize = 32u * 1024u * 1024u;

    struct FrameHeader
    {
        uint64_t ptsUs = 0;
        uint32_t size = 0;
        bool session = false;
        bool config = false;
        bool keyFrame = false;

        static bool parse(const unsigned char *data, size_t length, FrameHeader &out)
        {
            if (data == nullptr || length < kFrameHeaderSize)
                return false;

            uint64_t ptsAndFlags = 0;
            for (int index = 0; index < 8; ++index)
                ptsAndFlags = (ptsAndFlags << 8) | static_cast<uint64_t>(data[index]);

            uint32_t size = 0;
            for (int index = 8; index < 12; ++index)
                size = (size << 8) | static_cast<uint32_t>(data[index]);

            if (size > kMaxPacketSize)
                return false;

            constexpr uint64_t kSessionFlag = 1ull << 63;
            constexpr uint64_t kConfigFlag = 1ull << 62;
            constexpr uint64_t kKeyFrameFlag = 1ull << 61;
            constexpr uint64_t kTimestampMask = (1ull << 61) - 1ull;

            out.session = (ptsAndFlags & kSessionFlag) != 0;
            out.config = (ptsAndFlags & kConfigFlag) != 0;
            out.keyFrame = (ptsAndFlags & kKeyFrameFlag) != 0;
            out.ptsUs = out.config ? 0 : (ptsAndFlags & kTimestampMask);
            out.size = size;
            return true;
        }
    };
}
