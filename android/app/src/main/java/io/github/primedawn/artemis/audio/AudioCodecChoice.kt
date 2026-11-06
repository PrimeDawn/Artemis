package io.github.primedawn.artemis.audio

/**
 * 音频编码器选择，对应 writer/plan.html §4.1：Opus 优先，设备不支持时回退 AAC-LC。
 * 只看编码器能力列表，不接触 Android API，便于 JVM 单测。
 */
object AudioCodecChoice {
    const val OPUS = "audio/opus"
    const val AAC = "audio/mp4a-latm"

    fun choose(available: List<String>): String? {
        if (available.contains(OPUS)) return OPUS
        if (available.contains(AAC)) return AAC
        return null
    }
}
