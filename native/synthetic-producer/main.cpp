// 合成帧生产者：按 30fps 往共享内存写色条 + 帧号，供 Artemis Camera 过滤器读取。
// 依据 writer/plan.html §3。
#include "../artemis-camera/SharedFrame.h"

#include <windows.h>

#include <chrono>
#include <cstdint>
#include <cstdio>
#include <thread>
#include <vector>

namespace
{
    constexpr uint32_t kWidth = 1280;
    constexpr uint32_t kHeight = 720;
    constexpr uint32_t kStride = kWidth * 4;
    constexpr auto kPeriod = std::chrono::milliseconds(33);

    void FillBars(std::vector<uint8_t> &frame, uint64_t index)
    {
        const uint32_t barWidth = kWidth / 8;
        for (uint32_t y = 0; y < kHeight; ++y)
        {
            uint8_t *row = frame.data() + static_cast<uint64_t>(y) * kStride;
            for (uint32_t x = 0; x < kWidth; ++x)
            {
                const uint32_t bar = x / barWidth;
                const bool level = ((bar & 1u) == 0u);
                uint8_t *pixel = row + static_cast<uint64_t>(x) * 4ull;
                const uint8_t base = level ? 235 : 16;
                pixel[0] = (bar & 4u) ? base : 16;
                pixel[1] = (bar & 2u) ? base : 16;
                pixel[2] = (bar & 1u) ? base : 16;
                pixel[3] = 255;
            }
        }

        // 底部一条随帧号移动的白色方块，肉眼即可确认帧在更新。
        const uint32_t blockWidth = 160;
        const uint32_t start = static_cast<uint32_t>((index * 24ull) % (kWidth - blockWidth));
        for (uint32_t y = kHeight - 80; y < kHeight - 40; ++y)
        {
            uint8_t *row = frame.data() + static_cast<uint64_t>(y) * kStride;
            for (uint32_t x = start; x < start + blockWidth; ++x)
            {
                uint8_t *pixel = row + static_cast<uint64_t>(x) * 4ull;
                pixel[0] = 255;
                pixel[1] = 255;
                pixel[2] = 255;
                pixel[3] = 255;
            }
        }
    }
}

int wmain()
{
    const HANDLE mapping = CreateFileMappingW(INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE,
                                              static_cast<DWORD>(artemis::kSharedFrameBytes >> 32),
                                              static_cast<DWORD>(artemis::kSharedFrameBytes & 0xFFFFFFFFull),
                                              artemis::kSharedFrameName);
    if (mapping == nullptr)
    {
        std::fwprintf(stderr, L"CreateFileMapping failed: %lu\n", GetLastError());
        return 1;
    }

    auto *base = static_cast<uint8_t *>(MapViewOfFile(mapping, FILE_MAP_ALL_ACCESS, 0, 0,
                                                      static_cast<SIZE_T>(artemis::kSharedFrameBytes)));
    if (base == nullptr)
    {
        std::fwprintf(stderr, L"MapViewOfFile failed: %lu\n", GetLastError());
        CloseHandle(mapping);
        return 1;
    }

    auto *header = reinterpret_cast<artemis::FrameHeader *>(base);
    header->magic = artemis::kFrameMagic;
    header->version = artemis::kFrameVersion;
    header->width = kWidth;
    header->height = kHeight;
    header->stride = kStride;
    header->format = artemis::kFrameFormatRgb32;
    header->writeIndex = 0;
    header->frameIndex = 0;
    header->timestampUs = 0;

    std::vector<uint8_t> frame(kStride * kHeight);
    std::fwprintf(stdout, L"Artemis synthetic producer running\n");
    std::fflush(stdout);

    const auto began = std::chrono::steady_clock::now();
    for (uint64_t index = 0;; ++index)
    {
        FillBars(frame, index);

        ++header->writeIndex; // 奇数：写入中
        uint8_t *destination = base + artemis::FrameOffset(index);
        memcpy(destination, frame.data(), frame.size());
        header->frameIndex = index;
        header->timestampUs = static_cast<uint64_t>(
            std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now() - began).count());
        ++header->writeIndex; // 偶数：稳定

        std::this_thread::sleep_for(kPeriod);
    }
}
