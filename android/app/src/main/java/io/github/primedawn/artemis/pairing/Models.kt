package io.github.primedawn.artemis.pairing

import java.net.InetAddress
import org.json.JSONObject
import java.security.MessageDigest
import java.security.KeyFactory
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import java.security.interfaces.ECPublicKey
import java.security.AlgorithmParameters
import java.security.spec.ECGenParameterSpec
import java.security.spec.ECParameterSpec
import java.util.Base64

data class PeerIdentity(val id: String, val publicKeySpki: ByteArray, val label: String)
data class TrustRecord(val peer: PeerIdentity, val trustedAt: Long, val expiresAt: Long? = null)
data class DiscoveredPc(val peer: PeerIdentity, val address: InetAddress, val port: Int)
enum class ConnectionStatus { DISCOVERING, AVAILABLE, AWAITING_APPROVAL, CONNECTING, CONNECTED, RECONNECTING, BUSY, IDENTITY_CHANGED, ERROR, PAUSED }
data class ConnectionUiState(val status: ConnectionStatus = ConnectionStatus.DISCOVERING, val pcLabel: String? = null, val approvalRequestId: String? = null, val errorCode: String? = null, val pcIdentityHint: String? = null)
sealed interface ClientSignal {
    data class Description(val id: String, val sessionId: String, val epoch: String, val type: String, val sdp: String) : ClientSignal
    data class Candidate(val id: String, val sessionId: String, val epoch: String, val candidate: String?, val sdpMid: String?, val sdpMLineIndex: Int?) : ClientSignal
    data class Bye(val id: String, val sessionId: String, val epoch: String, val reason: String) : ClientSignal
}
sealed interface ServerEvent {
    data class Challenge(val pc: PeerIdentity, val challengeId: String, val connectionId: String, val nonce: String, val expiresAt: Long, val signature: String) : ServerEvent
    data class Approval(val pc: PeerIdentity, val requestId: String, val nonce: String) : ServerEvent
    data class Trusted(val pcId: String) : ServerEvent
    data class Session(val kind: String, val sessionId: String?, val epoch: String?) : ServerEvent
    data class Signal(val signal: ClientSignal) : ServerEvent
    data class Failure(val code: String, val requestId: String) : ServerEvent
    data class Activated(val manual: Boolean) : ServerEvent
    data object Revoked : ServerEvent
    data object Denied : ServerEvent
}
object WireCodec {
    fun exact(value: JSONObject, vararg fields: String) { require(value.length() == fields.size && fields.all { value.has(it) }) { "E_INPUT" } }
    fun text(value: JSONObject, field: String): String = (value.get(field) as? String) ?: throw IllegalArgumentException("E_INPUT")
    fun peer(value: JSONObject): PeerIdentity {
        exact(value, "id", "publicKeySpki", "label")
        val id = text(value, "id"); val bytes = decode(text(value, "publicKeySpki"), 256); val label = text(value, "label")
        require(label.isNotBlank() && label.codePointCount(0, label.length) <= 64 && label.none { it.code < 32 || it.code == 127 }) { "E_INPUT" }
        require(id == encode(MessageDigest.getInstance("SHA-256").digest(bytes))) { "E_INPUT" }
        val key = KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(bytes)) as ECPublicKey
        val expected = AlgorithmParameters.getInstance("EC").apply { init(ECGenParameterSpec("secp256r1")) }.getParameterSpec(ECParameterSpec::class.java)
        require(key.params.order == expected.order && key.params.curve == expected.curve && key.params.generator == expected.generator && key.params.cofactor == expected.cofactor && key.encoded.contentEquals(bytes)) { "E_INPUT" }
        return PeerIdentity(id, bytes, label)
    }
    fun peerJson(peer: PeerIdentity): JSONObject = JSONObject().put("id", peer.id).put("publicKeySpki", encode(peer.publicKeySpki)).put("label", peer.label)
    fun canonical(kind: String, pcId: String, deviceId: String, challengeId: String, nonce: String, connectionId: String, decision: String): ByteArray {
        val parts = listOf(kind, pcId, deviceId, challengeId, nonce, connectionId, decision)
        require(parts.all { it.isNotEmpty() && '\n' !in it && '\r' !in it }) { "E_INPUT" }
        return (listOf("artemis-v2") + parts).joinToString("\n").toByteArray(Charsets.UTF_8)
    }
    fun verify(peer: PeerIdentity, bytes: ByteArray, signature: String): Boolean = runCatching {
        Signature.getInstance("SHA256withECDSA").run { initVerify(KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(peer.publicKeySpki))); update(bytes); verify(decode(signature, 80)) }
    }.getOrDefault(false)
    fun encode(bytes: ByteArray): String = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    fun decode(value: String, max: Int): ByteArray {
        require(value.isNotEmpty() && value.length <= (max * 4 + 2) / 3 && value.matches(Regex("^[A-Za-z0-9_-]+$"))) { "E_INPUT" }
        val bytes = Base64.getUrlDecoder().decode(value)
        require(bytes.size <= max && encode(bytes) == value) { "E_INPUT" }; return bytes
    }
}
