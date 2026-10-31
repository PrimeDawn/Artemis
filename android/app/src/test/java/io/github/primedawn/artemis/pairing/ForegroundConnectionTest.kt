package io.github.primedawn.artemis.pairing

import org.junit.Test
import org.junit.Assert.*
import java.net.InetAddress
import java.net.ServerSocket
import java.net.SocketTimeoutException
import java.nio.file.Files
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.Signature
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Only the OS discovery boundary is driven by the test. TCP, TLS, identity,
 * controller scheduling and trust storage are real. No mocked DeviceClient. */
class ForegroundConnectionTest {
    private class Discovery : DiscoveryClient {
        lateinit var found: (DiscoveredPc) -> Unit
        override fun start(onFound: (DiscoveredPc) -> Unit, onLost: (String) -> Unit, onError: (String) -> Unit) { found = onFound }
        override fun close() {}
    }
    private fun scenario(states: MutableList<ConnectionUiState> = java.util.Collections.synchronizedList(mutableListOf()), action: (ConnectionController, Discovery, DiscoveredPc, ServerSocket, () -> Unit) -> Unit) {
        val root = Files.createTempDirectory("foreground-connection-").toFile()
        val server = ServerSocket(0, 8, InetAddress.getLoopbackAddress()).apply { soTimeout = 350 }
        val key = KeyPairGenerator.getInstance("EC").apply { initialize(java.security.spec.ECGenParameterSpec("secp256r1")) }.generateKeyPair()
        val peer = PeerIdentity(WireCodec.encode(MessageDigest.getInstance("SHA-256").digest(key.public.encoded)), key.public.encoded, "Actual loopback endpoint")
        val identity = object : DeviceIdentity {
            override fun peer() = peer
            override fun sign(message: ByteArray) = Signature.getInstance("SHA256withECDSA").run { initSign(key.private); update(message); sign() }
        }
        val discovery = Discovery()
        val scheduler = SerialConnectionScheduler()
        val runtime = ConnectionController(discovery, OkHttpDeviceClient(identity), FileTrustRepository(root), states::add, { it() }, scheduler)
        val barrier = { val latch = CountDownLatch(1); scheduler.execute { latch.countDown() }; assertTrue("Actual serial work completes", latch.await(2, TimeUnit.SECONDS)); Unit }
        try { action(runtime, discovery, DiscoveredPc(peer, InetAddress.getLoopbackAddress(), server.localPort), server, barrier) }
        finally { runtime.dispose(); server.close(); require(root.canonicalPath.startsWith(java.io.File(System.getProperty("java.io.tmpdir")).canonicalPath + java.io.File.separator)); root.deleteRecursively() }
    }
    @Test fun backgroundDiscoveryAndNetworkCallbacksCannotOpenTcp() = scenario { runtime, discovery, pc, server, barrier ->
        runtime.setForeground(false); runtime.start(); barrier()
        discovery.found(pc); runtime.onNetworkAvailable(); barrier()
        assertThrows(SocketTimeoutException::class.java) { server.accept().close() }
    }
    @Test fun foregroundReturnReopensRealTransportButBackgroundDoesNotRetry() = scenario { runtime, discovery, pc, server, barrier ->
        runtime.start(); barrier(); discovery.found(pc); barrier()
        server.soTimeout = 3000
        server.accept().use { first ->
            runtime.setForeground(false); barrier(); first.close()
            runtime.onNetworkAvailable(); discovery.found(pc); barrier()
            server.soTimeout = 350
            assertThrows(SocketTimeoutException::class.java) { server.accept().close() }
            runtime.setForeground(true); barrier(); server.soTimeout = 3000
            server.accept().use { assertTrue("Actual TCP reconnect after foreground", it.isConnected) }
        }
    }
    @Test fun stalledTlsHandshakeRetriesWithoutThePeerClosingItsTcpSocket() {
        val states = java.util.Collections.synchronizedList(mutableListOf<ConnectionUiState>())
        scenario(states) { runtime, discovery, pc, server, barrier ->
            runtime.start(); barrier(); discovery.found(pc); barrier()
            server.soTimeout = 7500
            server.accept().use { held ->
                held.soTimeout = 2000
                assertEquals("Actual TLS ClientHello record", 22, held.getInputStream().read())
                assertEquals(ConnectionStatus.CONNECTING, states.last().status)
                // Do not close or respond on the first TCP: only the production
                // setup timeout can release opening and trigger a real retry.
                server.accept().use { next ->
                    assertTrue("Actual second TCP while first remains held", next.isConnected)
                    assertTrue(states.any { it.status == ConnectionStatus.RECONNECTING })
                }
            }
        }
    }
}
