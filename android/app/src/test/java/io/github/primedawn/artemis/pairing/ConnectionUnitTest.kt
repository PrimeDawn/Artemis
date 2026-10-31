package io.github.primedawn.artemis.pairing

import org.junit.Test
import org.junit.Assert.*
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.util.Base64
import org.json.JSONObject
import java.nio.file.Files
import java.security.cert.CertificateException
import okhttp3.tls.HeldCertificate
import okhttp3.tls.HandshakeCertificates
import mockwebserver3.MockWebServer
import mockwebserver3.MockResponse
import okhttp3.Request
import java.net.InetAddress

class ConnectionUnitTest {
    private fun identity(): Pair<PeerIdentity, java.security.KeyPair> {
        val key = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
        val id = Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(key.public.encoded))
        return PeerIdentity(id, key.public.encoded, "测试电脑") to key
    }
    @Test fun canonicalSignatureBindsBothPeersAndConnection() {
        assertEquals("artemis-v2\nproof\npc\nphone\nid\nnonce\nconnection\nproof", WireCodec.canonical("proof", "pc", "phone", "id", "nonce", "connection", "proof").toString(Charsets.UTF_8))
        val (peer, key) = identity(); val bytes = "independent transcript".toByteArray()
        val sig = Signature.getInstance("SHA256withECDSA").run { initSign(key.private); update(bytes); sign() }
        assertTrue(WireCodec.verify(peer, bytes, Base64.getUrlEncoder().withoutPadding().encodeToString(sig)))
        assertFalse(WireCodec.verify(peer, "changed".toByteArray(), Base64.getUrlEncoder().withoutPadding().encodeToString(sig)))
    }
    @Test fun peerIdCannotBeReplacedByDeviceName() {
        val (peer, _) = identity(); val encoded = JSONObject().put("id", peer.id).put("label", peer.label).put("publicKeySpki", Base64.getUrlEncoder().withoutPadding().encodeToString(peer.publicKeySpki))
        assertEquals(peer.id, WireCodec.peer(encoded).id)
        assertThrows(IllegalArgumentException::class.java) { WireCodec.peer(JSONObject(encoded.toString()).put("id", "A".repeat(43))) }
        assertThrows(IllegalArgumentException::class.java) { WireCodec.peer(JSONObject(encoded.toString()).put("role", "admin")) }
    }
    @Test fun trustSurvivesRepositoryRestartWithoutExpiry() {
        val root = Files.createTempDirectory("artemis-trust-unit").toFile()
        try { val (peer, _) = identity(); FileTrustRepository(root).trust(peer, 1234); val next = FileTrustRepository(root); assertEquals(1234L, next.get(peer.id)?.trustedAt); assertNull(next.get(peer.id)?.expiresAt); next.forget(peer.id); assertNull(FileTrustRepository(root).get(peer.id)) }
        finally { require(root.canonicalPath.startsWith(java.io.File(System.getProperty("java.io.tmpdir")).canonicalPath)); root.deleteRecursively() }
    }
    @Test fun exactSpkiTrustRejectsAnotherSelfSignedIdentity() {
        val cert = HeldCertificate.Builder().commonName("localhost").addSubjectAlternativeName("localhost").ecdsa256().build()
        val pin = MessageDigest.getInstance("SHA-256").digest(cert.certificate.publicKey.encoded)
        val tm = PinnedTrustManager(pin); tm.checkServerTrusted(arrayOf(cert.certificate), "EC")
        val other = HeldCertificate.Builder().commonName("localhost").addSubjectAlternativeName("localhost").ecdsa256().build()
        assertThrows(CertificateException::class.java) { tm.checkServerTrusted(arrayOf(other.certificate), "EC") }
    }
    @Test fun realTlsChecksPinAndDefaultHostname() {
        val cert = HeldCertificate.Builder().commonName("localhost").addSubjectAlternativeName("localhost").ecdsa256().build()
        val certificates = HandshakeCertificates.Builder().heldCertificate(cert).build()
        val server = MockWebServer(); server.useHttps(certificates.sslSocketFactory()); server.start()
        val keyBytes = cert.certificate.publicKey.encoded
        val pc = PeerIdentity(Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(keyBytes)), keyBytes, "PC")
        val client = pinnedClient(DiscoveredPc(pc, InetAddress.getLoopbackAddress(), server.port))
        try {
            server.enqueue(MockResponse.Builder().body("ok").build())
            client.newCall(Request.Builder().url(server.url("/")).build()).execute().use { assertEquals("ok", it.body.string()) }
            // Correct key with an IP hostname absent from SAN must still fail.
            val wrongHost = server.url("/").newBuilder().host("127.0.0.1").build()
            assertThrows(java.io.IOException::class.java) { client.newCall(Request.Builder().url(wrongHost).build()).execute().close() }
        } finally { client.connectionPool.evictAll(); client.dispatcher.executorService.shutdown(); server.close() }
    }
}
