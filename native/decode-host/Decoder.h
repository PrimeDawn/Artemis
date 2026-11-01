// H.264 解码：FFmpeg avcodec 软解，输出 BGRA 交给共享内存写入。
// 对应 writer/plan.html §6。
#pragma once

#include <cstdint>

struct AVCodecContext;
struct AVFrame;
struct AVPacket;
struct SwsContext;
struct AVCodecParserContext;

namespace artemis
{
    class Decoder
    {
    public:
        using FrameCallback = void (*)(const uint8_t *bgra, uint32_t stride, uint32_t width, uint32_t height,
                                       uint64_t ptsUs, void *user);

        Decoder() = default;
        ~Decoder();

        Decoder(const Decoder &) = delete;
        Decoder &operator=(const Decoder &) = delete;

        bool start();

        // 送入一段 Annex-B 数据；ptsUs 仅用于向回调透传。
        bool feed(const uint8_t *data, size_t length, uint64_t ptsUs);

        void stop();

        // 断流后清理解码器状态，下一次连接从关键帧重新开始。
        void reset();

        void setCallback(FrameCallback callback, void *user)
        {
            callback_ = callback;
            user_ = user;
        }

        uint32_t width() const { return width_; }
        uint32_t height() const { return height_; }

    private:
        bool ensureScaler(uint32_t width, uint32_t height);
        void drain();

        AVCodecContext *context_ = nullptr;
        AVFrame *frame_ = nullptr;
        AVPacket *packet_ = nullptr;
        SwsContext *scaler_ = nullptr;
        uint32_t width_ = 0;
        uint32_t height_ = 0;
        uint32_t scalerWidth_ = 0;
        uint32_t scalerHeight_ = 0;
        uint64_t lastPts_ = 0;
        FrameCallback callback_ = nullptr;
        void *user_ = nullptr;
    };
}
