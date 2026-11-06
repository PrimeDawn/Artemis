package io.github.primedawn.artemis.pairing
import java.security.KeyStore
import java.security.KeyPairGenerator
import java.security.PrivateKey
import java.security.Signature
import java.security.MessageDigest
import java.security.spec.ECGenParameterSpec
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
interface DeviceIdentity { fun peer(): PeerIdentity; fun sign(message: ByteArray): ByteArray }
class KeystoreDeviceIdentity(label: String, store: KeyStore? = null, password: CharArray? = null) : DeviceIdentity {
    private val alias = "artemis-device-identity-v2"
    private val keyStore = store ?: KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    private val key: PrivateKey
    private val identity: PeerIdentity
    init {
        if (!keyStore.containsAlias(alias)) {
            check(store == null)
            KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore").apply {
                initialize(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY)
                    .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1")).setDigests(KeyProperties.DIGEST_SHA256)
                    .setUserAuthenticationRequired(false).build())
            }.generateKeyPair()
        }
        key = keyStore.getKey(alias, password) as PrivateKey
        val bytes = keyStore.getCertificate(alias).publicKey.encoded
        identity = WireCodec.peer(WireCodec.peerJson(PeerIdentity(WireCodec.encode(MessageDigest.getInstance("SHA-256").digest(bytes)), bytes, label)))
    }
    override fun peer(): PeerIdentity = identity.copy(publicKeySpki = identity.publicKeySpki.clone())
    @Synchronized override fun sign(message: ByteArray): ByteArray = Signature.getInstance("SHA256withECDSA").run { initSign(key); update(message); sign() }
}
