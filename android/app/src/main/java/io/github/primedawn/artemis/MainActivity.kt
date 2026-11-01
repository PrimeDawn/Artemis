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
import io.github.primedawn.artemis.pairing.ConnectionStatus
import io.github.primedawn.artemis.media.MediaSessionCoordinator
import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember

// Spec2 writer/plan.html r2 §3.5: UI observes the Application-owned controller.
class MainActivity : ComponentActivity() {
    private var visible = false
    private val media by lazy { MediaSessionCoordinator(this) }
    private var pendingMedia: (() -> Unit)? = null
    private val cameraPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) pendingMedia?.invoke()
        pendingMedia = null
    }
    private fun ensureCameraThen(action: () -> Unit) {
        val granted = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        if (granted) action() else { pendingMedia = action; cameraPermission.launch(Manifest.permission.CAMERA) }
    }
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
                    val state = app.connectionState
                    val mediaHost = remember(state.sessionId) { state.host }
                    LaunchedEffect(state.status, state.sessionId, state.host, state.port, state.pcId, state.spki) {
                        val host = mediaHost
                        val port = state.port
                        val sessionId = state.sessionId
                        val pcId = state.pcId
                        val spki = state.spki
                        android.util.Log.i("ArtemisMedia", "effect status=${state.status} host=$host port=$port session=$sessionId pc=$pcId spki=${spki?.size}")
                        if (state.status == ConnectionStatus.CONNECTED && host != null && port != null && sessionId != null && pcId != null && spki != null) {
                            ensureCameraThen { media.start(pcId, app.deviceId, host, port, sessionId, spki) }
                        } else {
                            media.stop()
                        }
                    }
                    ConnectionScreen(state,app::approve,app::disconnect,app::forgetCurrent)
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
    override fun onDestroy() {
        media.stop()
        if (Build.VERSION.SDK_INT >= 33) unregisterReceiver(screenEvents) else unregisterReceiver(screenEvents)
        super.onDestroy()
    }
}
