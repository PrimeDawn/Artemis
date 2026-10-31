package io.github.primedawn.artemis

import android.os.Bundle
import android.os.PowerManager
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import io.github.primedawn.artemis.pairing.ConnectionScreen

// Spec2 writer/plan.html r2 §3.5: UI observes the Application-owned controller.
class MainActivity : ComponentActivity() {
    private var visible = false
    private val screenEvents = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == Intent.ACTION_SCREEN_OFF) {
                window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                (application as ArtemisApplication).setForeground(this@MainActivity,false)
            } else syncAvailability()
        }
    }
    private fun syncAvailability(claimOwnership:Boolean=false) {
        val usable = visible && (getSystemService(POWER_SERVICE) as PowerManager).isInteractive &&
            !(getSystemService(KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked
        if (usable) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        (application as ArtemisApplication).setForeground(this,usable,claimOwnership)
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val filter = IntentFilter(Intent.ACTION_SCREEN_OFF).apply { addAction(Intent.ACTION_USER_PRESENT) }
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(screenEvents, filter, RECEIVER_NOT_EXPORTED)
        else registerReceiver(screenEvents, filter)
        enableEdgeToEdge()
        setContent {
            MaterialTheme(colorScheme = if (isSystemInDarkTheme()) darkColorScheme() else lightColorScheme()) {
                Surface(modifier = Modifier.fillMaxSize()) {
                    val app=application as ArtemisApplication
                    ConnectionScreen(app.connectionState,app::approve,app::disconnect,app::forgetCurrent)
                }
            }
        }
    }
    override fun onStart() { super.onStart(); visible = true; syncAvailability(claimOwnership=true) }
    override fun onResume() { super.onResume(); syncAvailability(claimOwnership=true) }
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        // 修复: debugger/debug-003.html. Unlock can finish after onResume.
        syncAvailability(claimOwnership = hasFocus && visible)
        if (hasFocus) window.decorView.post {
            if (visible && hasWindowFocus()) syncAvailability(claimOwnership = true)
        }
    }
    override fun onStop() {
        visible = false
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (!isChangingConfigurations) (application as ArtemisApplication).setForeground(this,false)
        super.onStop()
    }
    override fun onDestroy() { unregisterReceiver(screenEvents); super.onDestroy() }
}
