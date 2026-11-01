package io.github.primedawn.artemis.media

/**
 * 媒体帧头封装，对应 writer/plan.html §3 帧协议。
 *
 * 布局：8 字节 ptsAndFlags（大端）+ 4 字节 packetSize（大端），共 12 字节。
 * 标志位取自 scrcpy `Streamer.java`：
 * - 1 shl 63：会话首包
 * - 1 shl 62：配置帧（SPS/PPS，非画面数据）
 * - 1 shl 61：关键帧
 */
object MediaWire {

    const val HEADER_SIZE = 12

    private const val FLAG_SESSION = 1L shl 63
    private const val FLAG_CONFIG = 1L shl 62
    private const val FLAG_KEY_FRAME = 1L shl 61

    /** 只生成帧头，payload 由调用方随后写出。 */
    fun frame(
        ptsUs: Long,
        size: Int,
        config: Boolean,
        keyFrame: Boolean,
        session: Boolean = false,
    ): ByteArray {
        require(ptsUs >= 0) { "ptsUs must not be negative" }
        require(size >= 0) { "size must not be negative" }

        val header = ByteArray(HEADER_SIZE)
        // 与 scrcpy 一致：配置帧不携带时间戳，只置标志位。
        var ptsAndFlags = if (config) FLAG_CONFIG else ptsUs
        if (config && keyFrame) ptsAndFlags = ptsAndFlags or FLAG_KEY_FRAME
        if (!config && keyFrame) ptsAndFlags = ptsAndFlags or FLAG_KEY_FRAME
        if (session) ptsAndFlags = ptsAndFlags or FLAG_SESSION

        writeLong(header, 0, ptsAndFlags)
        writeInt(header, 8, size)
        return header
    }

    /** 生成完整帧：帧头 + 数据，便于一次写出。 */
    fun frameWithPayload(
        ptsUs: Long,
        payload: ByteArray,
        config: Boolean,
        keyFrame: Boolean,
        session: Boolean = false,
    ): ByteArray {
        val header = frame(ptsUs, payload.size, config, keyFrame, session)
        val frame = ByteArray(HEADER_SIZE + payload.size)
        System.arraycopy(header, 0, frame, 0, HEADER_SIZE)
        System.arraycopy(payload, 0, frame, HEADER_SIZE, payload.size)
        return frame
    }

    private fun writeLong(target: ByteArray, offset: Int, value: Long) {
        for (index in 0 until 8) {
            target[offset + index] = ((value ushr (56 - index * 8)) and 0xff).toByte()
        }
    }

    private fun writeInt(target: ByteArray, offset: Int, value: Int) {
        for (index in 0 until 4) {
            target[offset + index] = ((value ushr (24 - index * 8)) and 0xff).toByte()
        }
    }
}
