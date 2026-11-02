package io.github.primedawn.artemis.audio

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder

/**
 * AudioRecord 采集，对应 writer/plan.html §4.1。
 *
 * 48 kHz / 单声道 / PCM16；缓冲约 20 ms；PTS 以累计采样帧换算，保证与视频共用同一时间基准。
 */
class AudioCapture(private val sampleRate: Int = 48000) {

    private var record: AudioRecord? = null
    private var thread: Thread? = null

    @Volatile private var running = false

    /** (samples, frameCount, ptsUs) */
    var onSamples: ((ShortArray, Int, Long) -> Unit)? = null
    var onError: ((String) -> Unit)? = null

    @SuppressLint("MissingPermission")
    fun start() {
        val minBuffer = AudioRecord.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        if (minBuffer <= 0) {
            onError?.invoke("E_AUDIO_INIT")
            return
        }

        val framesPerBlock = sampleRate / 50 // 20 ms
        val recorder = AudioRecord(
            MediaRecorder.AudioSource.MIC,
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            maxOf(minBuffer, framesPerBlock * 2),
        )
        if (recorder.state != AudioRecord.STATE_INITIALIZED) {
            recorder.release()
            onError?.invoke("E_AUDIO_INIT")
            return
        }

        record = recorder
        running = true
        var framesRead = 0L
        recorder.startRecording()
        android.util.Log.i("ArtemisAudio", "capture started rate=$sampleRate")

        thread = Thread({
            val buffer = ShortArray(framesPerBlock)
            while (running) {
                val read = recorder.read(buffer, 0, buffer.size)
                if (read < 0) android.util.Log.e("ArtemisAudio", "capture read error=$read")
                if (read > 0) {
                    val ptsUs = framesRead * 1_000_000L / sampleRate
                    framesRead += read
                    onSamples?.invoke(buffer.copyOf(read), read, ptsUs)
                }
            }
        }, "artemis-audio-capture").also { it.start() }
    }

    fun stop() {
        running = false
        thread?.join(500)
        thread = null
        record?.let {
            runCatching { it.stop() }
            it.release()
        }
        record = null
    }
}
