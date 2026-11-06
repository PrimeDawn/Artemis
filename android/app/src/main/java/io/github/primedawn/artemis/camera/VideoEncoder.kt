package io.github.primedawn.artemis.camera

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.view.Surface
import java.util.concurrent.atomic.AtomicBoolean

/**
 * H.264 编码器，参数取自 writer/plan.html §4 与 scrcpy `SurfaceEncoder.java`。
 * 相机直接输出到输入 Surface，画面不经过 CPU 帧拷贝。
 */
class VideoEncoder(
    private val width: Int = 1280,
    private val height: Int = 720,
    private val frameRate: Int = 30,
    private val bitRate: Int = 4_000_000,
    private val iFrameIntervalSeconds: Int = 10,
) {

    private var codec: MediaCodec? = null
    private var running = AtomicBoolean(false)
    private var thread: Thread? = null

    @Volatile
    var onFrame: ((data: ByteArray, ptsUs: Long, config: Boolean, keyFrame: Boolean) -> Unit)? = null

    val inputSurface: Surface
        get() = checkNotNull(surface) { "encoder not started" }

    private var surface: Surface? = null

    fun start() {
        check(codec == null) { "encoder already started" }
        val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height).apply {
            setInteger(MediaFormat.KEY_BIT_RATE, bitRate)
            setInteger(MediaFormat.KEY_FRAME_RATE, frameRate)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, iFrameIntervalSeconds)
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
            // 画面静止时补帧，避免解码侧长时间收不到数据（scrcpy REPEAT_FRAME_DELAY_US）
            setLong(MediaFormat.KEY_REPEAT_PREVIOUS_FRAME_AFTER, 100_000L)
            setInteger(MediaFormat.KEY_LATENCY, 1)
            setInteger(MediaFormat.KEY_PRIORITY, 0)
        }

        val encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
        encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        surface = encoder.createInputSurface()
        encoder.start()
        codec = encoder
        running.set(true)

        thread = Thread({ drainLoop(encoder) }, "Artemis-video-encoder").apply { start() }
    }

    private fun drainLoop(encoder: MediaCodec) {
        val info = MediaCodec.BufferInfo()
        while (running.get()) {
            val index = try {
                encoder.dequeueOutputBuffer(info, 10_000L)
            } catch (error: IllegalStateException) {
                return
            }
            if (index < 0) continue

            val buffer = encoder.getOutputBuffer(index) ?: continue
            if (info.size > 0) {
                val data = ByteArray(info.size)
                buffer.position(info.offset)
                buffer.limit(info.offset + info.size)
                buffer.get(data)
                val config = (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0
                val keyFrame = (info.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME) != 0
                onFrame?.invoke(data, info.presentationTimeUs, config, keyFrame)
            }
            encoder.releaseOutputBuffer(index, false)
        }
    }

    fun requestKeyFrame() {
        val encoder = codec ?: return
        val params = android.os.Bundle().apply {
            putInt(MediaCodec.PARAMETER_KEY_REQUEST_SYNC_FRAME, 0)
        }
        runCatching { encoder.setParameters(params) }
    }

    fun stop() {
        running.set(false)
        thread?.join(1000)
        thread = null
        surface?.release()
        surface = null
        runCatching { codec?.stop() }
        runCatching { codec?.release() }
        codec = null
    }
}
