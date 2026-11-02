// 音频解码：Opus / AAC → 48 kHz 单声道 float，对应 writer/plan.html §5.1。
#pragma once

#include <cstddef>
#include <cstdint>
#include <vector>

struct AVCodecContext;
struct AVFrame;
struct SwrContext;

namespace artemis
{
    class AudioDecoder
    {
    public:
        AudioDecoder() = default;
        ~AudioDecoder();

        // codecName 为 "opus" / "aac" 等 FFmpeg 解码器名。
        // extradata 对应手机端 csd-0（Opus 的 OpusHead、AAC 的 AudioSpecificConfig）；为空时按需自行解析。
        bool open(const char *codecName, const std::vector<unsigned char> &extradata = {});
        void reset();
        void close();

        // 解码一个 access unit，追加到 out（交错 float，单声道）。
        // 返回解出的采样帧数；<= 0 表示本包未产出样本或解码失败。
        int decode(const unsigned char *data, size_t size, uint64_t ptsUs, std::vector<float> &out);

        uint32_t sampleRate() const { return sampleRate_; }
        uint32_t channels() const { return channels_; }

    private:
        AVCodecContext *context_ = nullptr;
        AVFrame *frame_ = nullptr;
        SwrContext *swr_ = nullptr;
        uint32_t sampleRate_ = 48000;
        uint32_t channels_ = 1;
        bool opened_ = false;
    };
}
