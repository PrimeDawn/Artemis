package io.github.primedawn.artemis.pairing
import org.junit.Test
import org.junit.Assert.*
import okhttp3.tls.HeldCertificate
import okhttp3.tls.HandshakeCertificates
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okhttp3.Response
import mockwebserver3.MockWebServer
import mockwebserver3.MockResponse
import java.security.KeyStore
import java.security.MessageDigest
import java.security.Signature
import java.net.InetAddress
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.json.JSONObject

class DeviceTransportTest {
    private fun peer(cert: HeldCertificate, label: String): PeerIdentity { val bytes = cert.certificate.publicKey.encoded; return PeerIdentity(WireCodec.encode(MessageDigest.getInstance("SHA-256").digest(bytes)), bytes, label) }
    @Test fun identityUsesThePersistedKeystoreEntry() {
        val cert = HeldCertificate.Builder().ecdsa256().build(); val store = KeyStore.getInstance("PKCS12").apply { load(null, null); setKeyEntry("artemis-device-identity-v2", cert.keyPair.private, charArrayOf(), arrayOf(cert.certificate)) }
        val actual = KeystoreDeviceIdentity("phone", store, charArrayOf()); assertEquals(peer(cert,"phone").id,actual.peer().id)
        val bytes = "independent keystore message".toByteArray(); assertTrue(WireCodec.verify(actual.peer(),bytes,WireCodec.encode(actual.sign(bytes))))
    }
    @Test fun nsdDecoderRequiresVersionPrivateAddressAndConsistentPublicIdentity() {
        val cert = HeldCertificate.Builder().ecdsa256().build(); val pc = peer(cert,"PC")
        val attrs = mapOf("v" to "2".toByteArray(), "pcId" to pc.id.toByteArray(), "spki" to WireCodec.encode(pc.publicKeySpki).toByteArray(), "label" to "PC".toByteArray())
        assertEquals(pc.id,parseDiscoveredPc(attrs,InetAddress.getByName("192.168.1.8"),3443)?.peer?.id)
        assertNull(parseDiscoveredPc(attrs,InetAddress.getByName("8.8.8.8"),3443))
        assertNull(parseDiscoveredPc(attrs + ("pcId" to "A".repeat(43).toByteArray()),InetAddress.getByName("192.168.1.8"),3443))
    }
    @Test fun realPinnedWebSocketCompletesTheMutualProofHandshake() {
        val pcCert = HeldCertificate.Builder().commonName("PC").addSubjectAlternativeName("127.0.0.1").ecdsa256().build(); val phoneCert = HeldCertificate.Builder().ecdsa256().build()
        val pc = peer(pcCert,"PC"); val phone = peer(phoneCert,"phone"); val proof = CountDownLatch(1); val error = AtomicReference<String?>(null)
        val closed = CountDownLatch(1)
        val challengeId = UUID.randomUUID().toString(); val connectionId = UUID.randomUUID().toString(); val nonce = WireCodec.encode(ByteArray(32) { 7 })
        val server = MockWebServer(); server.useHttps(HandshakeCertificates.Builder().heldCertificate(pcCert).build().sslSocketFactory()); server.start(InetAddress.getByName("127.0.0.1"),0)
        server.enqueue(MockResponse.Builder().webSocketUpgrade(object : WebSocketListener() {
            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                if (code != 1000) error.set("Unexpected close code: $code")
                webSocket.close(code, "")
                closed.countDown()
            }
            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val m = JSONObject(text)
                    if (m.getString("kind") == "hello") {
                        assertEquals(phone.id,WireCodec.peer(m.getJSONObject("device")).id)
                        val bytes = WireCodec.canonical("challenge",pc.id,phone.id,challengeId,nonce,connectionId,"challenge")
                        val sig = Signature.getInstance("SHA256withECDSA").run { initSign(pcCert.keyPair.private); update(bytes); sign() }
                        webSocket.send(JSONObject().put("v",2).put("kind","challenge").put("pc",WireCodec.peerJson(pc)).put("challengeId",challengeId).put("connectionId",connectionId).put("nonce",nonce).put("expiresAt",System.currentTimeMillis()+30000).put("signature",WireCodec.encode(sig)).toString())
                    } else if (m.getString("kind") == "proof") {
                        assertTrue(WireCodec.verify(phone,WireCodec.canonical("proof",pc.id,phone.id,challengeId,nonce,connectionId,"proof"),m.getString("signature"))); proof.countDown()
                    }
                } catch (e: Throwable) { error.set(e.javaClass.simpleName); proof.countDown() }
            }
        }).build())
        val identity = object : DeviceIdentity { override fun peer() = phone; override fun sign(message: ByteArray): ByteArray = Signature.getInstance("SHA256withECDSA").run { initSign(phoneCert.keyPair.private); update(message); sign() } }
        val client = OkHttpDeviceClient(identity)
        try {
            client.open(DiscoveredPc(pc,InetAddress.getByName("127.0.0.1"),server.port),{}, { error.set(it); proof.countDown() })
            assertTrue("real WSS proof must arrive",proof.await(5,TimeUnit.SECONDS)); assertNull(error.get())
            client.closePeer(pc.id)
            assertTrue("Peer receives the actual normal Close frame",closed.await(3,TimeUnit.SECONDS))
            assertNull(error.get())
        }
        finally { client.close(); server.close() }
    }
}
