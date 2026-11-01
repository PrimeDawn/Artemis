// 解码进程：本机 TCP 收帧 → FFmpeg 解码 → BGRA → 写共享内存。
// 由接收服务启动，用户不直接运行；对应 writer/plan.html §2、§6。
#include "Decoder.h"
#include "FrameHeader.h"
#include "SharedWriter.h"

#include <winsock2.h>
#include <ws2tcpip.h>

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

namespace
{
    constexpr uint32_t kWidth = 1280;
    constexpr uint32_t kHeight = 720;

    artemis::SharedWriter gWriter;
    uint64_t gFrames = 0;

    void onFrame(const uint8_t *bgra, uint32_t stride, uint32_t width, uint32_t height, uint64_t ptsUs, void *)
    {
        if (!gWriter.open(width, height))
            return;
        if (gWriter.write(bgra, stride, ptsUs))
            ++gFrames;
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

    void serve(SOCKET client, artemis::Decoder &decoder)
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
}

int main(int argc, char **argv)
{
    int port = 3450;
    for (int index = 1; index < argc; ++index)
    {
        if (std::strcmp(argv[index], "--port") == 0 && index + 1 < argc)
            port = std::atoi(argv[index + 1]);
    }

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

    std::printf("decode-host: listening on 127.0.0.1:%d\n", port);
    std::fflush(stdout);

    artemis::Decoder decoder;
    decoder.setCallback(&onFrame, nullptr);
    if (!decoder.start())
        return 6;

    while (true)
    {
        const SOCKET client = accept(listener, nullptr, nullptr);
        if (client == INVALID_SOCKET)
            continue;
        std::printf("decode-host: media channel connected\n");
        std::fflush(stdout);
        serve(client, decoder);
        closesocket(client);
        decoder.reset();
        std::printf("decode-host: media channel closed, frames=%llu\n",
                    static_cast<unsigned long long>(gFrames));
        std::fflush(stdout);
    }
}
