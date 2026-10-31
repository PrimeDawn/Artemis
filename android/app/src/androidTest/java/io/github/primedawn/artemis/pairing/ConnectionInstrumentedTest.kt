package io.github.primedawn.artemis.pairing
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import android.content.Intent
import android.view.accessibility.AccessibilityNodeInfo
import io.github.primedawn.artemis.MainActivity

@RunWith(AndroidJUnit4::class)
class ConnectionInstrumentedTest {
    @Test fun connectionScreenReplacesTheStaticToolchainPage() {
        val instrument = InstrumentationRegistry.getInstrumentation(); val context = instrument.targetContext
        context.startActivity(Intent(context,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));instrument.waitForIdleSync()
        fun find(node:AccessibilityNodeInfo?):Boolean {
            if(node==null)return false
            if(node.packageName?.toString()==context.packageName&&node.text?.toString()=="设备连接")return true
            for(i in 0 until node.childCount)if(find(node.getChild(i)))return true
            return false
        }
        val until=android.os.SystemClock.elapsedRealtime()+8000
        var found=false
        while(android.os.SystemClock.elapsedRealtime()<until){if(find(instrument.uiAutomation.rootInActiveWindow)){found=true;break};Thread.sleep(150)}
        assertTrue("new connection screen must be visible",found)
        val permissions=context.packageManager.getPackageInfo(context.packageName,android.content.pm.PackageManager.GET_PERMISSIONS).requestedPermissions.orEmpty()
        assertFalse(permissions.contains(android.Manifest.permission.CAMERA));assertFalse(permissions.contains(android.Manifest.permission.RECORD_AUDIO))
    }
    @Test fun androidKeystoreIdentityPersistsAndSignsWithoutEveryUseConfirmation() {
        val first=KeystoreDeviceIdentity("Emulator fixture");val second=KeystoreDeviceIdentity("Emulator fixture")
        assertEquals(first.peer().id,second.peer().id)
        val bytes="independent Android provider message".toByteArray()
        assertTrue(WireCodec.verify(first.peer(),bytes,WireCodec.encode(second.sign(bytes))))
    }
    @Test fun privateTrustStoragePersistsWithoutExpiryOnAndroid() {
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val root=java.io.File(context.cacheDir,"trust-component-${java.util.UUID.randomUUID()}")
        try { val peer=KeystoreDeviceIdentity("Emulator fixture").peer();FileTrustRepository(root).trust(peer,1234);FileTrustRepository(root).setSuppressed(peer.id,true);val next=FileTrustRepository(root);assertEquals(1234L,next.get(peer.id)?.trustedAt);assertNull(next.get(peer.id)?.expiresAt);assertTrue(next.isSuppressed(peer.id));next.forget(peer.id);assertNull(FileTrustRepository(root).get(peer.id)) }
        finally { require(root.canonicalPath.startsWith(context.cacheDir.canonicalPath+java.io.File.separator));root.deleteRecursively() }
    }
}
