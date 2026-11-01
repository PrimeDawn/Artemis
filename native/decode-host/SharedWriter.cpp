#include "SharedWriter.h"

#include "../artemis-camera/SharedFrame.h"

#include <windows.h>

#include <cstring>

namespace artemis
{
    SharedWriter::~SharedWriter()
    {
        if (view_ != nullptr)
            UnmapViewOfFile(view_);
        if (mapping_ != nullptr)
            CloseHandle(static_cast<HANDLE>(mapping_));
    }

    bool SharedWriter::open(uint32_t width, uint32_t height)
    {
        if (width == 0 || height == 0 || width > kMaxWidth || height > kMaxHeight)
            return false;
        if (width_ == width && height_ == height && view_ != nullptr)
            return true;

        if (view_ != nullptr)
        {
            UnmapViewOfFile(view_);
            view_ = nullptr;
        }
        if (mapping_ != nullptr)
        {
            CloseHandle(static_cast<HANDLE>(mapping_));
            mapping_ = nullptr;
        }

        HANDLE mapping = CreateFileMappingW(INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE,
                                            static_cast<DWORD>(kSharedFrameBytes >> 32),
                                            static_cast<DWORD>(kSharedFrameBytes & 0xFFFFFFFFull),
                                            kSharedFrameName);
        if (mapping == nullptr)
            return false;

        void *view = MapViewOfFile(mapping, FILE_MAP_ALL_ACCESS, 0, 0, static_cast<SIZE_T>(kSharedFrameBytes));
        if (view == nullptr)
        {
            CloseHandle(mapping);
            return false;
        }

        mapping_ = mapping;
        view_ = static_cast<uint8_t *>(view);
        width_ = width;
        height_ = height;

        auto *header = reinterpret_cast<FrameHeader *>(view_);
        header->magic = kFrameMagic;
        header->version = kFrameVersion;
        header->width = width;
        header->height = height;
        header->stride = width * kBytesPerPixel;
        header->format = kFrameFormatRgb32;
        header->writeIndex = 0;
        header->frameIndex = 0;
        header->timestampUs = 0;
        return true;
    }

    bool SharedWriter::write(const uint8_t *frame, uint32_t stride, uint64_t timestampUs)
    {
        if (view_ == nullptr || frame == nullptr)
            return false;
        if (stride < width_ * kBytesPerPixel)
            return false;

        auto *header = reinterpret_cast<FrameHeader *>(view_);
        const uint64_t index = frameIndex_++;

        ++header->writeIndex; // 奇数：写入中
        uint8_t *destination = view_ + FrameOffset(index);
        const uint32_t rowBytes = width_ * kBytesPerPixel;
        for (uint32_t row = 0; row < height_; ++row)
        {
            std::memcpy(destination + static_cast<uint64_t>(row) * rowBytes,
                        frame + static_cast<uint64_t>(row) * stride, rowBytes);
        }
        header->frameIndex = index;
        header->timestampUs = timestampUs;
        ++header->writeIndex; // 偶数：稳定

        ++framesWritten_;
        return true;
    }
}
