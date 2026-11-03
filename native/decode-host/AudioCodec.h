// 音频配置包判定，对应 writer/plan.html §5.1 与 debug-001。
// 手机端已把 Opus 归一化成标准 OpusHead；这里仍保留对厂商变体的识别，供旧 APK 与未知实现兜底。
#pragma once

#include <cstdint>
#include <cstring>
#include <vector>

namespace artemis
{
    enum class AudioCodecKind
    {
        Opus,
        Aac,
    };

    inline bool isOpusConfig(const std::vector<unsigned char> &config)
    {
        if (config.size() < 8)
            return false;
        return std::memcmp(config.data(), "OpusHead", 8) == 0 ||
               std::memcmp(config.data(), "AOPUSHDR", 8) == 0;
    }

    inline AudioCodecKind codecFromConfig(const std::vector<unsigned char> &config)
    {
        return isOpusConfig(config) ? AudioCodecKind::Opus : AudioCodecKind::Aac;
    }

    // 统一成 FFmpeg 认识的标准 OpusHead（19 字节、单声道、48 kHz）。
    inline std::vector<unsigned char> normalizedOpusHead()
    {
        std::vector<unsigned char> head(19, 0);
        std::memcpy(head.data(), "OpusHead", 8);
        head[8] = 1;     // version
        head[9] = 1;     // channels
        head[10] = 0x38; // pre-skip 312
        head[11] = 0x01;
        head[12] = 0x80; // 48000 LE
        head[13] = 0xBB;
        return head;
    }
}
