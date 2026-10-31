package io.github.primedawn.artemis.pairing
import java.io.File
import java.io.FileOutputStream
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject
interface TrustRepository {
    fun get(pcId: String): TrustRecord?; fun trust(peer: PeerIdentity, nowMs: Long); fun forget(pcId: String)
    fun isSuppressed(pcId: String): Boolean
    fun setSuppressed(pcId: String, suppressed: Boolean)
}
class StorageException : Exception("E_STORAGE")
class FileTrustRepository(private val root: File) : TrustRepository {
    private val file = File(root, "trusted-pcs.json")
    private val intentFile = File(root, "connection-intent.json")
    private var peers = linkedMapOf<String, TrustRecord>()
    private var suppressedIds = mutableSetOf<String>()
    init {
        try {
            check(root.isDirectory || root.mkdirs())
            if (file.exists()) {
                require(file.length() <= 65536)
                val data = JSONObject(file.readText()); WireCodec.exact(data, "schemaVersion", "peers"); require(data.getInt("schemaVersion") == 2)
                val list = data.getJSONArray("peers"); require(list.length() <= 32)
                for (i in 0 until list.length()) { val r = list.getJSONObject(i); WireCodec.exact(r, "peer", "trustedAt", "expiresAt"); require(r.isNull("expiresAt")); val peer = WireCodec.peer(r.getJSONObject("peer")); val at = r.getLong("trustedAt"); require(at >= 0 && !peers.containsKey(peer.id)); peers[peer.id] = TrustRecord(peer, at) }
            }
            if (intentFile.exists()) {
                require(intentFile.length() <= 65536)
                val data = JSONObject(intentFile.readText()); WireCodec.exact(data, "schemaVersion", "suppressedPcIds"); require(data.getInt("schemaVersion") == 2)
                val list = data.getJSONArray("suppressedPcIds"); require(list.length() <= 32)
                for (i in 0 until list.length()) { val id = list.getString(i); require(id.matches(Regex("^[A-Za-z0-9_-]{43}$"))); suppressedIds.add(id) }
            }
        } catch (_: Exception) { throw StorageException() }
    }
    @Synchronized override fun get(pcId: String): TrustRecord? = peers[pcId]?.let { it.copy(peer = it.peer.copy(publicKeySpki = it.peer.publicKeySpki.clone())) }
    @Synchronized override fun trust(peer: PeerIdentity, nowMs: Long) {
        require(nowMs >= 0); val validated = WireCodec.peer(WireCodec.peerJson(peer)); val old = peers[peer.id]
        require(old == null || old.peer.publicKeySpki.contentEquals(peer.publicKeySpki)); require(old != null || peers.size < 32)
        val next = LinkedHashMap(peers); next[peer.id] = TrustRecord(validated, old?.trustedAt ?: nowMs); commitPeers(next); peers = next
    }
    @Synchronized override fun forget(pcId: String) { setSuppressed(pcId, true); val next = LinkedHashMap(peers); next.remove(pcId); commitPeers(next); peers = next }
    @Synchronized override fun isSuppressed(pcId: String): Boolean = pcId in suppressedIds
    @Synchronized override fun setSuppressed(pcId: String, suppressed: Boolean) {
        require(pcId.matches(Regex("^[A-Za-z0-9_-]{43}$")))
        val next = suppressedIds.toMutableSet(); if (suppressed) next.add(pcId) else next.remove(pcId); require(next.size <= 32)
        atomic(intentFile, JSONObject().put("schemaVersion", 2).put("suppressedPcIds", JSONArray(next.toList()))); suppressedIds = next
    }
    private fun commitPeers(next: Map<String, TrustRecord>) {
        val list = JSONArray(); next.values.forEach { list.put(JSONObject().put("peer", WireCodec.peerJson(it.peer)).put("trustedAt", it.trustedAt).put("expiresAt", JSONObject.NULL)) }
        atomic(file, JSONObject().put("schemaVersion", 2).put("peers", list))
    }
    private fun atomic(target: File, value: JSONObject) {
        val temporary = File(root, ".write-${UUID.randomUUID()}")
        try {
            check(temporary.createNewFile())
            FileOutputStream(temporary).use { it.write(value.toString().toByteArray(Charsets.UTF_8)); it.fd.sync() }
            Files.move(temporary.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
        } catch (_: Exception) { throw StorageException() } finally { temporary.delete() }
    }
}
