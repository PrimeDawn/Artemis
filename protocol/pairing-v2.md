# Artemis 本地发现、信任与信令 v2

本协议实现 Spec2 的已确认 r2 功能和已批准 r3 依赖处置。v1 仅存在于未实现的旧提案，无部署兼容负担。媒体采集、真实 PeerConnection 和 OBS 播放不在本切片。

## 正常路径

1. PC 发布 `_artemis._tcp.local.`；手机 App 用 Android NSD 发现电脑，自动建立受限 presence。
2. 电脑控制页列出手机，操作者单击连接。首次手机允许一次，双方记住公钥身份。
3. 之后打开 App、恢复网络或重启服务时自动挑战认证，不扫码、不输码、不重复首次确认。
4. 设备信任、活动会话和已认证接收连接均无固定或空闲到期。用户断开停止连接意图；取消信任同时撤销授权。

发现、公钥自签名和设备名本身不授予媒体或信令权限。首次确认是可信家庭/工作室 LAN 内的 TOFU 选择，不宣称抵抗首次主动中间人。已保存的公钥绝不由新发现记录静默覆盖。

## 地址与传输

- 控制页和接收验证页：`http://127.0.0.1:<controlPort>`，默认 3000，仅本机。
- 手机入口：选定 RFC1918 IPv4 的 `wss://<address>:<tlsPort>/v2/device`，默认 3443。
- 接收端：`ws://127.0.0.1:<controlPort>/ws/receiver`。
- mDNS TXT：`v=2`、`pcId`、`spki`、`label`。不广播秘密；稳定 ID 去重，IP 可变化。
- 控制动作需 HttpOnly/SameSite=Strict 会话 Cookie、精确 Host、同源 Origin、`X-Artemis-CSRF`。Cookie 不设固定使用 TTL。
- 手机不接受跳过 TLS 校验、公共 CA 回退、明文回退或重定向。证书须自签名、有效、SAN 匹配，SPKI 与被选择/已保存身份相符。

PC 使用 30 天叶证书并在余期少于 7 天时自动用同一私钥续签；当前已建立的连接不因证书续签关闭。稳定公钥信任与短期证书有效期分离。

## 编码与身份

- JSON UTF-8，`v` 固定为 2，未知字段拒绝。模型见 `pairing-v2.schema.json`。
- `PeerIdentity = {id, publicKeySpki, label}`。公钥为 ECDSA P-256 SPKI DER 的无填充 base64url；ID 为其 SHA256 的无填充 base64url（43 字符）。
- 标签最多 64 个字符，无控制字符；只作文本显示，不是身份凭据。
- 签名采用 SHA256withECDSA，ASN.1 DER 编码后无填充 base64url。不能把 JSON 序列化顺序当签名规范。
- 握手、会话、连接、请求及消息 ID 使用 UUIDv4；随机 nonce/票据均为 32 字节 CSPRNG。

签名字节为以下字段以单个 LF 分隔的 UTF-8，无末尾 LF；字段不可含 CR/LF：

```text
artemis-v2
kind
pcId
deviceId
challengeId
nonce
connectionId
decision
```

challenge 的 kind/decision 均为 `challenge`；手机证明均为 `proof`。首次允许决定的 kind 为 `enroll-decision`，challengeId 取 requestId，decision 为 `allow` 或 `deny`。

## 手机握手与首次允许

1. 手机发送 `{v:2,kind:"hello",device:PeerIdentity}`。3 秒内到达，最大 2048 字节。
2. PC 回复 `challenge`，包含 PC 身份、challengeId、connectionId、nonce、expiresAt 和签名；手机须核验其公钥与 TLS 绑定身份相同。
3. 手机用自己的私钥回复 `proof`，含 deviceId、challengeId、connectionId、signature。挑战 30 秒内一次使用；失效由软件重试，不影响已认证连接。
4. 验证通过后只登记 presence。若双方已信任且 PC 仍有该手机的活动连接意图，可自动恢复。
5. PC 操作者点击未信任手机，发送 `enroll-request`，含 pcId、deviceId、requestId、nonce。
6. 手机用户允许后先持久保存 PC 身份，再发送签名 `enroll-decision`。PC 验证、持久保存手机身份与连接意图后回复 `trusted` 并激活会话。拒绝不保存信任。
7. ACK 丢失后，同一已允许公钥可自动重试，不再次弹首次确认；磁盘写入失败不能显示授权成功。

应用内存/控制器可持有多个受限 presence，但同一手机仅一个活动电脑，不自动抢占。未信任、未选中设备不能发送信令。

## 会话与恢复

PC 激活被选手机时先发 `{v:2,kind:"activated",manual:boolean}`：鼠标新选择为 true，故障/重启恢复为 false。手机据此区分明确的新连接意图与应被手动断开状态阻止的自动恢复。

随后发送 `{v:2,kind:"waiting"|"ready",sessionId:string|null,epoch:string|null}`。sessionId 非空表示已选手机的授权连接；双方信令端到位后 epoch 非空。正常活动不设总时长/空闲时限。

- PC侧每1秒检查、2秒无Pong判失联，约3秒内清除失联会话；Android侧自身Ping仍为30秒并自动响应PC Ping。两者均不是使用期限，正常响应的活动连接不设TTL。
- 手机重试间隔为 1、2、4、5 秒，之后上限 5 秒，附 0..250ms 抖动。没有最大重试次数或总使用时长；网络恢复回调立即尝试。
- 仅恢复被选择且仍受信任的同一身份。短暂手机掉线保留已授权接收端等待，重新签发 sessionId/epoch，旧 SDP/ICE 丢弃。
- PC 主动断开、手机发送 `{v:2,kind:"disconnect"}` 或用户取消信任会停止活动连接意图；受限 presence 可以继续供列表发现。
- 页面重组/配置变化不释放应用级连接控制器。显式退出 App、服务关闭时释放所有连接、发现与定时器。
- 系统终止进程、断电和网络故障不能保证同一 socket 永远存在；切App/锁屏暂停，回到前台且解锁后自动恢复原电脑；此流程已通过S24实测。真实媒体尚未实现。连接恢复不会自动启动采集。

## 接收票据

控制页 `POST /api/receiver-tickets` 获取 `{ticket,sessionId,expiresAt}`。票据放接收页 URL fragment，页面立即清除 fragment；不放 WS 查询参数。第一帧 `{v:2,kind:"auth",ticket}` 最大 512 字节、3 秒内到达。票据 60 秒一次消费，消费后活动连接不继承该 TTL。第二活动接收端拒绝。

## 信令

```text
{v:2,id,sessionId,epoch,kind,payload}
kind=offer|answer: payload={type:offer|answer,sdp}
kind=ice-candidate: payload={candidate:string|null,sdpMid:string|null,sdpMLineIndex:integer|null}
kind=bye: payload={reason:user|disconnect}
```

sender 只发 offer，receiver 只发 answer，ICE 双向。转发事件为 `{v:2,kind:"signal",signal:SignalEnvelope}`。接收方不根据消息指定的角色/路由目标决定权限；角色绑定于受信 socket。

fixture SDP/ICE 只证明路由，不证明 WebRTC 媒体建立。mDNS ICE 候选视为不透明字符串，不按字面 IP 改写。

## 资源与错误

- WS 帧 65536 字节，SDP 32768 字节，ICE 2048 字节；业务帧每秒 20，单 epoch 最多 128 条 ICE、1024 个消息 ID。
- PC 最多 32 条 presence、32 条信任；手机最多 8 个 PC 候选。升级限速地址表最多 256 项，60 秒窗口每地址 20 次。
- 标准拒绝：E_INPUT/400，E_AUTH/401，E_ORIGIN/E_CSRF/E_NOT_TRUSTED/403，E_NOT_FOUND/404，E_CONFLICT/E_BUSY/E_REPLAY/E_IDENTITY_CHANGED/409，E_HANDSHAKE_EXPIRED/410，E_TOO_LARGE/413，E_RATE_LIMIT/429，E_STORAGE/E_INTERNAL/500。
- WS 协议违例 1008，超长 1009，撤销 4001；用户/进程正常关闭使用 1000/1001。失败不回显原始输入。
- 不记录私钥、Cookie、CSRF、票据、nonce/签名正文、真实 SDP/ICE 或完整设备序列号。日志只含固定事件名、requestId、受控错误码。


## 本地信任已忘记时的再次允许

若手机已忘记PC，但PC仍记得该手机，电脑手动选择产生activated(manual=true)后，手机可发送 `{v:2,kind:"request-enrollment"}`。服务仅允许当前已选择且仍受信任的同一签名手机请求；它会清除活动意图并重新发首次允许请求。未知/未选择设备不能藉此绕过电脑单击，自行获得授权。自动恢复(manual=false)不会自动触发新的首次允许。

同一已选、受信身份完成新签名挑战后，可以替换其尚未判死的旧TCP连接，避免恢复必须等待旧连接失活判定；不会替换另一设备或另一台电脑。
