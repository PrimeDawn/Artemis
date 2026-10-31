package io.github.primedawn.artemis.pairing
import android.content.Context
import java.net.InetAddress
import java.net.Inet4Address
import java.util.Locale
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.ext.SdkExtensions
import org.json.JSONObject
fun parseDiscoveredPc(attributes: Map<String, ByteArray>, host: InetAddress, port: Int): DiscoveredPc? = runCatching {
    require(host is Inet4Address && port in 1024..65535)
    val ip = host.address.map { it.toInt() and 255 }; require(ip[0] == 10 || ip[0] == 192 && ip[1] == 168 || ip[0] == 172 && ip[1] in 16..31)
    require(attributes.values.all { it.size <= 255 } && attributes.values.sumOf { it.size } <= 1024)
    val fields = attributes.mapKeys { it.key.lowercase(Locale.ROOT) }; require(fields.size == attributes.size && fields.keys == setOf("v", "pcid", "spki", "label"))
    fun text(key: String) = Charsets.UTF_8.newDecoder().decode(java.nio.ByteBuffer.wrap(fields.getValue(key))).toString()
    require(text("v") == "2")
    val peer = WireCodec.peer(JSONObject().put("id",text("pcid")).put("publicKeySpki",text("spki")).put("label",text("label")))
    DiscoveredPc(peer,host,port)
}.getOrNull()
@Suppress("DEPRECATION")
class NsdDiscoveryClient(context: Context) : DiscoveryClient {
    private val app = context.applicationContext
    private val nsd = app.getSystemService(Context.NSD_SERVICE) as NsdManager
    private var listener: NsdManager.DiscoveryListener? = null
    private var multicast: WifiManager.MulticastLock? = null
    private var foreground = true
    private var closed = false
    private var generation = 0
    private var found: ((DiscoveredPc) -> Unit)? = null
    private var lost: ((String) -> Unit)? = null
    private var error: ((String) -> Unit)? = null
    private val queue = ArrayDeque<NsdServiceInfo>()
    private val names = mutableMapOf<String, String>()
    private var resolving = false
    @Synchronized override fun start(onFound: (DiscoveredPc) -> Unit, onLost: (String) -> Unit, onError: (String) -> Unit) { found=onFound;lost=onLost;error=onError;begin() }
    @Synchronized fun setForeground(value: Boolean) { foreground=value;if(value)begin() else stop() }
    @Synchronized fun refresh() { stop();begin() }
    private fun begin() {
        if(closed || !foreground || found==null || listener!=null)return
        val token=++generation
        try {
            val managed = Build.VERSION.SDK_INT >= 33 && SdkExtensions.getExtensionVersion(Build.VERSION_CODES.TIRAMISU) >= 7
            if(!managed)multicast=(app.getSystemService(Context.WIFI_SERVICE) as WifiManager).createMulticastLock("Artemis-discovery").apply { setReferenceCounted(false);acquire() }
            val callback=object:NsdManager.DiscoveryListener {
                override fun onDiscoveryStarted(type:String) {}
                override fun onDiscoveryStopped(type:String) {}
                override fun onStartDiscoveryFailed(type:String,code:Int) { synchronized(this@NsdDiscoveryClient){if(token==generation){stop();error?.invoke("E_DISCOVERY")}} }
                override fun onStopDiscoveryFailed(type:String,code:Int) {}
                override fun onServiceFound(info:NsdServiceInfo) { synchronized(this@NsdDiscoveryClient){if(token!=generation||info.serviceType.trimEnd('.')!="_artemis._tcp"||queue.size>=32||queue.any{it.serviceName==info.serviceName})return;synchronized(queue){queue.addLast(info)};resolveNext(token)} }
                override fun onServiceLost(info:NsdServiceInfo) { synchronized(this@NsdDiscoveryClient){if(token==generation)names.remove(info.serviceName)?.let{lost?.invoke(it)}} }
            }
            listener=callback;nsd.discoverServices("_artemis._tcp.",NsdManager.PROTOCOL_DNS_SD,callback)
        }catch(_:Exception){stop();error?.invoke("E_DISCOVERY")}
    }
    private fun resolveNext(token:Int) {
        if(token!=generation||resolving||queue.isEmpty())return
        val service=queue.removeFirst();resolving=true
        try{nsd.resolveService(service,object:NsdManager.ResolveListener {
            override fun onResolveFailed(info:NsdServiceInfo,code:Int){synchronized(this@NsdDiscoveryClient){if(token==generation){resolving=false;resolveNext(token)}}}
            override fun onServiceResolved(info:NsdServiceInfo){synchronized(this@NsdDiscoveryClient){if(token!=generation)return;resolving=false;val host=info.host;if(host!=null)parseDiscoveredPc(info.attributes,host,info.port)?.let{pc->if(names.size<32||names.containsKey(info.serviceName)){names[info.serviceName]=pc.peer.id;found?.invoke(pc)}};resolveNext(token)}}
        })}catch(_:Exception){resolving=false;error?.invoke("E_DISCOVERY");resolveNext(token)}
    }
    private fun stop(){generation++;val old=listener;listener=null;if(old!=null)runCatching{nsd.stopServiceDiscovery(old)};queue.clear();resolving=false;multicast?.let{if(it.isHeld)it.release()};multicast=null}
    @Synchronized override fun close(){closed=true;stop();found=null;lost=null;error=null;names.clear()}
}
