package io.github.primedawn.artemis.media

import android.content.Context
import android.os.Handler
import android.os.Looper
import io.github.primedawn.artemis.audio.AudioStream
import io.github.primedawn.artemis.camera.CameraCaptureService
import io.github.primedawn.artemis.camera.VideoEncoder
import io.github.primedawn.artemis.pairing.pinnedClientFor

/**
 * 把相机采集、H.264 编码与媒体连接串起来，对应 writer/plan.html §2。
 *
 * 媒体通道断开后自动重连（debugger/debug-004-fix.html）：只要会话仍然有效，
 * 就按递增间隔重建连接；用户断开或退出时停止重连。
 */
class MediaSessionCoordinator(private val context: Context) {

    private var encoder: VideoEncoder? = null
    private var camera: CameraCaptureService? = null
    private var media: MediaConnection? = null
    private var audio: AudioStream? = null
    private val main = Handler(Looper.getMainLooper())

    private var active = false
    private var attempt = 0
    private var params: Params? = null

    // 缓存配置帧（SPS/PPS）：重连后新解码器需要它才能解出画面
    @Volatile private var cachedConfig: ByteArray? = null

    @Volatile
    var onState: ((String) -> Unit)? = null

    private data class Params(
        val pcId: String,
        val deviceId: String,
        val host: String,
        val port: Int,
        val sessionId: String,
        val spki: ByteArray,
    )

    fun start(pcId: String, deviceId: String, host: String, port: Int, sessionId: String, spki: ByteArray) {
        stop()
        params = Params(pcId, deviceId, host, port, sessionId, spki)
        active = true
        attempt = 0

        val videoEncoder = VideoEncoder()
        val capture = CameraCaptureService(context)
        encoder = videoEncoder
        camera = capture

        android.util.Log.i("ArtemisMedia", "coordinator start pc=$pcId host=$host port=$port session=$sessionId")
        // 编码输出交给当前媒体连接；重连后 media 指向新连接，回调无需重装。
        var sent = 0
        videoEncoder.onFrame = { data, ptsUs, config, keyFrame ->
            if (config) cachedConfig = data
            val ok = media?.sendFrame(data, ptsUs, config, keyFrame) ?: false
            sent += 1
            if (sent % 30 == 0) android.util.Log.i("ArtemisMedia", "frames sent=$sent ok=$ok size=${data.size} config=$config key=$keyFrame")
        }
        videoEncoder.start()
        android.util.Log.i("ArtemisMedia", "encoder started, surface=${videoEncoder.inputSurface}")
        openMedia()

        // writer/plan.html §4.1、§4.2：音频挂进同一生命周期，失败只降级音频。
        val audioStream = AudioStream(context)
        audioStream.onState = { code -> main.post { onState?.invoke(code) } }
        audioStream.onError = { code -> main.post { onState?.invoke(code) } }
        audioStream.start(host, port, pcId, deviceId, sessionId, spki)
        audio = audioStream

        capture.onStarted = { main.post { onState?.invoke("E_MEDIA_STREAMING") } }
        capture.onError = { code -> main.post { onState?.invoke(code) } }
        capture.start(videoEncoder.inputSurface)
    }

    /** 建立媒体连接；断开时由 [scheduleReconnect] 重试。 */
    private fun openMedia() {
        val current = params ?: return
        val url = "wss://${current.host}:${current.port}/media"
        val connection = MediaConnection(
            pinnedClientFor(current.spki),
            url,
            current.pcId,
            current.deviceId,
            current.sessionId,
        )
        connection.onReady = {
            // 新连接就绪：先补发配置帧，再请求关键帧，避免解码器没有参数集
            cachedConfig?.let { cfg -> connection.sendFrame(cfg, 0L, config = true, keyFrame = false) }
            encoder?.requestKeyFrame()
        }
        connection.onClosed = { code ->
            main.post {
                if (active) {
                    onState?.invoke(code)
                    scheduleReconnect()
                }
            }
        }
        media = connection
        android.util.Log.i("ArtemisMedia", "connecting $url")
        connection.connect()
    }

    private fun scheduleReconnect() {
        if (!active) return
        attempt += 1
        val delayMs = minOf(1000L * attempt, 5000L)
        main.postDelayed({
            if (!active) return@postDelayed
            media?.close()
            media = null
            openMedia()
        }, delayMs)
    }

    fun stop() {
        active = false
        params = null
        attempt = 0
        main.removeCallbacksAndMessages(null)
        camera?.stop()
        camera = null
        audio?.stop()
        audio = null
        encoder?.stop()
        encoder = null
        media?.close()
        media = null
    }
}
