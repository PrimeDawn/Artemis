package io.github.primedawn.artemis.audio

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.os.Bundle
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * MediaCodec 音频编码，对应 writer/plan.html §4.1。
 *
 * Opus 优先、AAC-LC 回退；csd-0 作为配置包只发一次，重连后由 AudioStream 重发。
 */
class AudioEncoder(
    private val codecName: String,
    private val sampleRate: Int = 48000,
    private val channels: Int = 1,
    private val bitRate: Int = 64000,
) {

    private var codec: MediaCodec? = null
    private val bufferInfo = MediaCodec.BufferInfo()
    private val timeoutUs = 10_000L
    private var queuedFrames = 0L
    private var loggedCapacity = false

    /** (data, ptsUs, config) */
    var onFrame: ((ByteArray, Long, Boolean) -> Unit)? = null
    var onError: ((String) -> Unit)? = null

    fun start() {
        val format = MediaFormat.createAudioFormat(codecName, sampleRate, channels).apply {
            setInteger(MediaFormat.KEY_BIT_RATE, bitRate)
            if (codecName.equals(AudioCodecChoice.AAC, ignoreCase = true)) {
                setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
            }
        }

        val created = runCatching { MediaCodec.createEncoderByType(codecName) }.getOrNull()
        if (created == null) {
            onError?.invoke("E_AUDIO_ENCODER")
            return
        }
        runCatching {
            created.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            created.start()
        }.onFailure {
            created.release()
            onError?.invoke("E_AUDIO_ENCODER")
            return
        }
        codec = created
    }

    fun encode(samples: ShortArray, frames: Int, ptsUs: Long) {
        val encoder = codec ?: return

        // 编码器输入缓冲可能小于一次采集的帧数，必须按容量切块，否则会丢掉整块音频。
        var offset = 0
        while (offset < frames) {
            val inputIndex = encoder.dequeueInputBuffer(timeoutUs)
            if (inputIndex < 0) break
            val input = encoder.getInputBuffer(inputIndex) ?: break
            input.clear()
            val maxFrames = input.capacity() / 2
            if (maxFrames <= 0) {
                encoder.queueInputBuffer(inputIndex, 0, 0, 0, 0)
                break
            }
            val chunk = minOf(frames - offset, maxFrames)
            if (!loggedCapacity) { loggedCapacity = true; android.util.Log.i("ArtemisAudio", "input capacity=$maxFrames frames frames=$frames") }
            val shorts = input.order(ByteOrder.nativeOrder()).asShortBuffer()
            shorts.put(samples, offset, chunk)
            val chunkPts = ptsUs + offset * 1_000_000L / sampleRate
            encoder.queueInputBuffer(inputIndex, 0, chunk * 2, chunkPts, 0)
            offset += chunk
            queuedFrames += chunk
        }

        drainOutput()
        if (queuedFrames >= 4800 && queuedFrames % 4800 < frames) {
            android.util.Log.i("ArtemisAudio", "encoded frames=$queuedFrames")
        }
    }

    /** 重连后补发配置包用。 */
    fun requestConfig() {
        val encoder = codec ?: return
        runCatching {
            val params = Bundle().apply { putInt(MediaCodec.PARAMETER_KEY_REQUEST_SYNC_FRAME, 0) }
            encoder.setParameters(params)
        }
    }

    fun stop() {
        codec?.let {
            runCatching { it.stop() }
            it.release()
        }
        codec = null
    }

    private fun drainOutput() {
        val encoder = codec ?: return
        while (true) {
            val index = encoder.dequeueOutputBuffer(bufferInfo, timeoutUs)
            when {
                index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    // 配置包在手机端归一化，避免把各厂商的 Opus 头（OpusHead / AOPUSHDR / 无 csd）
                    // 留给 PC 端猜：Opus 一律发标准 OpusHead，AAC 发 csd-0（AudioSpecificConfig）。
                    val csd = encoder.outputFormat.getByteBuffer("csd-0")
                    val isOpus = codecName.equals(AudioCodecChoice.OPUS, ignoreCase = true)
                    val config = when {
                        isOpus -> defaultOpusHead()
                        csd != null -> csd.toByteArray()
                        else -> ByteArray(0)
                    }
                    android.util.Log.i("ArtemisAudio", "config bytes=${config.size} codec=$codecName")
                    onFrame?.invoke(config, 0L, true)
                }
                index >= 0 -> {
                    val buffer: ByteBuffer = encoder.getOutputBuffer(index) ?: continue
                    if (bufferInfo.size > 0) {
                        val data = ByteArray(bufferInfo.size)
                        buffer.position(bufferInfo.offset)
                        buffer.get(data, 0, bufferInfo.size)
                        onFrame?.invoke(data, bufferInfo.presentationTimeUs, false)
                    }
                    encoder.releaseOutputBuffer(index, false)
                }
                else -> return
            }
        }
    }

    private fun ByteBuffer.toByteArray(): ByteArray {
        position(0)
        val data = ByteArray(remaining())
        get(data)
        return data
    }

    /** 19 字节 OpusHead：版本 1、单声道、48 kHz、无预跳过。 */
    private fun defaultOpusHead(): ByteArray {
        val head = ByteArray(19)
        val magic = "OpusHead".toByteArray(Charsets.US_ASCII)
        System.arraycopy(magic, 0, head, 0, magic.size)
        head[8] = 1                      // version
        head[9] = 1                      // channel count
        head[10] = 0x38                  // pre-skip 低字节 = 312
        head[11] = 0x01
        head[12] = 0x80.toByte()         // input sample rate 48000 (LE)
        head[13] = 0xBB.toByte()
        head[14] = 0
        head[15] = 0
        head[16] = 0                     // output gain
        head[17] = 0
        head[18] = 0                     // channel mapping family
        return head
    }
}
