package io.github.primedawn.artemis.pairing
import org.junit.Test
import org.junit.Assert.*
import java.nio.file.Files
import java.net.InetAddress
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.spec.ECGenParameterSpec

class ConnectionControllerTest {
    private class Scheduler : ConnectionScheduler {
        data class Pending(val delay: Long, val task: () -> Unit, var cancelled: Boolean = false)
        val tasks = mutableListOf<Pending>()
        override fun execute(action: () -> Unit) { action() }
        override fun schedule(delayMs: Long, action: () -> Unit): ScheduledAction { val item = Pending(delayMs, action); tasks += item; return ScheduledAction { item.cancelled = true } }
        fun advance() { val next = tasks.first { !it.cancelled }; next.cancelled = true; next.task() }
        override fun close() { tasks.forEach { it.cancelled = true } }
    }
    private class Discovery : DiscoveryClient {
        var starts = 0; lateinit var found: (DiscoveredPc) -> Unit
        override fun start(onFound: (DiscoveredPc) -> Unit, onLost: (String) -> Unit, onError: (String) -> Unit) { starts++; found = onFound }
        override fun close() {}
    }
    private class Network : DeviceClient {
        var opens = 0; var decisions = 0; var disconnects = 0; var enrollments = 0
        lateinit var event: (ServerEvent) -> Unit; lateinit var failure: (String) -> Unit
        override fun open(pc: DiscoveredPc, onEvent: (ServerEvent) -> Unit, onFailure: (String) -> Unit) { opens++; event = onEvent; failure = onFailure }
        override fun decide(requestId: String, allow: Boolean) { if (allow) decisions++ }
        override fun send(signal: ClientSignal) = Result.success(Unit)
        override fun disconnectPeer(pcId: String) { disconnects++ }
        override fun requestEnrollment(pcId: String) { enrollments++ }
        override fun closePeer(pcId: String) {}
        override fun close() {}
    }
    private fun pc(): DiscoveredPc { val key = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair().public.encoded; return DiscoveredPc(PeerIdentity(WireCodec.encode(MessageDigest.getInstance("SHA-256").digest(key)), key, "PC"), InetAddress.getByName("192.168.1.5"), 3443) }
    @Test fun discoveryFirstConsentAndRememberedConsentUseOneController() {
        val root = Files.createTempDirectory("artemis-controller").toFile(); val discovery = Discovery(); val network = Network(); val scheduler = Scheduler(); val repo = FileTrustRepository(root); val states = mutableListOf<ConnectionUiState>(); val c = ConnectionController(discovery, network, repo, states::add, { it() }, scheduler)
        try {
            c.start(); c.start(); assertEquals(1, discovery.starts); val pc = pc(); discovery.found(pc); assertEquals(1, network.opens)
            network.event(ServerEvent.Approval(pc.peer, "first", "nonce")); assertEquals(ConnectionStatus.AWAITING_APPROVAL, states.last().status)
            c.approve("first", true); assertNotNull(repo.get(pc.peer.id)); assertEquals(1, network.decisions)
            network.event(ServerEvent.Approval(pc.peer, "again", "nonce2")); assertEquals(2, network.decisions)
        } finally { c.dispose(); require(root.canonicalPath.startsWith(java.io.File(System.getProperty("java.io.tmpdir")).canonicalPath)); root.deleteRecursively() }
    }
    @Test fun retryIsUnboundedButManualDisconnectPersistsAndRejectsAutomaticResume() {
        assertEquals(listOf(1000L,2000L,4000L,5000L,5000L), (0..4).map { retryDelayMs(it,0) })
        assertEquals(5250L, retryDelayMs(100000,250))
        val root = Files.createTempDirectory("artemis-retry").toFile(); val d = Discovery(); val n = Network(); val scheduler = Scheduler(); val repo = FileTrustRepository(root); val pc = pc(); repo.trust(pc.peer,1); val c = ConnectionController(d,n,repo,{}, {it()},scheduler)
        try {
            c.start(); d.found(pc); n.failure("E_NETWORK"); assertTrue(scheduler.tasks.last().delay in 1000L..1250L); scheduler.advance(); assertEquals(2,n.opens)
            n.event(ServerEvent.Activated(true)); n.event(ServerEvent.Session("waiting","session",null)); c.disconnect(); assertTrue(FileTrustRepository(root).isSuppressed(pc.peer.id))
            n.event(ServerEvent.Activated(false)); assertTrue(n.disconnects>=2)
            n.event(ServerEvent.Activated(true)); assertFalse(repo.isSuppressed(pc.peer.id))
        } finally { c.dispose(); require(root.canonicalPath.startsWith(java.io.File(System.getProperty("java.io.tmpdir")).canonicalPath)); root.deleteRecursively() }
    }
    @Test fun aLateNetworkFailureAfterManualDisconnectDoesNotReturnToReconnectingUi() {
        val root = Files.createTempDirectory("artemis-stop").toFile(); val d=Discovery();val n=Network();val scheduler=Scheduler();val repo=FileTrustRepository(root);val pc=pc();repo.trust(pc.peer,1);val states=mutableListOf<ConnectionUiState>();val c=ConnectionController(d,n,repo,states::add,{it()},scheduler)
        try { c.start();d.found(pc);n.event(ServerEvent.Activated(true));n.event(ServerEvent.Session("waiting","session",null));c.disconnect();n.failure("E_NETWORK");assertEquals(ConnectionStatus.AVAILABLE,states.last().status);assertFalse(scheduler.tasks.any{!it.cancelled}) }
        finally { c.dispose();require(root.canonicalPath.startsWith(java.io.File(requireNotNull(System.getProperty("java.io.tmpdir"))).canonicalPath));root.deleteRecursively() }
    }
}
