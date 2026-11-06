#pragma once

#include <string>

// 选择默认路由所在网卡的 IPv4 地址，避免选中 WSL / Hyper-V / Docker 的虚拟网卡。
// 失败时返回空串并写入 error（writer/plan.html §3.3.2）。
std::wstring SelectLanIpv4(std::wstring& error);
