package io.github.primedawn.artemis.pairing
import org.junit.Test
import org.junit.Assert.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.InetAddress
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.Signature

/** Real nine-PC/real WSS integration. Only the OS discovery callback is bridged on JVM. */
class CandidateCapacityIntegrationTest {
    @Test fun onlyEightOfNineActualPcEndpointsReceiveAuthenticatedPresence() {
        val file=System.getenv("ARTEMIS_CANDIDATE_ENDPOINTS")
        // Standalone unit runs cannot create the nine Windows listeners; the independent
        // tester runner supplies them. This integration is required by that runner.
        org.junit.Assume.assumeTrue("Run tests/pairing-candidate-cap.mjs for the real nine-PC fixture",file!=null)
        val data=JSONObject(File(requireNotNull(file)).readText());val rows=data.getJSONArray("endpoints")
        assertEquals(9,rows.length())
        val key=KeyPairGenerator.getInstance("EC").apply{initialize(java.security.spec.ECGenParameterSpec("secp256r1"))}.generateKeyPair()
        val spki=key.public.encoded;val peer=PeerIdentity(WireCodec.encode(MessageDigest.getInstance("SHA-256").digest(spki)),spki,"Actual JVM protocol peer")
        val identity=object:DeviceIdentity {override fun peer()=peer;override fun sign(message:ByteArray)=Signature.getInstance("SHA256withECDSA").run{initSign(key.private);update(message);sign()}}
        val discovery=object:DiscoveryClient {override fun start(found:(DiscoveredPc)->Unit,lost:(String)->Unit,error:(String)->Unit){for(i in 0 until rows.length()){val row=rows.getJSONObject(i);found(DiscoveredPc(WireCodec.peer(row.getJSONObject("peer")),InetAddress.getByName(row.getString("host")),row.getInt("port")))}};override fun close(){}}
        val root=java.nio.file.Files.createTempDirectory("actual-candidate-capacity-").toFile()
        val runtime=ConnectionController(discovery,OkHttpDeviceClient(identity),FileTrustRepository(root),{}, {it()})
        try{runtime.start();val observed=File(data.getString("observation"));val deadline=System.nanoTime()+java.util.concurrent.TimeUnit.SECONDS.toNanos(15)
            while(!observed.isFile&&System.nanoTime()<deadline)Thread.sleep(25)
            assertTrue("Host must observe eight real authenticated WebSockets",observed.isFile)
            val result=JSONObject(observed.readText());assertEquals(8,result.getInt("actualPresenceConnections"));assertFalse(result.getBoolean("ninthConnected"))
        }finally{runtime.dispose();require(root.canonicalPath.startsWith(File(System.getProperty("java.io.tmpdir")).canonicalPath+File.separator));root.deleteRecursively()}
    }
}
