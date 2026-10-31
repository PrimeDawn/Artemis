package io.github.primedawn.artemis.pairing

import okhttp3.tls.HeldCertificate
import okhttp3.tls.HandshakeCertificates
import okhttp3.Request
import org.junit.Test
import org.junit.Assert.*
import java.net.InetAddress
import java.security.MessageDigest
import java.util.Base64
import javax.net.ssl.SSLServerSocket
import javax.net.ssl.SSLSocket
import java.util.concurrent.atomic.AtomicInteger

/** Tester-owned real TLS integration; no MockWebServer response queue or mocked trust manager. */
class PairingTlsIntegrationTest {
    private class ActualTlsEndpoint(certificate:HeldCertificate):AutoCloseable {
        private val certificates=HandshakeCertificates.Builder().heldCertificate(certificate).build()
        val server=certificates.sslContext().serverSocketFactory.createServerSocket(0,10,InetAddress.getByName("127.0.0.1")) as SSLServerSocket
        val successfulHandshakes=AtomicInteger()
        private val worker=Thread {
            while(!server.isClosed)try {
                (server.accept() as SSLSocket).use { socket ->
                    socket.soTimeout=3000;socket.startHandshake();successfulHandshakes.incrementAndGet()
                    val input=socket.inputStream.bufferedReader();while(!input.readLine().isNullOrEmpty()){}
                    val body="actual-tls-handshake-${successfulHandshakes.get()}".toByteArray()
                    socket.outputStream.write("HTTP/1.1 200 OK\r\nContent-Length: ${body.size}\r\nConnection: close\r\n\r\n".toByteArray());socket.outputStream.write(body);socket.outputStream.flush()
                }
            }catch(_:Exception){ /* Expected when the real client refuses an invalid certificate. */ }
        }.apply{isDaemon=true;start()}
        override fun close(){server.close();worker.join(4000);check(!worker.isAlive)}
    }
    private fun peer(certificate:HeldCertificate):PeerIdentity {val spki=certificate.certificate.publicKey.encoded;return PeerIdentity(Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(spki)),spki,"Actual TLS endpoint")}
    private fun call(server:ActualTlsEndpoint,trusted:PeerIdentity):String {
        val client=pinnedClient(DiscoveredPc(trusted,InetAddress.getByName("127.0.0.1"),server.server.localPort))
        return try {client.newCall(Request.Builder().url("https://127.0.0.1:${server.server.localPort}/healthz").build()).execute().use {assertEquals(200,it.code);it.body.string()}}
        finally{client.connectionPool.evictAll();client.dispatcher.executorService.shutdown()}
    }
    @Test fun renewedLeafUsesTheRememberedPublicKeyAcrossActualTlsHandshakes() {
        val first=HeldCertificate.Builder().ecdsa256().addSubjectAlternativeName("127.0.0.1").build()
        val renewed=HeldCertificate.Builder().keyPair(first.keyPair).serialNumber(2).addSubjectAlternativeName("127.0.0.1").build()
        assertEquals(peer(first).id,peer(renewed).id);assertFalse(first.certificate.encoded.contentEquals(renewed.certificate.encoded))
        for(cert in listOf(first,renewed))ActualTlsEndpoint(cert).use {assertEquals("actual-tls-handshake-1",call(it,peer(first)));assertEquals(1,it.successfulHandshakes.get())}
    }
    @Test fun expiredLeafIsRejectedDuringActualTlsHandshake() {
        val now=System.currentTimeMillis();val expired=HeldCertificate.Builder().ecdsa256().addSubjectAlternativeName("127.0.0.1").validityInterval(now-172800000,now-86400000).build()
        ActualTlsEndpoint(expired).use {server->assertThrows(java.io.IOException::class.java){call(server,peer(expired))}}
    }
    @Test fun unrelatedPublicKeyIsRejectedDuringActualTlsHandshake() {
        val actual=HeldCertificate.Builder().ecdsa256().addSubjectAlternativeName("127.0.0.1").build();val stranger=HeldCertificate.Builder().ecdsa256().build()
        ActualTlsEndpoint(actual).use {server->assertThrows(java.io.IOException::class.java){call(server,peer(stranger))}}
    }
}
