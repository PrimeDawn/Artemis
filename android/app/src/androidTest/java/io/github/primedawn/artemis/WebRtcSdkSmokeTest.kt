package io.github.primedawn.artemis

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.webrtc.PeerConnectionFactory

/** tester/test-plan.html TC-D1: actual JNI factory lifecycle, without media capture. */
@RunWith(AndroidJUnit4::class)
class WebRtcSdkSmokeTest {
    @Test
    fun nativeFactoryCanBeCreatedAndReleased() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(context).createInitializationOptions(),
        )
        val factory = PeerConnectionFactory.builder().createPeerConnectionFactory()
        try {
            assertTrue("Native factory pointer must be nonzero", factory.nativePeerConnectionFactory != 0L)
        } finally {
            factory.dispose()
        }
    }
}
