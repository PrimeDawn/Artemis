package io.github.primedawn.artemis.pairing

import android.content.Intent
import android.os.Bundle
import android.os.PowerManager
import android.os.SystemClock
import android.view.WindowManager
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import io.github.primedawn.artemis.ArtemisApplication
import io.github.primedawn.artemis.MainActivity
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ForegroundLifecycleInstrumentedTest {
    @Test fun actualWindowPowerModeAndRecreationPreserveSession() {
        val instrument = InstrumentationRegistry.getInstrumentation()
        val app = instrument.targetContext.applicationContext as ArtemisApplication
        val monitor = instrument.addMonitor(MainActivity::class.java.name, null, false)
        fun waitFor(label: String, test: () -> Boolean) {
            val end = SystemClock.elapsedRealtime() + 7000
            while (SystemClock.elapsedRealtime() < end) { if (test()) return; SystemClock.sleep(25) }
            fail(label + "; state=" + app.connectionState.status)
        }
        fun controller(): Any = ArtemisApplication::class.java.getDeclaredField("controller").apply { isAccessible = true }.get(app)!!
        fun session(runtime: Any): String? {
            val client = runtime.javaClass.getDeclaredField("client").apply { isAccessible = true }.get(runtime)
            val sockets = client.javaClass.getDeclaredField("sockets").apply { isAccessible = true }.get(client) as Map<*, *>
            return sockets.values.mapNotNull { socket -> socket!!.javaClass.getDeclaredField("session").apply { isAccessible = true }.get(socket) as? String }.firstOrNull()
        }
        try {
            app.startActivity(Intent(app, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            val activity = monitor.waitForActivityWithTimeout(4000) as? MainActivity
            assertNotNull("Actual Activity", activity)
            waitFor("Trusted real LAN session resumes") { app.connectionState.status == ConnectionStatus.CONNECTED }
            val runtime = controller(); val before = session(runtime); assertNotNull(before)
            instrument.runOnMainSync {
                assertTrue("Actual window flag", activity!!.window.attributes.flags and WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON != 0)
                activity.recreate()
            }
            val recreated = monitor.waitForActivityWithTimeout(4000) as? MainActivity
            assertNotNull("Actual recreated Activity", recreated)
            waitFor("Connected after recreation") { app.connectionState.status == ConnectionStatus.CONNECTED }
            assertSame(runtime, controller()); assertEquals("Recreation must preserve actual WSS session", before, session(runtime))
            val mode = (app.getSystemService(android.content.Context.POWER_SERVICE) as PowerManager).isPowerSaveMode
            instrument.sendStatus(0, Bundle().apply { putString("actualPowerSaveMode", mode.toString()); putString("actualRecreatedSameSession", "true") })
        } finally { instrument.removeMonitor(monitor) }
    }
}
