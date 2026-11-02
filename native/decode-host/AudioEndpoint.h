// VB-CABLE 端点探测，对应 writer/plan.html §6「音频输出目标：用户自备虚拟声卡」。
// 只认 CABLE Input / CABLE Output 这一对；名称匹配刻意大小写不敏感，但只在成对时才算命中。
#pragma once

#include <string>
#include <vector>

namespace artemis
{
    struct CablePair
    {
        std::string renderName;  // 例：CABLE Input (VB-Audio Virtual Cable)
        std::string captureName; // 例：CABLE Output (VB-Audio Virtual Cable)
    };

    bool containsNoCase(const std::string &haystack, const std::string &needle);

    // 在给定端点名列表中寻找 VB-CABLE 的一对端点。
    // 命中返回 true 并写入 out；任一侧缺失返回 false，out 保持不变。
    bool selectCablePair(const std::vector<std::string> &renderNames,
                         const std::vector<std::string> &captureNames,
                         CablePair &out);
}
