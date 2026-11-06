// 帧头解析测试，对应 writer/plan.html §3 帧协议。
#include "FrameHeader.h"

#include <cstdio>
#include <cstring>

namespace
{
    int failures = 0;

    void expect(bool condition, const char *message)
    {
        if (!condition)
        {
            std::printf("FAIL: %s\n", message);
            ++failures;
        }
        else
        {
            std::printf("ok: %s\n", message);
        }
    }
}

int main()
{
    using artemis::FrameHeader;

    // 普通帧：时间戳 42，长度 7
    {
        unsigned char buffer[12] = {0, 0, 0, 0, 0, 0, 0, 42, 0, 0, 0, 7};
        FrameHeader header;
        expect(FrameHeader::parse(buffer, sizeof(buffer), header), "parse normal frame succeeds");
        expect(header.ptsUs == 42, "normal frame keeps pts");
        expect(header.size == 7, "normal frame keeps size");
        expect(!header.config, "normal frame is not config");
        expect(!header.keyFrame, "normal frame is not key frame");
        expect(!header.session, "normal frame is not session start");
    }

    // 配置帧：只有标志位
    {
        unsigned char buffer[12] = {0x40, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 99};
        FrameHeader header;
        expect(FrameHeader::parse(buffer, sizeof(buffer), header), "parse config frame succeeds");
        expect(header.config, "config frame sets config flag");
        expect(header.ptsUs == 0, "config frame carries no pts");
        expect(header.size == 99, "config frame keeps size");
    }

    // 关键帧：时间戳 + 标志位
    {
        unsigned char buffer[12] = {0x20, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 3};
        FrameHeader header;
        expect(FrameHeader::parse(buffer, sizeof(buffer), header), "parse key frame succeeds");
        expect(header.keyFrame, "key frame sets key flag");
        expect(header.ptsUs == 5, "key frame keeps pts");
    }

    // 会话首包
    {
        unsigned char buffer[12] = {0x80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
        FrameHeader header;
        expect(FrameHeader::parse(buffer, sizeof(buffer), header), "parse session frame succeeds");
        expect(header.session, "session frame sets session flag");
    }

    // 长度不足必须拒绝
    {
        unsigned char buffer[8] = {0};
        FrameHeader header;
        expect(!FrameHeader::parse(buffer, sizeof(buffer), header), "reject short header");
    }

    // 过大长度必须拒绝（防止一次分配 2GB）
    {
        unsigned char buffer[12] = {0, 0, 0, 0, 0, 0, 0, 0, 0x7f, 0xff, 0xff, 0xff};
        FrameHeader header;
        expect(!FrameHeader::parse(buffer, sizeof(buffer), header), "reject oversized packet");
    }

    std::printf(failures == 0 ? "ALL PASS\n" : "FAILURES\n");
    return failures == 0 ? 0 : 1;
}
