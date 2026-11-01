package io.github.primedawn.artemis.media

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString
import org.json.JSONObject

/**
 * 媒体连接：与配对用的控制连接分开的第二条 WebSocket，路径 /media。
 * 对应 writer/plan.html §5.1、§5.3。
 *
 * 连接建立后先发一条 JSON 绑定消息（pcId / deviceId / sessionId），
 * 服务端校验通过才接受后续二进制帧。
 */
class MediaConnection(
    private val client: OkHttpClient,
    private val url: String,
    private val pcId: String,
    private val deviceId: String,
    private val sessionId: String,
) {
    private companion object {
        const val KEEPALIVE_TIMEOUT_MS = 6000L
    }


    private var socket: WebSocket? = null
    private val watchdog = android.os.Handler(android.os.Looper.getMainLooper())
    @Volatile private var lastServerMessageAt = 0L
    private val watchdogRunnable = object : Runnable {
        override fun run() {
            val silentFor = System.currentTimeMillis() - lastServerMessageAt
            if (lastServerMessageAt > 0 && silentFor > KEEPALIVE_TIMEOUT_MS) {
                android.util.Log.w("ArtemisMedia", "keepalive timeout ${silentFor}ms, reconnecting")
                socket?.cancel()
                socket = null
                onClosed?.invoke("E_MEDIA_KEEPALIVE")
                return
            }
            watchdog.postDelayed(this, 1000)
        }
    }

    @Volatile
    var onReady: (() -> Unit)? = null

    @Volatile
    var onClosed: ((String) -> Unit)? = null

    fun connect() {
        check(socket == null) { "media connection already started" }
        val request = Request.Builder().url(url).build()
        client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                android.util.Log.i("ArtemisMedia", "media open: ${response.code}")
                lastServerMessageAt = System.currentTimeMillis()
                watchdog.postDelayed(watchdogRunnable, 1000)
                val hello = JSONObject()
                    .put("pcId", pcId)
                    .put("deviceId", deviceId)
                    .put("sessionId", sessionId)
                webSocket.send(hello.toString())
                // 绑定消息发出后才允许发帧，避免二进制先于 hello 被服务端拒绝
                socket = webSocket
                onReady?.invoke()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                lastServerMessageAt = System.currentTimeMillis()
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                lastServerMessageAt = System.currentTimeMillis()
            }

            override fun onFailure(webSocket: WebSocket, error: Throwable, response: Response?) {
                socket = null
                android.util.Log.e("ArtemisMedia", "media failed: ${error.javaClass.name}: ${error.message}", error)
                onClosed?.invoke(error.message ?: "E_MEDIA_NETWORK")
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                watchdog.removeCallbacks(watchdogRunnable)
                android.util.Log.i("ArtemisMedia", "media closed: $code $reason")
                socket = null
                onClosed?.invoke(reason.ifBlank { "E_MEDIA_CLOSED" })
            }
        })
    }

    /** 发送一帧：12 字节头 + 编码数据，作为一条二进制消息。 */
    fun sendFrame(data: ByteArray, ptsUs: Long, config: Boolean, keyFrame: Boolean): Boolean {
        val current = socket ?: return false
        val frame = MediaWire.frameWithPayload(ptsUs, data, config, keyFrame)
        return current.send(frame.toByteString())
    }

    fun close() {
        watchdog.removeCallbacks(watchdogRunnable)
        socket?.close(1000, "client closing")
        socket = null
    }
}
