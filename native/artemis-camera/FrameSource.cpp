#include "FrameSource.h"
#include "SharedFrame.h"

#include <windows.h>

#include <algorithm>
#include <cstring>

namespace artemis
{
    namespace
    {
        constexpr uint8_t kBars[8][3] = {
            {235, 235, 235}, {235, 235, 16}, {16, 235, 235}, {16, 235, 16},
            {235, 16, 235}, {235, 16, 16}, {16, 16, 235}, {16, 16, 16},
        };

        // 5x7 数字字形，用于在画面上叠加帧号。
        constexpr uint8_t kDigits[10][7] = {
            {0x0E, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0E},
            {0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E},
            {0x0E, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1F},
            {0x1F, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0E},
            {0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02},
            {0x1F, 0x10, 0x1E, 0x01, 0x01, 0x11, 0x0E},
            {0x06, 0x08, 0x10, 0x1E, 0x11, 0x11, 0x0E},
            {0x1F, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08},
            {0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E},
            {0x0E, 0x11, 0x11, 0x0F, 0x01, 0x02, 0x0C},
        };

        void DrawDigit(uint8_t *destination, uint32_t stride, uint32_t width, uint32_t height, int x0, int y0, int digit, int scale)
        {
            if (digit < 0 || digit > 9)
                return;
            for (int row = 0; row < 7; ++row)
            {
                for (int column = 0; column < 5; ++column)
                {
                    if ((kDigits[digit][row] & (1 << (4 - column))) == 0)
                        continue;
                    for (int dy = 0; dy < scale; ++dy)
                    {
                        for (int dx = 0; dx < scale; ++dx)
                        {
                            const int x = x0 + column * scale + dx;
                            const int y = y0 + row * scale + dy;
                            if (x < 0 || y < 0 || static_cast<uint32_t>(x) >= width || static_cast<uint32_t>(y) >= height)
                                continue;
                            uint8_t *pixel = destination + static_cast<uint64_t>(y) * stride + static_cast<uint64_t>(x) * 4ull;
                            pixel[0] = 255;
                            pixel[1] = 255;
                            pixel[2] = 255;
                            pixel[3] = 255;
                        }
                    }
                }
            }
        }
    }

    FrameSource::~FrameSource()
    {
        if (mapped_ != nullptr)
            UnmapViewOfFile(mapped_);
        if (mapping_ != nullptr)
            CloseHandle(static_cast<HANDLE>(mapping_));
    }

    bool FrameSource::TryOpenMapping()
    {
        if (mapped_ != nullptr)
            return true;
        HANDLE mapping = OpenFileMappingW(FILE_MAP_READ, FALSE, kSharedFrameName);
        if (mapping == nullptr)
            return false;
        void *view = MapViewOfFile(mapping, FILE_MAP_READ, 0, 0, static_cast<SIZE_T>(kSharedFrameBytes));
        if (view == nullptr)
        {
            CloseHandle(mapping);
            return false;
        }
        mapping_ = mapping;
        mapped_ = static_cast<const uint8_t *>(view);
        return true;
    }

    bool FrameSource::TryReadShared(FrameView &view)
    {
        if (!TryOpenMapping())
            return false;
        const auto *header = reinterpret_cast<const FrameHeader *>(mapped_);
        if (header->magic != kFrameMagic || header->version != kFrameVersion)
            return false;
        if (header->format != kFrameFormatRgb32)
            return false;
        if (header->width == 0 || header->height == 0 || header->width > kMaxWidth || header->height > kMaxHeight)
            return false;
        if (header->stride < header->width * kBytesPerPixel)
            return false;

        const uint64_t first = header->writeIndex;
        if ((first & 1ull) != 0ull)
            return false; // 正在写入
        const uint64_t frameIndex = header->frameIndex;
        const uint64_t second = header->writeIndex;
        if (first != second)
            return false; // 读取期间被写入，放弃本帧

        view.data = mapped_ + FrameOffset(frameIndex);
        view.width = header->width;
        view.height = header->height;
        view.stride = header->stride;
        view.frameIndex = frameIndex;
        return true;
    }

    void FrameSource::RenderBars(uint32_t width, uint32_t height, uint8_t *destination, uint32_t stride, uint64_t frameIndex)
    {
        const uint32_t barWidth = width / 8u;
        for (uint32_t y = 0; y < height; ++y)
        {
            uint8_t *row = destination + static_cast<uint64_t>(y) * stride;
            for (uint32_t x = 0; x < width; ++x)
            {
                const uint32_t index = std::min<uint32_t>(x / (barWidth == 0 ? 1u : barWidth), 7u);
                uint8_t *pixel = row + static_cast<uint64_t>(x) * 4ull;
                pixel[0] = kBars[index][2];
                pixel[1] = kBars[index][1];
                pixel[2] = kBars[index][0];
                pixel[3] = 255;
            }
        }

        // 右下角叠加帧号，用于确认帧来自实时更新。
        const int scale = 4;
        const int digitWidth = 5 * scale + scale;
        const int totalWidth = digitWidth * 6;
        int x0 = static_cast<int>(width) - totalWidth - 16;
        const int y0 = static_cast<int>(height) - 7 * scale - 16;
        uint64_t value = frameIndex;
        for (int position = 5; position >= 0; --position)
        {
            const int digit = static_cast<int>(value % 10ull);
            value /= 10ull;
            DrawDigit(destination, stride, width, height, x0 + position * digitWidth, y0, digit, scale);
        }
    }

    void FrameSource::FillFrame(uint32_t width, uint32_t height, uint8_t *destination, uint32_t stride)
    {
        FrameView view;
        if (TryReadShared(view))
        {
            lastFrameIndex_ = view.frameIndex;
            lastCopy_.resize(static_cast<size_t>(view.stride) * view.height);
            for (uint32_t y = 0; y < view.height; ++y)
            {
                std::memcpy(lastCopy_.data() + static_cast<uint64_t>(y) * view.stride,
                            view.data + static_cast<uint64_t>(y) * view.stride, view.stride);
            }
            lastCopyValid_ = true;
            const uint32_t copyWidth = std::min(width, view.width);
            const uint32_t copyStride = std::min(stride, view.stride);
            const uint32_t copyHeight = std::min(height, view.height);
            for (uint32_t y = 0; y < copyHeight; ++y)
            {
                std::memcpy(destination + static_cast<uint64_t>(y) * stride,
                            lastCopy_.data() + static_cast<uint64_t>(y) * view.stride, copyStride);
            }
            return;
        }

        // 没有 producer：持续输出合成色条，画面上的帧号仍单调递增。
        RenderBars(width, height, destination, stride, syntheticIndex_++);
    }
}
