#include "AudioDecoder.h"

extern "C"
{
#include <libavcodec/avcodec.h>
#include <libavutil/channel_layout.h>
#include <libavutil/opt.h>
#include <libavutil/samplefmt.h>
#include <libswresample/swresample.h>
}

#include <cstdio>
#include <cstring>

namespace artemis
{
    AudioDecoder::~AudioDecoder()
    {
        close();
    }

    bool AudioDecoder::open(const char *codecName, const std::vector<unsigned char> &extradata)
    {
        close();

        const AVCodec *codec = avcodec_find_decoder_by_name(codecName);
        if (codec == nullptr)
            return false;

        context_ = avcodec_alloc_context3(codec);
        if (context_ == nullptr)
            return false;

        if (!extradata.empty())
        {
            // 手机端 MediaCodec 的 csd-0 就是解码器需要的 extradata，缺它 Opus 无法建立声道映射。
            context_->extradata = static_cast<uint8_t *>(av_mallocz(extradata.size() + AV_INPUT_BUFFER_PADDING_SIZE));
            if (context_->extradata == nullptr)
            {
                close();
                return false;
            }
            std::memcpy(context_->extradata, extradata.data(), extradata.size());
            context_->extradata_size = static_cast<int>(extradata.size());
        }

        if (avcodec_open2(context_, codec, nullptr) < 0)
        {
            close();
            return false;
        }

        frame_ = av_frame_alloc();
        if (frame_ == nullptr)
        {
            close();
            return false;
        }

        opened_ = true;
        return true;
    }

    void AudioDecoder::reset()
    {
        if (context_ != nullptr && opened_)
            avcodec_flush_buffers(context_);
    }

    void AudioDecoder::close()
    {
        if (swr_ != nullptr)
        {
            swr_free(&swr_);
            swr_ = nullptr;
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
        opened_ = false;
    }

    int AudioDecoder::decode(const unsigned char *data, size_t size, uint64_t ptsUs, std::vector<float> &out)
    {
        (void)ptsUs; // 时间戳由调用方随帧传递，解码器本身不做重排
        if (!opened_ || data == nullptr || size == 0)
            return 0;

        AVPacket *packet = av_packet_alloc();
        if (packet == nullptr)
            return 0;
        if (av_new_packet(packet, static_cast<int>(size)) < 0)
        {
            av_packet_free(&packet);
            return 0;
        }
        for (size_t index = 0; index < size; ++index)
            packet->data[index] = data[index];

        int produced = 0;
        if (avcodec_send_packet(context_, packet) >= 0)
        {
            while (avcodec_receive_frame(context_, frame_) == 0)
            {
                if (swr_ == nullptr)
                {
                    AVChannelLayout inChannels{};
                    if (frame_->ch_layout.nb_channels > 0)
                        av_channel_layout_copy(&inChannels, &frame_->ch_layout);
                    else
                        av_channel_layout_default(&inChannels, 1);

                    AVChannelLayout outChannels{};
                    av_channel_layout_default(&outChannels, 1);

                    const int status = swr_alloc_set_opts2(&swr_,
                                                           &outChannels, AV_SAMPLE_FMT_FLT, 48000,
                                                           &inChannels, static_cast<AVSampleFormat>(frame_->format), frame_->sample_rate,
                                                           0, nullptr);
                    av_channel_layout_uninit(&inChannels);
                    av_channel_layout_uninit(&outChannels);
                    if (status < 0 || swr_init(swr_) < 0)
                    {
                        swr_free(&swr_);
                        swr_ = nullptr;
                        break;
                    }
                }

                const int maxOut = static_cast<int>(swr_get_out_samples(swr_, frame_->nb_samples));
                if (maxOut <= 0)
                    continue;

                std::vector<float> converted(static_cast<size_t>(maxOut));
                uint8_t *outPlanes[1] = {reinterpret_cast<uint8_t *>(converted.data())};
                const int got = swr_convert(swr_, outPlanes, maxOut,
                                            const_cast<const uint8_t **>(frame_->extended_data), frame_->nb_samples);
                if (got > 0)
                {
                    out.insert(out.end(), converted.begin(), converted.begin() + got);
                    produced += got;
                }
            }
        }

        av_packet_free(&packet);
        return produced;
    }
}
