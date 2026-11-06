#include "NetworkAddress.h"

#include <winsock2.h>
#include <ws2tcpip.h>
#include <iphlpapi.h>

#include <cstring>
#include <vector>

#pragma comment(lib, "iphlpapi.lib")
#pragma comment(lib, "ws2_32.lib")

namespace {

// 接收服务只接受 RFC1918 地址（receiver/src/pairing-config.ts 的 privateIpv4），
// 因此这里也必须跳过 Clash/WARP 之类的 198.18.0.0/15 虚拟网卡，否则启动必然 E_CONFIG。
bool IsPrivateIpv4(const IN_ADDR& address) {
    const unsigned char first = address.S_un.S_un_b.s_b1;
    const unsigned char second = address.S_un.S_un_b.s_b2;
    if (first == 10) return true;
    if (first == 192 && second == 168) return true;
    if (first == 172 && second >= 16 && second <= 31) return true;
    return false;
}

std::wstring FormatAddress(const IN_ADDR& address) {
    char text[INET_ADDRSTRLEN] = {0};
    if (inet_ntop(AF_INET, &address, text, sizeof(text)) == nullptr) return L"";
    return std::wstring(text, text + std::strlen(text));
}

}  // namespace

std::wstring SelectLanIpv4(std::wstring& error) {
    error.clear();

    DWORD bestInterface = 0;
    const DWORD probe = inet_addr("8.8.8.8");
    const bool hasDefaultRoute = GetBestInterface(probe, &bestInterface) == NO_ERROR;

    ULONG size = 16 * 1024;
    std::vector<BYTE> buffer(size);
    auto* addresses = reinterpret_cast<IP_ADAPTER_ADDRESSES*>(buffer.data());
    const ULONG flags = GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_MULTICAST | GAA_FLAG_SKIP_DNS_SERVER;
    DWORD status = GetAdaptersAddresses(AF_INET, flags, nullptr, addresses, &size);
    if (status == ERROR_BUFFER_OVERFLOW) {
        buffer.resize(size);
        addresses = reinterpret_cast<IP_ADAPTER_ADDRESSES*>(buffer.data());
        status = GetAdaptersAddresses(AF_INET, flags, nullptr, addresses, &size);
    }
    if (status != NO_ERROR) {
        error = L"GetAdaptersAddresses failed";
        return L"";
    }

    std::wstring privatePreferred;
    std::wstring privateAny;
    std::wstring preferredAny;
    for (auto* adapter = addresses; adapter != nullptr; adapter = adapter->Next) {
        if (adapter->OperStatus != IfOperStatusUp) continue;
        if (adapter->IfType == IF_TYPE_SOFTWARE_LOOPBACK) continue;
        const bool preferred = hasDefaultRoute && adapter->IfIndex == bestInterface;
        for (auto* unicast = adapter->FirstUnicastAddress; unicast != nullptr; unicast = unicast->Next) {
            const sockaddr* address = unicast->Address.lpSockaddr;
            if (address == nullptr || address->sa_family != AF_INET) continue;
            const auto* ipv4 = reinterpret_cast<const sockaddr_in*>(address);
            const std::wstring text = FormatAddress(ipv4->sin_addr);
            if (text.empty()) continue;
            const bool isPrivate = IsPrivateIpv4(ipv4->sin_addr);
            if (isPrivate && preferred && privatePreferred.empty()) privatePreferred = text;
            if (isPrivate && privateAny.empty()) privateAny = text;
            if (preferred && preferredAny.empty()) preferredAny = text;
        }
    }
    if (!privatePreferred.empty()) return privatePreferred;
    if (!privateAny.empty()) return privateAny;
    if (!preferredAny.empty()) return preferredAny;

    error = L"no usable IPv4 address on an active adapter";
    return L"";
}
