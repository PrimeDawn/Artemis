#include "AudioEndpoint.h"

#include <cctype>

namespace artemis
{
    bool containsNoCase(const std::string &haystack, const std::string &needle)
    {
        if (needle.empty() || haystack.size() < needle.size())
            return false;

        for (size_t start = 0; start + needle.size() <= haystack.size(); ++start)
        {
            bool matched = true;
            for (size_t index = 0; index < needle.size(); ++index)
            {
                const unsigned char a = static_cast<unsigned char>(haystack[start + index]);
                const unsigned char b = static_cast<unsigned char>(needle[index]);
                if (std::tolower(a) != std::tolower(b))
                {
                    matched = false;
                    break;
                }
            }
            if (matched)
                return true;
        }
        return false;
    }

    bool selectCablePair(const std::vector<std::string> &renderNames,
                         const std::vector<std::string> &captureNames,
                         CablePair &out)
    {
        const std::string renderNeedle = "cable input";
        const std::string captureNeedle = "cable output";

        const std::string *render = nullptr;
        for (const std::string &name : renderNames)
        {
            if (containsNoCase(name, renderNeedle))
            {
                render = &name;
                break;
            }
        }
        if (render == nullptr)
            return false;

        const std::string *capture = nullptr;
        for (const std::string &name : captureNames)
        {
            if (containsNoCase(name, captureNeedle))
            {
                capture = &name;
                break;
            }
        }
        if (capture == nullptr)
            return false;

        out.renderName = *render;
        out.captureName = *capture;
        return true;
    }
}
