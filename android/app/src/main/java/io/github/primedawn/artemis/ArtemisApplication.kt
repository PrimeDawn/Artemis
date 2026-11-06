package io.github.primedawn.artemis

import android.app.Application
import android.net.ConnectivityManager
import android.net.Network
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import io.github.primedawn.artemis.pairing.*
import java.io.File
import java.lang.ref.WeakReference
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

// Spec2 plan §3.5: Activity/Compose recreation must not own the connection lifetime.
class ArtemisApplication : Application() {
    var connectionState by mutableStateOf(ConnectionUiState())
        private set
    @Volatile private var controller: ConnectionController? = null
    @Volatile private var discovery: NsdDiscoveryClient? = null
    private val foreground = AtomicBoolean(false)
    private var foregroundOwner: WeakReference<Any>? = null
    // 媒体连接绑定需要手机身份 ID（不是包名）；启动协程里赋值，未就绪前为空。
    @Volatile var deviceId: String = ""; private set
    private val main = Handler(Looper.getMainLooper())
    private val bootstrap = Executors.newSingleThreadExecutor { r -> Thread(r,"Artemis-startup").apply { isDaemon=true } }
    private var networks: ConnectivityManager? = null
    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) { if (foreground.get()) { discovery?.refresh();controller?.onNetworkAvailable() } }
    }
    override fun onCreate() {
        super.onCreate()
        bootstrap.execute {
            try {
                val repository=FileTrustRepository(File(noBackupFilesDir,"pairing"))
                val label=Build.MODEL.filter { it.code>=32 && it.code!=127 }.take(64).ifBlank { "Android phone" }
                val identity=KeystoreDeviceIdentity(label)
                deviceId = identity.peer().id
                val nsd=NsdDiscoveryClient(this)
                val runtime=ConnectionController(nsd,OkHttpDeviceClient(identity),repository,{ connectionState=it },{ main.post(it) })
                synchronized(this@ArtemisApplication) {
                    nsd.setForeground(foreground.get());discovery=nsd;controller=runtime
                    runtime.setForeground(foreground.get());runtime.start()
                }
                networks=(getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager).also { it.registerDefaultNetworkCallback(networkCallback) }
            } catch (_: Exception) { main.post { connectionState=ConnectionUiState(ConnectionStatus.ERROR,errorCode="E_START") } }
            finally { bootstrap.shutdown() }
        }
    }
    @Synchronized fun setForeground(source:Any,value:Boolean,claimOwnership:Boolean=false) {
        // 修复: debugger/debug-002.html. Only the current foreground window
        // may pause availability; a stopped Activity must not override its successor.
        if(claimOwnership) foregroundOwner=WeakReference(source)
        if(foregroundOwner?.get() !== source) return
        foreground.set(value)
        controller?.setForeground(value)
        discovery?.setForeground(value)
        if(value) controller?.start()
    }
    fun approve(requestId:String,allow:Boolean) { controller?.approve(requestId,allow) }
    fun disconnect() { controller?.disconnect() }
    fun forgetCurrent() { controller?.forgetCurrent() }
    override fun onTerminate() { networks?.unregisterNetworkCallback(networkCallback);controller?.dispose();super.onTerminate() }
}
