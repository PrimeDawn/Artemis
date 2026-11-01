// 把解码后的 BGRA 帧写进设备层共享内存，协议见 artemis-camera/SharedFrame.h。
#pragma once

#include <cstdint>
#include <vector>

namespace artemis
{
    class SharedWriter
    {
    public:
        SharedWriter() = default;
        ~SharedWriter();

        SharedWriter(const SharedWriter &) = delete;
        SharedWriter &operator=(const SharedWriter &) = delete;

        bool open(uint32_t width, uint32_t height);

        // frame 为 width*height*4 的 BGRA 数据，stride = width*4。
        bool write(const uint8_t *frame, uint32_t stride, uint64_t timestampUs);

        uint64_t framesWritten() const { return framesWritten_; }

    private:
        void *mapping_ = nullptr;
        uint8_t *view_ = nullptr;
        uint32_t width_ = 0;
        uint32_t height_ = 0;
        uint64_t frameIndex_ = 0;
        uint64_t framesWritten_ = 0;
    };
}
