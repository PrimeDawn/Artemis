#include "Decoder.h"

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavutil/imgutils.h>
#include <libswscale/swscale.h>
}

#include <cstdarg>
#include <cstdio>
#include <cstring>
#include <vector>

namespace artemis
{
    Decoder::~Decoder() { stop(); }

    bool Decoder::start()
    {
        av_log_set_level(AV_LOG_ERROR);
        // 过滤解码器在流结束时输出的 "no frame!" 噪声，其余错误照常输出。
        av_log_set_callback([](void *, int level, const char *format, va_list arguments) {
            if (level > AV_LOG_ERROR)
                return;
            char buffer[512] = {};
            std::vsnprintf(buffer, sizeof(buffer), format, arguments);
            if (std::strstr(buffer, "no frame!") != nullptr)
                return;
            std::fputs(buffer, stderr);
        });
        const AVCodec *codec = avcodec_find_decoder(AV_CODEC_ID_H264);
        if (codec == nullptr)
        {
            std::printf("Decoder: H264 codec not found\n");
            return false;
        }

        context_ = avcodec_alloc_context3(codec);
        if (context_ == nullptr)
            return false;

        context_->flags |= AV_CODEC_FLAG_LOW_DELAY;
        context_->thread_count = 1; // 低延迟优先，避免多线程缓冲引入帧延迟

        if (avcodec_open2(context_, codec, nullptr) < 0)
        {
            std::printf("Decoder: avcodec_open2 failed\n");
            return false;
        }

        frame_ = av_frame_alloc();
        packet_ = av_packet_alloc();
        return frame_ != nullptr && packet_ != nullptr;
    }

    void Decoder::reset()
    {
        if (context_ != nullptr)
            avcodec_flush_buffers(context_);
        lastPts_ = 0;
    }

    void Decoder::stop()
    {
        if (scaler_ != nullptr)
        {
            sws_freeContext(scaler_);
            scaler_ = nullptr;
        }
        if (packet_ != nullptr)
        {
            av_packet_free(&packet_);
            packet_ = nullptr;
        }
        if (frame_ != nullptr)
        {
            av_frame_free(&frame_);
            frame_ = nullptr;
        }
        if (context_ != nullptr)
        {
            avcodec_free_context(&context_);
            context_ = nullptr;
        }
    }

    bool Decoder::ensureScaler(uint32_t width, uint32_t height)
    {
        if (scaler_ != nullptr && scalerWidth_ == width && scalerHeight_ == height)
            return true;
        if (scaler_ != nullptr)
        {
            sws_freeContext(scaler_);
            scaler_ = nullptr;
        }
        scaler_ = sws_getContext(static_cast<int>(width), static_cast<int>(height), AV_PIX_FMT_YUV420P,
                                 static_cast<int>(width), static_cast<int>(height), AV_PIX_FMT_BGRA,
                                 SWS_BILINEAR, nullptr, nullptr, nullptr);
        if (scaler_ == nullptr)
        {
            std::printf("Decoder: sws_getContext failed\n");
            return false;
        }
        scalerWidth_ = width;
        scalerHeight_ = height;
        width_ = width;
        height_ = height;
        return true;
    }

    void Decoder::drain()
    {
        while (true)
        {
            const int result = avcodec_receive_frame(context_, frame_);
            if (result == AVERROR(EAGAIN) || result == AVERROR_EOF)
                return;
            if (result < 0)
            {
                std::printf("Decoder: receive_frame failed (%d)\n", result);
                return;
            }

            const auto width = static_cast<uint32_t>(frame_->width);
            const auto height = static_cast<uint32_t>(frame_->height);
            if (!ensureScaler(width, height))
                return;

            std::vector<uint8_t> bgra(static_cast<size_t>(width) * height * 4u);
            uint8_t *destination[4] = {bgra.data(), nullptr, nullptr, nullptr};
            const int destinationStride[4] = {static_cast<int>(width * 4u), 0, 0, 0};
            sws_scale(scaler_, frame_->data, frame_->linesize, 0, static_cast<int>(height), destination,
                      destinationStride);

            if (callback_ != nullptr)
                callback_(bgra.data(), width * 4u, width, height, lastPts_, user_);
        }
    }

    bool Decoder::feed(const uint8_t *data, size_t length, uint64_t ptsUs)
    {
        if (context_ == nullptr || packet_ == nullptr)
            return false;
        lastPts_ = ptsUs;

        av_packet_unref(packet_);
        if (av_new_packet(packet_, static_cast<int>(length)) < 0)
            return false;
        memcpy(packet_->data, data, length);

        const int sent = avcodec_send_packet(context_, packet_);
        // 纯配置数据（SPS/PPS 单独成包）本来就不产生画面，INVALIDDATA 属正常。
        if (sent < 0 && sent != AVERROR(EAGAIN) && sent != AVERROR_INVALIDDATA)
        {
            std::printf("Decoder: send_packet failed (%d)\n", sent);
            return false;
        }
        drain();
        return true;
    }
}
