package io.github.primedawn.artemis.pairing
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
interface DiscoveryClient { fun start(onFound: (DiscoveredPc) -> Unit, onLost: (String) -> Unit, onError: (String) -> Unit); fun close() }
fun interface ScheduledAction { fun cancel() }
interface ConnectionScheduler { fun execute(action: () -> Unit); fun schedule(delayMs: Long, action: () -> Unit): ScheduledAction; fun close() }
class SerialConnectionScheduler : ConnectionScheduler {
    private val executor = Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "Artemis-connection").apply { isDaemon = true } }
    override fun execute(action: () -> Unit) { executor.execute(action) }
    override fun schedule(delayMs: Long, action: () -> Unit): ScheduledAction { val future = executor.schedule(action, delayMs, TimeUnit.MILLISECONDS); return ScheduledAction { future.cancel(false) } }
    override fun close() { executor.shutdown() }
}
fun retryDelayMs(attempt: Int, jitterMs: Int = 0): Long {
    require(attempt >= 0 && jitterMs in 0..250)
    return when (attempt) { 0 -> 1000L; 1 -> 2000L; 2 -> 4000L; else -> 5000L } + jitterMs
}
class ConnectionController(private val discovery: DiscoveryClient, private val client: DeviceClient, private val repository: TrustRepository, private val publish: (ConnectionUiState) -> Unit, private val dispatchToMain: (() -> Unit) -> Unit, private val scheduler: ConnectionScheduler = SerialConnectionScheduler()) {
    @Volatile private var disposed = false
    private var started = false
    private var foreground = true
    private val candidates = linkedMapOf<String, DiscoveredPc>()
    private val opening = mutableSetOf<String>()
    private val attempts = mutableMapOf<String, Int>()
    private val generations = mutableMapOf<String, Int>()
    private val retries = mutableMapOf<String, ScheduledAction>()
    private val activated = mutableSetOf<String>()
    private val renewingConsent = mutableSetOf<String>()
    private var activePc: String? = null
    private var availablePc: String? = null
    private var pending: Pair<DiscoveredPc, ServerEvent.Approval>? = null
    private fun queue(action: () -> Unit) {
        if (disposed) return
        try { scheduler.execute { if (!disposed) try { action() } catch (_: StorageException) { state(ConnectionUiState(ConnectionStatus.ERROR, errorCode = "E_STORAGE")) } catch (_: IllegalArgumentException) { state(ConnectionUiState(ConnectionStatus.ERROR, errorCode = "E_INPUT")) } } }
        catch (_: java.util.concurrent.RejectedExecutionException) { if (!disposed) throw IllegalStateException("E_CONTROLLER") }
    }
    private fun state(value: ConnectionUiState) { dispatchToMain { if (!disposed) publish(value) } }
    fun setForeground(value: Boolean) = queue {
        if (foreground == value) return@queue
        foreground = value
        if (!value) {
            for (id in candidates.keys) generations[id] = (generations[id] ?: 0) + 1
            retries.values.forEach { it.cancel() }; retries.clear(); opening.clear()
            activated.clear(); renewingConsent.clear(); pending = null
            client.close()
            state(ConnectionUiState(ConnectionStatus.PAUSED, activePc?.let { candidates[it]?.peer?.label }))
        } else {
            state(ConnectionUiState(if (activePc == null) ConnectionStatus.DISCOVERING else ConnectionStatus.RECONNECTING))
            for (pc in candidates.values) connect(pc)
        }
    }
    fun start() = queue {
        if (!started) {
            started = true
            state(ConnectionUiState(if (foreground) ConnectionStatus.DISCOVERING else ConnectionStatus.PAUSED))
            discovery.start({ pc -> queue {
                if (!foreground) return@queue
                val known = repository.get(pc.peer.id)
                if (known != null && !known.peer.publicKeySpki.contentEquals(pc.peer.publicKeySpki)) { state(ConnectionUiState(ConnectionStatus.IDENTITY_CHANGED, pc.peer.label, errorCode = "E_IDENTITY_CHANGED")); return@queue }
                if (!candidates.containsKey(pc.peer.id) && candidates.size >= 8) return@queue
                candidates[pc.peer.id] = pc
                if (pc.peer.id !in opening && !retries.containsKey(pc.peer.id)) connect(pc)
            } }, { _ -> /* mDNS loss alone must not close a healthy TLS connection. */ }, { code -> queue { if (foreground && activePc == null) state(ConnectionUiState(ConnectionStatus.ERROR, errorCode = code)) } })
        }
    }
    private fun connect(pc: DiscoveredPc) {
        if (!foreground) return
        retries.remove(pc.peer.id)?.cancel()
        opening.add(pc.peer.id)
        val generation = (generations[pc.peer.id] ?: 0) + 1; generations[pc.peer.id] = generation
        client.closePeer(pc.peer.id)
        // 修复: debugger/debug-001.html. A resolved endpoint is transport setup,
        // not discovery; preserve a pending approval or another active PC's UI.
        if (pending == null && (activePc == null || activePc == pc.peer.id) && !repository.isSuppressed(pc.peer.id)) {
            state(ConnectionUiState(if (activePc == pc.peer.id || (attempts[pc.peer.id] ?: 0) > 0) ConnectionStatus.RECONNECTING else ConnectionStatus.CONNECTING, pc.peer.label))
        }
        client.open(pc, { event -> queue { if (foreground && generations[pc.peer.id] == generation) event(pc, event) } }, { code -> queue { if (foreground && generations[pc.peer.id] == generation) failed(pc, code) } })
    }
    private fun failed(pc: DiscoveredPc, code: String) {
        if (!foreground) return
        opening.remove(pc.peer.id); activated.remove(pc.peer.id)
        if (pending?.first?.peer?.id == pc.peer.id) pending = null
        if(repository.isSuppressed(pc.peer.id)) { if(activePc==null||activePc==pc.peer.id) state(ConnectionUiState(ConnectionStatus.AVAILABLE,pc.peer.label));return }
        if (activePc == null || activePc == pc.peer.id) state(ConnectionUiState(if (code == "E_IDENTITY_CHANGED") ConnectionStatus.IDENTITY_CHANGED else ConnectionStatus.RECONNECTING, pc.peer.label, errorCode = code))
        if (code == "E_IDENTITY_CHANGED") return
        val attempt = attempts[pc.peer.id] ?: 0; attempts[pc.peer.id] = (attempt + 1).coerceAtMost(100000)
        retries.remove(pc.peer.id)?.cancel()
        retries[pc.peer.id] = scheduler.schedule(retryDelayMs(attempt, kotlin.random.Random.nextInt(251))) { queue { candidates[pc.peer.id]?.let(::connect) } }
    }
    private fun event(pc: DiscoveredPc, value: ServerEvent) {
        when (value) {
            is ServerEvent.Challenge -> { attempts[pc.peer.id] = 0; if (activePc == null) { availablePc=pc.peer.id;state(ConnectionUiState(ConnectionStatus.AVAILABLE, pc.peer.label)) } }
            is ServerEvent.Approval -> {
                renewingConsent.remove(pc.peer.id)
                if (activePc != null && activePc != pc.peer.id || pending != null && pending?.first?.peer?.id != pc.peer.id) { client.decide(value.requestId, false); return }
                if (repository.get(pc.peer.id) != null && !repository.isSuppressed(pc.peer.id)) client.decide(value.requestId, true)
                else { pending = pc to value; state(ConnectionUiState(ConnectionStatus.AWAITING_APPROVAL, pc.peer.label, value.requestId, pcIdentityHint=pc.peer.id.take(12))) }
            }
            is ServerEvent.Activated -> {
                if (activePc != null && activePc != pc.peer.id) { client.disconnectPeer(pc.peer.id); return }
                if (repository.get(pc.peer.id) == null) {
                    if (value.manual) { renewingConsent.add(pc.peer.id); client.requestEnrollment(pc.peer.id) } else client.disconnectPeer(pc.peer.id)
                    return
                }
                if (!value.manual && repository.isSuppressed(pc.peer.id)) { client.disconnectPeer(pc.peer.id); return }
                if (value.manual) repository.setSuppressed(pc.peer.id, false)
                activated.add(pc.peer.id); activePc = pc.peer.id
            }
            is ServerEvent.Session -> {
                if (value.sessionId != null) {
                    if (pc.peer.id in renewingConsent) return
                    if (pc.peer.id !in activated || repository.get(pc.peer.id) == null || repository.isSuppressed(pc.peer.id)) { client.disconnectPeer(pc.peer.id); return }
                    activePc = pc.peer.id; attempts[pc.peer.id] = 0; state(ConnectionUiState(ConnectionStatus.CONNECTED, pc.peer.label, pcId = pc.peer.id, sessionId = value.sessionId, host = pc.address.hostAddress, port = pc.port, spki = pc.peer.publicKeySpki))
                } else if (activePc == null || activePc == pc.peer.id) { if (activePc == pc.peer.id) activePc = null; activated.remove(pc.peer.id); state(ConnectionUiState(ConnectionStatus.AVAILABLE, pc.peer.label)) }
            }
            is ServerEvent.Trusted -> { pending = null; renewingConsent.remove(pc.peer.id) }
            is ServerEvent.Revoked -> { repository.forget(pc.peer.id); activated.remove(pc.peer.id); if (activePc == pc.peer.id) activePc = null; state(ConnectionUiState(ConnectionStatus.AVAILABLE, pc.peer.label, errorCode = "E_NOT_TRUSTED")) }
            is ServerEvent.Denied -> { pending = null; state(ConnectionUiState(ConnectionStatus.AVAILABLE, pc.peer.label)) }
            is ServerEvent.Failure -> { if (activePc == null || activePc == pc.peer.id) state(ConnectionUiState(ConnectionStatus.ERROR, pc.peer.label, errorCode = value.code)) }
            is ServerEvent.Signal -> Unit // Media consumers will be attached by the next Spec.
        }
    }
    fun approve(requestId: String, allow: Boolean) = queue {
        val request = pending ?: return@queue
        if (request.second.requestId != requestId) return@queue
        if (allow) { repository.trust(request.first.peer, System.currentTimeMillis()); repository.setSuppressed(request.first.peer.id, false) }
        client.decide(requestId, allow); pending = null
        state(ConnectionUiState(if (allow) ConnectionStatus.CONNECTING else ConnectionStatus.AVAILABLE, request.first.peer.label))
    }
    fun disconnect() = queue {
        pending?.let { client.decide(it.second.requestId, false) }; pending = null
        activePc?.let { id -> repository.setSuppressed(id, true); retries.remove(id)?.cancel(); activated.remove(id); client.disconnectPeer(id) }
        activePc = null; state(ConnectionUiState(ConnectionStatus.AVAILABLE))
    }
    fun forget(pcId: String) = queue {
        repository.forget(pcId); retries.remove(pcId)?.cancel(); activated.remove(pcId); renewingConsent.remove(pcId)
        client.disconnectPeer(pcId); if (activePc == pcId) activePc = null
        if (pending?.first?.peer?.id == pcId) pending = null
        state(ConnectionUiState(ConnectionStatus.AVAILABLE))
    }
    fun forgetCurrent() = queue { (activePc ?: pending?.first?.peer?.id ?: availablePc)?.let { forget(it) } }
    fun onNetworkAvailable() = queue { if (foreground) for (pc in candidates.values) if (pc.peer.id !in opening) connect(pc) }
    fun dispose() {
        if (disposed) return; disposed = true
        scheduler.execute { retries.values.forEach { it.cancel() }; retries.clear(); discovery.close(); client.close(); candidates.clear(); scheduler.close() }
    }
}
