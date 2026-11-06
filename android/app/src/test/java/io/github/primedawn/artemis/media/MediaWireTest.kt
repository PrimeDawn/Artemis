package io.github.primedawn.artemis.media

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 帧头编解码测试，对应 writer/plan.html §3 帧协议。
 * 12 字节：8 字节 ptsAndFlags（大端）+ 4 字节 packetSize（大端）。
 * 标志位：1 shl 63 会话首包、1 shl 62 配置帧、1 shl 61 关键帧。
 */
class MediaWireTest {

    private val sessionFlag = 1L shl 63
    private val configFlag = 1L shl 62
    private val keyFrameFlag = 1L shl 61

    @Test
    fun `header is twelve bytes`() {
        assertEquals(12, MediaWire.frame(ptsUs = 1000L, size = 512, config = false, keyFrame = false).size)
    }

    @Test
    fun `config packet sets config flag and keeps size big endian`() {
        val header = MediaWire.frame(ptsUs = 123456L, size = 0x01020304, config = true, keyFrame = false)
        val ptsAndFlags = readLong(header, 0)
        assertEquals(configFlag, ptsAndFlags)
        assertEquals(0x01020304, readInt(header, 8))
    }

    @Test
    fun `key frame carries pts and keyframe flag`() {
        val pts = 987654321L
        val header = MediaWire.frame(ptsUs = pts, size = 64, config = false, keyFrame = true)
        assertEquals(pts or keyFrameFlag, readLong(header, 0))
    }

    @Test
    fun `normal frame carries pts only`() {
        val pts = 42L
        val header = MediaWire.frame(ptsUs = pts, size = 7, config = false, keyFrame = false)
        assertEquals(pts, readLong(header, 0))
        assertEquals(7, readInt(header, 8))
    }

    @Test
    fun `session packet marks the session flag`() {
        val header = MediaWire.frame(ptsUs = 0L, size = 0, config = false, keyFrame = false, session = true)
        assertEquals(sessionFlag, readLong(header, 0))
    }

    @Test
    fun `frame body is header followed by payload`() {
        val payload = byteArrayOf(0x0a, 0x0b, 0x0c)
        val frame = MediaWire.frameWithPayload(ptsUs = 5L, payload = payload, config = false, keyFrame = true)
        assertEquals(15, frame.size)
        assertEquals(5L or keyFrameFlag, readLong(frame, 0))
        assertEquals(3, readInt(frame, 8))
        assertArrayEquals(payload, frame.copyOfRange(12, 15))
    }

    private fun readLong(bytes: ByteArray, offset: Int): Long {
        var value = 0L
        for (index in 0 until 8) {
            value = (value shl 8) or (bytes[offset + index].toLong() and 0xff)
        }
        return value
    }

    private fun readInt(bytes: ByteArray, offset: Int): Int {
        var value = 0
        for (index in 0 until 4) {
            value = (value shl 8) or (bytes[offset + index].toInt() and 0xff)
        }
        return value
    }
}
