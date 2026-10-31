package io.github.primedawn.artemis.pairing
import java.security.cert.X509Certificate
import javax.net.ssl.X509TrustManager
import okhttp3.OkHttpClient
import java.security.MessageDigest
import java.security.cert.CertificateException
import javax.net.ssl.SSLContext
import java.net.Proxy
import java.util.concurrent.TimeUnit
class PinnedTrustManager(expectedSpkiSha256: ByteArray) : X509TrustManager {
    private val expected = expectedSpkiSha256.clone().also { require(it.size == 32) }
    override fun checkServerTrusted(chain: Array<out X509Certificate>, authType: String) {
        try {
            if (chain.size != 1) throw CertificateException("E_TLS_IDENTITY")
            val cert = chain[0]; cert.checkValidity(); cert.verify(cert.publicKey)
            if (!MessageDigest.isEqual(expected, MessageDigest.getInstance("SHA-256").digest(cert.publicKey.encoded))) throw CertificateException("E_TLS_IDENTITY")
        } catch (_: Exception) { throw CertificateException("E_TLS_IDENTITY") }
    }
    override fun checkClientTrusted(chain: Array<out X509Certificate>, authType: String) { throw java.security.cert.CertificateException("E_TLS_IDENTITY") }
    override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
}
fun pinnedClient(pc: DiscoveredPc): OkHttpClient {
    val trust = PinnedTrustManager(MessageDigest.getInstance("SHA-256").digest(pc.peer.publicKeySpki))
    val tls = SSLContext.getInstance("TLS").apply { init(null, arrayOf(trust), null) }
    return OkHttpClient.Builder().sslSocketFactory(tls.socketFactory, trust)
        .proxy(Proxy.NO_PROXY).followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false)
        // 修复: debugger/debug-001.html. Bound TLS/HTTP setup; OkHttp clears the
        // socket read timeout after WebSocket upgrade, so active sessions have no TTL.
        .connectTimeout(10, TimeUnit.SECONDS).writeTimeout(10, TimeUnit.SECONDS).readTimeout(5, TimeUnit.SECONDS)
        // Only closing is bounded; an established connection still has no TTL.
        .webSocketCloseTimeout(1, TimeUnit.SECONDS)
        .callTimeout(0, TimeUnit.SECONDS).pingInterval(30, TimeUnit.SECONDS).build()
}
