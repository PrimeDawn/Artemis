package io.github.primedawn.artemis.audio

import android.content.Context
import android.media.MediaCodecList
import android.os.Handler
import android.os.Looper
import io.github.primedawn.artemis.media.MediaConnection
import io.github.primedawn.artemis.pairing.pinnedClientFor

/**
 * 音频通道编排，对应 writer/plan.html §4.1。
 *
 * 采集 → 编码 → 独立的 /audio 连接；断线自动重连（与视频一致），重连后补发配置包。
 * 任何一步失败只关闭音频，不影响视频。
 */
class AudioStream(private val context: Context) {

    private var capture: AudioCapture? = null
    private var encoder: AudioEncoder? = null
    private var media: MediaConnection? = null
    private var cachedConfig: ByteArray? = null
    private var sentFrames = 0
    private val main = Handler(Looper.getMainLooper())

    @Volatile private var active = false
    private var attempt = 0
    private var params: Params? = null

    var onState: ((String) -> Unit)? = null
    var onError: ((String) -> Unit)? = null

    private data class Params(
        val host: String,
        val port: Int,
        val pcId: String,
        val deviceId: String,
        val sessionId: String,
        val spki: ByteArray,
    )

    fun start(host: String, port: Int, pcId: String, deviceId: String, sessionId: String, spki: ByteArray) {
        stop()
        active = true
        params = Params(host, port, pcId, deviceId, sessionId, spki)
        attempt = 0

        val codecName = AudioCodecChoice.choose(availableEncoders())
        if (codecName == null) {
            onError?.invoke("E_AUDIO_CODEC")
            active = false
            return
        }

        val audioEncoder = AudioEncoder(codecName)
        val audioCapture = AudioCapture()
        encoder = audioEncoder
        capture = audioCapture

        audioEncoder.onError = { code -> onError?.invoke(code) }
        audioCapture.onError = { code -> onError?.invoke(code) }
        audioCapture.onSamples = { samples, frames, ptsUs -> audioEncoder.encode(samples, frames, ptsUs) }
        audioEncoder.onFrame = { data, ptsUs, config ->
            if (config) {
                cachedConfig = data
                android.util.Log.i("ArtemisAudio", "config bytes=${data.size}")
            } else {
                sentFrames += 1
                if (sentFrames % 50 == 0) android.util.Log.i("ArtemisAudio", "sent audio frames=$sentFrames")
            }
            media?.sendFrame(data, ptsUs, config, keyFrame = false)
        }

        audioEncoder.start()
        audioCapture.start()
        openMedia()

        android.util.Log.i("ArtemisAudio", "audio stream started codec=$codecName")
    }

    private fun openMedia() {
        val current = params ?: return
        val url = "wss://${current.host}:${current.port}/audio"
        val connection = MediaConnection(
            pinnedClientFor(current.spki),
            url,
            current.pcId,
            current.deviceId,
            current.sessionId,
        )
        connection.onReady = {
            // 重连后先补发配置包，PC 端解码器重建才能继续出样本。
            cachedConfig?.let { cfg -> connection.sendFrame(cfg, 0L, config = true, keyFrame = false) }
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
        capture?.stop()
        capture = null
        encoder?.stop()
        encoder = null
        media?.close()
        media = null
        cachedConfig = null
    }

    private fun availableEncoders(): List<String> {
        val types = mutableListOf<String>()
        val list = MediaCodecList(MediaCodecList.REGULAR_CODECS)
        for (info in list.codecInfos) {
            if (!info.isEncoder) continue
            types.addAll(info.supportedTypes.toList())
        }
        return types
    }
}
