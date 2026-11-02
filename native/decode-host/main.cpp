// 解码进程：视频通道（TCP 收帧 → H.264 → 共享内存）与音频通道（TCP 收帧 → Opus/AAC → sink）。
// 对应 writer/plan.html §2、§5、§6。
#include "AudioCodec.h"
#include "AudioDecoder.h"
#include "AudioEndpoint.h"
#include "AudioRegulator.h"
#include "AudioSink.h"
#include "Decoder.h"
#include "FrameHeader.h"
#include "SharedWriter.h"
#include "WavFileSink.h"
#include "WasapiSink.h"

#include <winsock2.h>
#include <objbase.h>
#include <ws2tcpip.h>

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <mutex>
#include <thread>
#include <string>
#include <vector>

namespace
{
    constexpr uint32_t kWidth = 1280;
    constexpr uint32_t kHeight = 720;

    struct AudioOptions
    {
        bool enabled = true;
        int port = 3451;
        std::string wavPath;
        std::string deviceName;
        std::string statusPath;
    };

    artemis::SharedWriter gWriter;
    uint64_t gFrames = 0;

    // 音频输出由一个后台监视线程维护：虚拟声卡被拔掉就暂停，重新出现就自动接上。
    std::mutex gAudioSinkMutex;
    std::unique_ptr<artemis::AudioSink> gAudioSink;
    std::string gCableDevice;
    bool gWavMode = false;
    std::string gStatusPath;
    int gAudioSampleRate = 48000;

    void onFrame(const uint8_t *bgra, uint32_t stride, uint32_t width, uint32_t height, uint64_t ptsUs, void *)
    {
        if (!gWriter.open(width, height))
            return;
        if (gWriter.write(bgra, stride, ptsUs))
            ++gFrames;
    }

    // 断网后旧连接可能半开：读超时让服务循环能回到 accept，接受新的手机连接。
    void setRecvTimeout(SOCKET socket, int milliseconds)
    {
        DWORD timeout = static_cast<DWORD>(milliseconds);
        setsockopt(socket, SOL_SOCKET, SO_RCVTIMEO, reinterpret_cast<const char *>(&timeout), sizeof(timeout));
    }

    bool readFully(SOCKET socket, unsigned char *buffer, int length)
    {
        int received = 0;
        while (received < length)
        {
            const int result = recv(socket, reinterpret_cast<char *>(buffer) + received, length - received, 0);
            if (result <= 0)
                return false;
            received += result;
        }
        return true;
    }

    void serveVideo(SOCKET client, artemis::Decoder &decoder)
    {
        unsigned char headerBytes[artemis::kFrameHeaderSize];
        std::vector<unsigned char> payload;
        std::vector<unsigned char> pendingConfig;

        while (true)
        {
            if (!readFully(client, headerBytes, static_cast<int>(artemis::kFrameHeaderSize)))
                return;

            artemis::FrameHeader header;
            if (!artemis::FrameHeader::parse(headerBytes, sizeof(headerBytes), header))
            {
                std::printf("decode-host: invalid frame header\n");
                return;
            }
            if (header.size > 0)
            {
                payload.resize(header.size);
                if (!readFully(client, payload.data(), static_cast<int>(header.size)))
                    return;
            }

            if (header.config)
            {
                // 配置帧先缓存，随下一个画面帧一起送，避免单独送包触发解码器报错。
                pendingConfig.insert(pendingConfig.end(), payload.begin(), payload.end());
                continue;
            }

            std::vector<unsigned char> packet;
            if (!pendingConfig.empty())
            {
                packet.reserve(pendingConfig.size() + payload.size());
                packet.insert(packet.end(), pendingConfig.begin(), pendingConfig.end());
                pendingConfig.clear();
            }
            packet.insert(packet.end(), payload.begin(), payload.end());

            if (!packet.empty())
                decoder.feed(packet.data(), packet.size(), header.ptsUs);
        }
    }

    // 把音频输出状态写成 JSON，供控制页显示（写失败不影响音频）。
    void writeAudioStatus(const std::string &path, const char *sink, const std::string &device, const char *message)
    {
        if (path.empty())
            return;
        std::FILE *file = std::fopen(path.c_str(), "wb");
        if (file == nullptr)
            return;
        std::fprintf(file, "{\"sink\":\"%s\",\"device\":\"%s\",\"message\":\"%s\"}\n", sink, device.c_str(), message);
        std::fclose(file);
    }
    // 音频通道：逐帧解析 → 解码 → regulator 管缓冲 → sink。
    // 运行中监听虚拟声卡：拔掉就暂停音频并提示，重新出现就自动接上（writer/plan.html §6）。
    void watchAudioDevices()
    {
        CoInitializeEx(nullptr, COINIT_MULTITHREADED);
        while (true)
        {
            Sleep(3000);
            std::vector<std::string> names = artemis::listRenderEndpoints();
            std::lock_guard<std::mutex> lock(gAudioSinkMutex);
            if (gWavMode)
                continue;

            if (!gCableDevice.empty())
            {
                bool present = false;
                for (const std::string &name : names)
                {
                    if (name == gCableDevice)
                    {
                        present = true;
                        break;
                    }
                }
                if (!present)
                {
                    gAudioSink.reset();
                    gCableDevice.clear();
                    std::printf("decode-host: virtual cable removed, audio paused\n");
                    std::fflush(stdout);
                    writeAudioStatus(gStatusPath, "none", "",
                                     "虚拟声卡已断开，音频暂停；重新接上后会自动恢复");
                }
                continue;
            }

            for (const std::string &name : names)
            {
                if (artemis::containsNoCase(name, "cable input"))
                {
                    auto wasapi = std::make_unique<artemis::WasapiSink>(name);
                    if (wasapi->open(gAudioSampleRate, 1))
                    {
                        gAudioSink = std::move(wasapi);
                        gCableDevice = name;
                        std::printf("decode-host: virtual cable attached, audio resumed\n");
                        std::fflush(stdout);
                        writeAudioStatus(gStatusPath, "cable", name,
                                         "音频已输出到虚拟声卡，请在该声卡的采集端收听");
                    }
                    break;
                }
            }
        }
    }

    void serveAudio(SOCKET client, const AudioOptions &options)
    {
        unsigned char headerBytes[artemis::kFrameHeaderSize];
        std::vector<unsigned char> payload;
        std::vector<unsigned char> config;
        artemis::AudioDecoder decoder;
        artemis::AudioRegulator regulator;
        std::vector<float> samples;
        long blocks = 0;
        long dropped = 0;
        bool decoderReady = false;


        while (true)
        {
            if (!readFully(client, headerBytes, static_cast<int>(artemis::kFrameHeaderSize)))
                break;

            artemis::FrameHeader header;
            if (!artemis::FrameHeader::parse(headerBytes, sizeof(headerBytes), header))
            {
                std::printf("decode-host: invalid audio frame header\n");
                break;
            }
            if (header.size > 0)
            {
                payload.resize(header.size);
                if (!readFully(client, payload.data(), static_cast<int>(header.size)))
                    break;
            }

            if (header.config)
            {
                config = payload;
                std::printf("decode-host: audio config bytes=%zu head=%.8s\n", config.size(), reinterpret_cast<const char *>(config.data()));
                // 主判定 + 回退：未知厂商头先按判定试，失败再换另一种解码器，避免「只有某个品牌能用」。
                const bool opusConfig = artemis::isOpusConfig(config);
                std::vector<unsigned char> extradata = opusConfig
                                                          ? artemis::normalizedOpusHead()
                                                          : (config.size() >= 2 ? config : std::vector<unsigned char>{});
                bool opened = decoder.open(opusConfig ? "opus" : "aac", extradata);
                if (!opened)
                {
                    const char *fallback = opusConfig ? "aac" : "opus";
                    std::vector<unsigned char> fallbackExtra = opusConfig ? config : artemis::normalizedOpusHead();
                    opened = decoder.open(fallback, fallbackExtra);
                    if (opened)
                        std::printf("decode-host: audio decoder fallback (%s)\n", fallback);
                }
                if (!opened)
                {
                    std::printf("decode-host: audio decoder unavailable for this codec\n");
                    std::fflush(stdout);
                    continue;
                }
                decoderReady = true;
                std::printf("decode-host: audio decoder ready (%s)\n", opusConfig ? "opus" : "aac");
                std::fflush(stdout);
                continue;
            }

            if (!decoderReady || payload.empty())
                continue;

            samples.clear();
            const int produced = decoder.decode(payload.data(), payload.size(), header.ptsUs, samples);
            if (produced <= 0)
                continue;

            // 缓冲水位按已解出的音频时长估算；WAV 路径下不追加真实时钟等待。
            const uint32_t bufferedMs = static_cast<uint32_t>((samples.size() * 1000ull) / 48000ull);
            const auto action = !gWavMode
                                   ? regulator.observe(bufferedMs)
                                   : artemis::AudioRegulator::Action::None;
            switch (action)
            {
            case artemis::AudioRegulator::Action::DropOldest:
                ++dropped;
                break;
            case artemis::AudioRegulator::Action::InsertSilence:
                break;
            default:
                break;
            }

            {
                std::lock_guard<std::mutex> lock(gAudioSinkMutex);
                if (gAudioSink)
                    gAudioSink->write(samples.data(), static_cast<uint32_t>(samples.size()));
            }
            ++blocks;
            if (blocks % 50 == 0)
                std::printf("decode-host: audio blocks=%ld dropped=%ld target=%ums\n",
                            blocks, dropped, regulator.targetMs());
            std::fflush(stdout);
        }

        // sink 由进程持有，重连时继续写同一个目标，不在这里关闭。
        std::printf("decode-host: audio channel closed, blocks=%ld dropped=%ld\n", blocks, dropped);
        std::fflush(stdout);
    }
}

int main(int argc, char **argv)
{
    int port = 3450;
    AudioOptions audio;
    for (int index = 1; index < argc; ++index)
    {
        if (std::strcmp(argv[index], "--port") == 0 && index + 1 < argc)
            port = std::atoi(argv[index + 1]);
        else if (std::strcmp(argv[index], "--audio-port") == 0 && index + 1 < argc)
            audio.port = std::atoi(argv[index + 1]);
        else if (std::strcmp(argv[index], "--audio-wav") == 0 && index + 1 < argc)
            audio.wavPath = argv[index + 1];
        else if (std::strcmp(argv[index], "--audio-device") == 0 && index + 1 < argc)
            audio.deviceName = argv[index + 1];
        else if (std::strcmp(argv[index], "--audio-status") == 0 && index + 1 < argc)
            audio.statusPath = argv[index + 1];
        else if (std::strcmp(argv[index], "--no-audio") == 0)
            audio.enabled = false;
    }

    CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    WSADATA wsa{};
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0)
    {
        std::printf("decode-host: WSAStartup failed\n");
        return 2;
    }

    const SOCKET listener = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (listener == INVALID_SOCKET)
    {
        std::printf("decode-host: socket failed\n");
        return 3;
    }

    sockaddr_in address{};
    address.sin_family = AF_INET;
    address.sin_port = htons(static_cast<unsigned short>(port));
    inet_pton(AF_INET, "127.0.0.1", &address.sin_addr);

    int reuse = 1;
    setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, reinterpret_cast<const char *>(&reuse), sizeof(reuse));

    if (bind(listener, reinterpret_cast<sockaddr *>(&address), sizeof(address)) != 0)
    {
        std::printf("decode-host: bind 127.0.0.1:%d failed\n", port);
        return 4;
    }
    if (listen(listener, 4) != 0)
    {
        std::printf("decode-host: listen failed\n");
        return 5;
    }

    SOCKET audioListener = INVALID_SOCKET;
    if (audio.enabled)
    {
        audioListener = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        sockaddr_in audioAddress = address;
        audioAddress.sin_port = htons(static_cast<unsigned short>(audio.port));
        setsockopt(audioListener, SOL_SOCKET, SO_REUSEADDR, reinterpret_cast<const char *>(&reuse), sizeof(reuse));
        if (bind(audioListener, reinterpret_cast<sockaddr *>(&audioAddress), sizeof(audioAddress)) != 0)
        {
            std::printf("decode-host: bind 127.0.0.1:%d failed\n", audio.port);
            return 4;
        }
        if (listen(audioListener, 4) != 0)
        {
            std::printf("decode-host: audio listen failed\n");
            return 5;
        }
        std::printf("decode-host: audio listening on 127.0.0.1:%d\n", audio.port);
    }

    // writer/plan.html §6：进程级 sink + 运行中设备变化监听。
    gStatusPath = audio.statusPath;
    gWavMode = !audio.wavPath.empty();
    if (gWavMode)
    {
        auto wav = std::make_unique<artemis::WavFileSink>(audio.wavPath.c_str());
        if (!wav->open(gAudioSampleRate, 1))
        {
            std::printf("decode-host: cannot open %s for audio\n", audio.wavPath.c_str());
            return 7;
        }
        std::printf("decode-host: audio sink = wav (%s)\n", audio.wavPath.c_str());
        std::lock_guard<std::mutex> lock(gAudioSinkMutex);
        gAudioSink = std::move(wav);
        writeAudioStatus(gStatusPath, "wav", "", "音频正在写入录音文件（测试模式）");
    }
    else
    {
        {
            std::lock_guard<std::mutex> lock(gAudioSinkMutex);
            for (const std::string &name : artemis::listRenderEndpoints())
            {
                if (artemis::containsNoCase(name, "cable input"))
                {
                    auto wasapi = std::make_unique<artemis::WasapiSink>(name);
                    if (wasapi->open(gAudioSampleRate, 1))
                    {
                        std::printf("decode-host: audio sink = wasapi (%s)\n", name.c_str());
                        gAudioSink = std::move(wasapi);
                        gCableDevice = name;
                        writeAudioStatus(gStatusPath, "cable", name,
                                         "音频已输出到虚拟声卡，请在该声卡的采集端收听");
                    }
                    break;
                }
            }
            if (!gAudioSink)
            {
                std::printf("decode-host: no CABLE endpoint found, decoding only\n");
                writeAudioStatus(gStatusPath, "none", "",
                                 "未找到虚拟声卡（VB-CABLE），音频不可用；安装后重启 Artemis 即可");
            }
        }
        std::thread(watchAudioDevices).detach();
    }
    std::fflush(stdout);

    std::printf("decode-host: listening on 127.0.0.1:%d\n", port);
    std::fflush(stdout);

    artemis::Decoder decoder;
    decoder.setCallback(&onFrame, nullptr);
    if (!decoder.start())
        return 6;

    // 两个监听器放在各自线程：音频阻塞不能拖住视频。
    std::thread audioThread([audioListener, &audio]()
                            {
        if (audioListener == INVALID_SOCKET) return;
        while (true)
        {
            const SOCKET client = accept(audioListener, nullptr, nullptr);
            if (client == INVALID_SOCKET) continue;
            std::printf("decode-host: audio channel connected\n");
            std::fflush(stdout);
            serveAudio(client, audio);
            closesocket(client);
        } });

    while (true)
    {
        const SOCKET client = accept(listener, nullptr, nullptr);
        if (client == INVALID_SOCKET)
            continue;
        std::printf("decode-host: media channel connected\n");
        std::fflush(stdout);
        serveVideo(client, decoder);
        closesocket(client);
        decoder.reset();
        std::printf("decode-host: media channel closed, frames=%llu\n",
                    static_cast<unsigned long long>(gFrames));
        std::fflush(stdout);
    }

    audioThread.join();
}
