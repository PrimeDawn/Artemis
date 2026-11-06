// WAV 落盘 sink，对应 writer/plan.html §5.1：没有设备环境时用它产出可判定证据。
#include "AudioSink.h"

#include <cstdio>
#include <vector>

namespace artemis
{
    class WavFileSink : public AudioSink
    {
    public:
        explicit WavFileSink(const char *path) : path_(path) {}
        ~WavFileSink() override { close(); }

        bool open(uint32_t sampleRate, uint32_t channels) override
        {
            close();
            file_ = std::fopen(path_, "wb");
            if (file_ == nullptr)
                return false;
            sampleRate_ = sampleRate;
            channels_ = channels == 0 ? 1 : channels;
            frames_ = 0;
            unsigned char header[44] = {};
            std::fwrite(header, 1, sizeof(header), file_); // 头部在 close 时按实际长度回填
            return true;
        }

        bool write(const float *samples, uint32_t frames) override
        {
            if (file_ == nullptr || samples == nullptr)
                return false;
            for (uint32_t frame = 0; frame < frames; ++frame)
            {
                for (uint32_t channel = 0; channel < channels_; ++channel)
                {
                    float value = samples[frame * channels_ + channel];
                    if (value > 1.0f)
                        value = 1.0f;
                    if (value < -1.0f)
                        value = -1.0f;
                    const int16_t pcm = static_cast<int16_t>(value * 32767.0f);
                    const unsigned char bytes[2] = {
                        static_cast<unsigned char>(pcm & 0xff),
                        static_cast<unsigned char>((pcm >> 8) & 0xff)};
                    std::fwrite(bytes, 1, 2, file_);
                }
            }
            frames_ += frames;
            if (++writes_ % 100 == 0)
                refresh();
            return true;
        }

        // 把当前长度回填进头部并落盘，进程被中断也能留下可读的 WAV。
        void refresh()
        {
            if (file_ == nullptr)
                return;
            const uint32_t dataBytes = static_cast<uint32_t>(frames_ * channels_ * 2);
            unsigned char header[44] = {};
            writeTag(header + 0, "RIFF");
            writeU32(header + 4, 36 + dataBytes);
            writeTag(header + 8, "WAVE");
            writeTag(header + 12, "fmt ");
            writeU32(header + 16, 16);
            writeU16(header + 20, 1);
            writeU16(header + 22, static_cast<uint16_t>(channels_));
            writeU32(header + 24, sampleRate_);
            writeU32(header + 28, sampleRate_ * channels_ * 2);
            writeU16(header + 32, static_cast<uint16_t>(channels_ * 2));
            writeU16(header + 34, 16);
            writeTag(header + 36, "data");
            writeU32(header + 40, dataBytes);
            const long end = std::ftell(file_);
            std::fseek(file_, 0, SEEK_SET);
            std::fwrite(header, 1, sizeof(header), file_);
            std::fseek(file_, end, SEEK_SET);
            std::fflush(file_);
        }

        void close() override
        {
            if (file_ == nullptr)
                return;

            const uint32_t byteRate = sampleRate_ * channels_ * 2;
            const uint32_t dataBytes = static_cast<uint32_t>(frames_ * channels_ * 2);
            unsigned char header[44] = {};
            writeTag(header + 0, "RIFF");
            writeU32(header + 4, 36 + dataBytes);
            writeTag(header + 8, "WAVE");
            writeTag(header + 12, "fmt ");
            writeU32(header + 16, 16);
            writeU16(header + 20, 1); // PCM
            writeU16(header + 22, static_cast<uint16_t>(channels_));
            writeU32(header + 24, sampleRate_);
            writeU32(header + 28, byteRate);
            writeU16(header + 32, static_cast<uint16_t>(channels_ * 2));
            writeU16(header + 34, 16);
            writeTag(header + 36, "data");
            writeU32(header + 40, dataBytes);

            std::fseek(file_, 0, SEEK_SET);
            std::fwrite(header, 1, sizeof(header), file_);
            std::fclose(file_);
            file_ = nullptr;
        }

        const char *name() const override { return "wav"; }
        uint64_t frames() const { return frames_; }

    private:
        static void writeTag(unsigned char *target, const char *tag)
        {
            for (int index = 0; index < 4; ++index)
                target[index] = static_cast<unsigned char>(tag[index]);
        }
        static void writeU32(unsigned char *target, uint32_t value)
        {
            target[0] = static_cast<unsigned char>(value & 0xff);
            target[1] = static_cast<unsigned char>((value >> 8) & 0xff);
            target[2] = static_cast<unsigned char>((value >> 16) & 0xff);
            target[3] = static_cast<unsigned char>((value >> 24) & 0xff);
        }
        static void writeU16(unsigned char *target, uint16_t value)
        {
            target[0] = static_cast<unsigned char>(value & 0xff);
            target[1] = static_cast<unsigned char>((value >> 8) & 0xff);
        }

        const char *path_;
        std::FILE *file_ = nullptr;
        uint32_t sampleRate_ = 48000;
        uint32_t channels_ = 1;
        uint64_t frames_ = 0;
        uint32_t writes_ = 0;
    };
}
