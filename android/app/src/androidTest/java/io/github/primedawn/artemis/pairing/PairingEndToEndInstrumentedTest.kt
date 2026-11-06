package io.github.primedawn.artemis.pairing

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.SystemClock
import android.view.accessibility.AccessibilityNodeInfo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import io.github.primedawn.artemis.ArtemisApplication
import io.github.primedawn.artemis.MainActivity
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.net.InetAddress
import java.util.concurrent.atomic.AtomicReference

/** Tester-owned integration: actual App, Keystore, private storage, OkHttp and Node service.
 * Public endpoint comes from a real host mDNS observation. If emulator multicast cannot
 * reach the host, only the discovery callback is bridged; this is explicitly reported.
 */
@RunWith(AndroidJUnit4::class)
class PairingEndToEndInstrumentedTest {
    private val instrument=InstrumentationRegistry.getInstrumentation()
    private val app=instrument.targetContext.applicationContext as ArtemisApplication
    private fun stage(name:String) { instrument.sendStatus(10,Bundle().apply{putString("stage",name)}) }
    private fun waitFor(message:String,timeout:Long=15000,predicate:()->Boolean) {
        val end=SystemClock.elapsedRealtime()+timeout
        while(SystemClock.elapsedRealtime()<end){if(predicate())return;SystemClock.sleep(25)}
        fail(message+"; last status="+app.connectionState.status+"; code="+app.connectionState.errorCode)
    }
    private fun node(text:String,node:AccessibilityNodeInfo?=instrument.uiAutomation.rootInActiveWindow):AccessibilityNodeInfo? {
        if(node==null)return null
        if(node.packageName?.toString()==app.packageName&&node.text?.toString()==text)return node
        for(i in 0 until node.childCount)node(text,node.getChild(i))?.let{return it}
        return null
    }
    private fun click(text:String) {
        waitFor("Actual Compose button missing: $text"){node(text)!=null}
        var target=node(text)
        while(target!=null&&!target.isClickable)target=target.parent
        assertTrue("Actual accessibility click must be accepted",target?.performAction(AccessibilityNodeInfo.ACTION_CLICK)==true)
    }
    private fun controller():Any?=ArtemisApplication::class.java.getDeclaredField("controller").apply{isAccessible=true}.get(app)
    @Test fun actualAppFirstConsentRecreationRestartAndManualStop() {
        val args=InstrumentationRegistry.getArguments()
        val pc=WireCodec.peer(JSONObject(WireCodec.decode(requireNotNull(args.getString("pcPeerB64")),4096).toString(Charsets.UTF_8)))
        val endpoint=DiscoveredPc(pc,InetAddress.getByName(requireNotNull(args.getString("host"))),requireNotNull(args.getString("tlsPort")).toInt())
        // Independent transport probes expose the underlying failure instead of guessing
        // from the App's deliberately coarse, safe E_NETWORK display.
        if(args.getString("skipTransportProbe")!="true") {
            java.net.Socket().use { it.connect(java.net.InetSocketAddress(endpoint.address,endpoint.port),4000) }
            stage("actual-tcp-probe-passed")
            val probe=pinnedClient(endpoint)
            try {
                probe.newCall(okhttp3.Request.Builder().url("https://${endpoint.address.hostAddress}:${endpoint.port}/transport-probe").build()).execute().use { assertEquals(404,it.code) }
                stage("actual-pinned-tls-probe-passed")
            } finally { probe.connectionPool.evictAll();probe.dispatcher.executorService.shutdown() }
        } else stage("cold-path-no-tcp-tls-warmup")
        // Only this owned test App's private trust. A new per-run PC key avoids altering other records.
        fun repository()=FileTrustRepository(File(app.noBackupFilesDir,"pairing"))
        assertNull(repository().get(pc.id));stage("integration-app-start")
        val monitor=instrument.addMonitor(MainActivity::class.java.name,null,false)
        app.startActivity(Intent(app,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        val activity=monitor.waitForActivityWithTimeout(5000)
        assertNotNull("Actual MainActivity created",activity)
        waitFor("Application controller bootstraps"){controller()!=null}
        // Give actual Android NSD a bounded discovery opportunity before bridging the observed endpoint.
        val until=SystemClock.elapsedRealtime()+6000
        while(SystemClock.elapsedRealtime()<until&&app.connectionState.status==ConnectionStatus.DISCOVERING)SystemClock.sleep(50)
        if(app.connectionState.status==ConnectionStatus.DISCOVERING||app.connectionState.status==ConnectionStatus.ERROR){
            val discovery=ArtemisApplication::class.java.getDeclaredField("discovery").apply{isAccessible=true}.get(app)
            val found=NsdDiscoveryClient::class.java.getDeclaredField("found").apply{isAccessible=true}.get(discovery)
            @Suppress("UNCHECKED_CAST") val callback=found as (DiscoveredPc)->Unit
            callback(endpoint);stage("real-endpoint-discovery-callback-bridge")
        } else stage("native-nsd-observed")
        waitFor("PC selection must cause first consent",25000){app.connectionState.status==ConnectionStatus.AWAITING_APPROVAL}
        stage("first-consent-visible");click("允许并记住")
        waitFor("Actual signed consent establishes connection"){app.connectionState.status==ConnectionStatus.CONNECTED}
        val trustedAt=requireNotNull(repository().get(pc.id)).trustedAt
        val before=controller();stage("connected-before-recreate")
        instrument.runOnMainSync{activity!!.recreate()}
        val recreated=monitor.waitForActivityWithTimeout(5000)
        assertNotNull("Activity actually recreated",recreated)
        waitFor("Connected Compose UI survives recreation"){node("已连接")!=null}
        assertSame("Application retains the actual controller",before,controller())
        assertEquals(ConnectionStatus.CONNECTED,app.connectionState.status)
        stage("awaiting-service-restart")
        waitFor("Real PC shutdown must be observed",25000){app.connectionState.status==ConnectionStatus.RECONNECTING}
        stage("observed-actual-disconnect")
        waitFor("Real Android retries and accepts same-SPKI renewed leaf",20000){app.connectionState.status==ConnectionStatus.CONNECTED}
        assertNull("No repeated consent dialog",node("允许并记住"))
        assertEquals(trustedAt,repository().get(pc.id)?.trustedAt)
        stage("reconnected-without-consent")
        click("断开连接")
        waitFor("User stop reflected by App"){app.connectionState.status==ConnectionStatus.AVAILABLE}
        assertTrue(repository().isSuppressed(pc.id));stage("manual-stop-observed")
        instrument.removeMonitor(monitor)
    }
}
