package io.github.primedawn.artemis.camera

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureRequest
import android.os.Handler
import android.os.HandlerThread
import android.view.Surface
import androidx.core.content.ContextCompat

/**
 * Camera2 采集：把相机输出接到编码器的输入 Surface，对应 writer/plan.html §2。
 * 需要在调用前已获得相机权限（targetSdk 36 必须运行期申请）。
 */
class CameraCaptureService(private val context: Context) {

    private var thread: HandlerThread? = null
    private var handler: Handler? = null
    private var device: CameraDevice? = null
    private var session: CameraCaptureSession? = null

    var onError: ((String) -> Unit)? = null
    var onStarted: (() -> Unit)? = null

    fun hasPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

    fun start(targetSurface: Surface, width: Int = 1280, height: Int = 720) {
        if (!hasPermission()) {
            onError?.invoke("E_CAMERA_PERMISSION")
            return
        }

        val worker = HandlerThread("Artemis-camera").apply { start() }
        thread = worker
        val workerHandler = Handler(worker.looper)
        handler = workerHandler

        val manager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        val cameraId = manager.cameraIdList.firstOrNull() ?: run {
            onError?.invoke("E_CAMERA_MISSING")
            return
        }

        manager.openCamera(cameraId, object : CameraDevice.StateCallback() {
            override fun onOpened(camera: CameraDevice) {
                device = camera
                val request = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply {
                    addTarget(targetSurface)
                    set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO)
                }
                camera.createCaptureSession(
                    listOf(targetSurface),
                    object : CameraCaptureSession.StateCallback() {
                        override fun onConfigured(configured: CameraCaptureSession) {
                            session = configured
                            runCatching {
                                configured.setRepeatingRequest(request.build(), null, workerHandler)
                                onStarted?.invoke()
                            }.onFailure { onError?.invoke("E_CAMERA_SESSION") }
                        }

                        override fun onConfigureFailed(failed: CameraCaptureSession) {
                            onError?.invoke("E_CAMERA_SESSION")
                        }
                    },
                    workerHandler,
                )
            }

            override fun onDisconnected(camera: CameraDevice) {
                camera.close()
                device = null
            }

            override fun onError(camera: CameraDevice, error: Int) {
                camera.close()
                device = null
                onError?.invoke("E_CAMERA_$error")
            }
        }, workerHandler)
    }

    fun stop() {
        runCatching { session?.stopRepeating() }
        runCatching { session?.close() }
        session = null
        runCatching { device?.close() }
        device = null
        thread?.quitSafely()
        thread = null
        handler = null
    }
}
