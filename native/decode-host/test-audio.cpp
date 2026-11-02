// 音频单元测试：缓冲调节、VB-CABLE 端点识别、WAV 落盘，以及用真实 Opus/AAC 文件经解复用器验证解码器。
// 对应 writer/plan.html §5、§6；输出由测试运行自身产生，作为 executor/artifacts 证据。
#include "AudioCodec.h"
#include "AudioDecoder.h"
#include "AudioEndpoint.h"
#include "AudioRegulator.h"
#include "WavFileSink.h"

extern "C"
{
#include <libavformat/avformat.h>
}

#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

namespace
{
    int gFailures = 0;

    void check(bool condition, const char *message)
    {
        if (condition)
        {
            std::printf("ok   %s\n", message);
        }
        else
        {
            std::printf("FAIL %s\n", message);
            ++gFailures;
        }
    }

    std::vector<unsigned char> readFile(const char *path)
    {
        std::vector<unsigned char> bytes;
        std::FILE *file = std::fopen(path, "rb");
        if (file == nullptr)
            return bytes;
        std::fseek(file, 0, SEEK_END);
        const long size = std::ftell(file);
        std::fseek(file, 0, SEEK_SET);
        if (size > 0)
        {
            bytes.resize(static_cast<size_t>(size));
            const size_t read = std::fread(bytes.data(), 1, bytes.size(), file);
            bytes.resize(read);
        }
        std::fclose(file);
        return bytes;
    }

    uint32_t readU32(const unsigned char *data)
    {
        return static_cast<uint32_t>(data[0]) | (static_cast<uint32_t>(data[1]) << 8) |
               (static_cast<uint32_t>(data[2]) << 16) | (static_cast<uint32_t>(data[3]) << 24);
    }
    uint16_t readU16(const unsigned char *data)
    {
        return static_cast<uint16_t>(static_cast<uint16_t>(data[0]) | (static_cast<uint16_t>(data[1]) << 8));
    }

    void testRegulator()
    {
        artemis::AudioRegulator regulator;
        check(regulator.targetMs() == 60, "regulator: default target is 60 ms");
        check(regulator.observe(60) == artemis::AudioRegulator::Action::None, "regulator: level at target stays unchanged");
        check(regulator.observe(10) == artemis::AudioRegulator::Action::InsertSilence, "regulator: low level inserts silence");
        check(regulator.targetMs() == 50, "regulator: underrun lowers target by one step");
        check(regulator.observe(200) == artemis::AudioRegulator::Action::DropOldest, "regulator: high level drops oldest");
        check(regulator.targetMs() == 60, "regulator: overrun raises target by one step");
        check(regulator.underruns() == 1 && regulator.overruns() == 1, "regulator: counters track each event");

        artemis::AudioRegulator low(1);
        check(low.targetMs() == artemis::AudioRegulator::kMinTargetMs, "regulator: target clamps to lower bound");
        artemis::AudioRegulator high(1000);
        check(high.targetMs() == artemis::AudioRegulator::kMaxTargetMs, "regulator: target clamps to upper bound");
    }

    void testCodecDecision()
    {
        // 手机端会归一化成 OpusHead，但旧 APK / 未知实现仍可能给别的头，这里固定行为。
        const std::vector<unsigned char> opusHead{'O','p','u','s','H','e','a','d','\x01','\x01',0x38,0x01,0x80,0xBB};
        const std::vector<unsigned char> samsungHead{'A','O','P','U','S','H','D','R',1};
        const std::vector<unsigned char> unknown{'V','E','N','D','O','R','X','1'};
        const std::vector<unsigned char> shortConfig{0x12};

        check(artemis::codecFromConfig(opusHead) == artemis::AudioCodecKind::Opus, "codec: OpusHead maps to Opus");
        check(artemis::codecFromConfig(samsungHead) == artemis::AudioCodecKind::Opus, "codec: AOPUSHDR maps to Opus");
        check(artemis::codecFromConfig(unknown) == artemis::AudioCodecKind::Aac, "codec: unknown header maps to AAC");
        check(artemis::codecFromConfig(shortConfig) == artemis::AudioCodecKind::Aac, "codec: too-short config maps to AAC");
        check(artemis::codecFromConfig({}) == artemis::AudioCodecKind::Aac, "codec: empty config maps to AAC");

        const std::vector<unsigned char> normalized = artemis::normalizedOpusHead();
        check(normalized.size() == 19, "codec: normalized OpusHead is 19 bytes");
        check(std::memcmp(normalized.data(), "OpusHead", 8) == 0, "codec: normalized header keeps magic");
        check(normalized[9] == 1, "codec: normalized header is mono");
        check(normalized[12] == 0x80 && normalized[13] == 0xBB, "codec: normalized header is 48 kHz");
    }
    void testEndpoint()
    {
        artemis::CablePair pair;
        const std::vector<std::string> render{"Speakers (Realtek)", "CABLE Input (VB-Audio Virtual Cable)"};
        const std::vector<std::string> capture{"Microphone (USB)", "CABLE Output (VB-Audio Virtual Cable)"};

        check(artemis::selectCablePair(render, capture, pair), "endpoint: CABLE pair is detected");
        check(pair.renderName.find("CABLE Input") != std::string::npos, "endpoint: render endpoint is the CABLE input");
        check(pair.captureName.find("CABLE Output") != std::string::npos, "endpoint: capture endpoint is the CABLE output");

        artemis::CablePair untouched;
        check(!artemis::selectCablePair({"Speakers"}, capture, untouched), "endpoint: missing render side is rejected");
        check(!artemis::selectCablePair(render, {"Microphone"}, untouched), "endpoint: missing capture side is rejected");
        check(artemis::containsNoCase("cable input", "CABLE INPUT"), "endpoint: matching is case insensitive");
    }

    void testWavSink(const char *path)
    {
        artemis::WavFileSink sink(path);
        check(sink.open(48000, 1), "wav: open succeeds");

        std::vector<float> tone(480);
        for (size_t index = 0; index < tone.size(); ++index)
            tone[index] = static_cast<float>(std::sin(index * 0.05));
        check(sink.write(tone.data(), static_cast<uint32_t>(tone.size())), "wav: write 480 frames");
        sink.close();

        const std::vector<unsigned char> bytes = readFile(path);
        check(bytes.size() == 44 + 480 * 2, "wav: file holds 44-byte header plus 16-bit samples");
        if (bytes.size() >= 44)
        {
            check(std::memcmp(bytes.data(), "RIFF", 4) == 0, "wav: RIFF tag");
            check(std::memcmp(bytes.data() + 8, "WAVE", 4) == 0, "wav: WAVE tag");
            check(readU16(bytes.data() + 20) == 1, "wav: PCM format");
            check(readU16(bytes.data() + 22) == 1, "wav: mono channel count");
            check(readU32(bytes.data() + 24) == 48000, "wav: sample rate");
            check(readU32(bytes.data() + 40) == 480 * 2, "wav: data chunk size matches frame count");
        }
    }

    // 用解复用器把真实文件的每个包喂给解码器，等价于手机端逐帧发送的路径。
    void testDecoder(const char *path, const char *label)
    {
        AVFormatContext *format = nullptr;
        if (avformat_open_input(&format, path, nullptr, nullptr) < 0)
        {
            std::printf("FAIL decoder(%s): cannot open %s\n", label, path);
            ++gFailures;
            return;
        }

        if (avformat_find_stream_info(format, nullptr) < 0)
        {
            std::printf("FAIL decoder(%s): stream info unavailable\n", label);
            ++gFailures;
            avformat_close_input(&format);
            return;
        }

        const int streamIndex = av_find_best_stream(format, AVMEDIA_TYPE_AUDIO, -1, -1, nullptr, 0);
        if (streamIndex < 0)
        {
            std::printf("FAIL decoder(%s): no audio stream\n", label);
            ++gFailures;
            avformat_close_input(&format);
            return;
        }

        AVStream *stream = format->streams[streamIndex];
        std::vector<unsigned char> extradata;
        if (stream->codecpar->extradata != nullptr && stream->codecpar->extradata_size > 0)
            extradata.assign(stream->codecpar->extradata, stream->codecpar->extradata + stream->codecpar->extradata_size);

        artemis::AudioDecoder decoder;
        if (!decoder.open(avcodec_get_name(stream->codecpar->codec_id), extradata))
        {
            std::printf("FAIL decoder(%s): codec %s unavailable\n", label, avcodec_get_name(stream->codecpar->codec_id));
            ++gFailures;
            avformat_close_input(&format);
            return;
        }

        AVPacket *packet = av_packet_alloc();
        std::vector<float> samples;
        long produced = 0;
        while (packet != nullptr && av_read_frame(format, packet) >= 0)
        {
            if (packet->stream_index == streamIndex)
                produced += decoder.decode(packet->data, static_cast<size_t>(packet->size), 0, samples);
            av_packet_unref(packet);
        }

        if (packet != nullptr)
            av_packet_free(&packet);
        avformat_close_input(&format);

        std::printf("     decoder(%s): produced %ld samples\n", label, produced);
        check(produced > 40000 && produced < 56000, std::string(std::string("decoder(") + label + "): sample count matches one second at 48 kHz").c_str());
    }
}

int main(int argc, char **argv)
{
    std::printf("=== audio unit tests ===\n");
    testRegulator();
    testCodecDecision();
    testEndpoint();
    testWavSink("test-audio-output.wav");

    if (argc > 1)
        testDecoder(argv[1], "opus");
    if (argc > 2)
        testDecoder(argv[2], "aac");

    std::printf("failures=%d\n", gFailures);
    return gFailures == 0 ? 0 : 1;
}
