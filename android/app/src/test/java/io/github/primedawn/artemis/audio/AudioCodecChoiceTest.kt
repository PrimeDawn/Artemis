package io.github.primedawn.artemis.audio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * 编码器选择规则，对应 writer/plan.html §4.1：Opus 优先，设备不支持时回退 AAC-LC。
 */
class AudioCodecChoiceTest {

    @Test
    fun prefersOpusWhenEncoderIsAvailable() {
        assertEquals(
            AudioCodecChoice.OPUS,
            AudioCodecChoice.choose(listOf("audio/mp4a-latm", "audio/opus")),
        )
    }

    @Test
    fun fallsBackToAacWhenOpusIsMissing() {
        assertEquals(
            AudioCodecChoice.AAC,
            AudioCodecChoice.choose(listOf("audio/mp4a-latm")),
        )
    }

    @Test
    fun returnsNullWhenNeitherEncoderExists() {
        assertNull(AudioCodecChoice.choose(listOf("audio/raw")))
    }

    @Test
    fun ignoresUnrelatedEncoders() {
        assertEquals(
            AudioCodecChoice.AAC,
            AudioCodecChoice.choose(listOf("audio/raw", "audio/mp4a-latm", "video/avc")),
        )
    }
}
