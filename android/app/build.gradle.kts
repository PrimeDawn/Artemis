import java.security.MessageDigest
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "io.github.primedawn.artemis"
    compileSdk = 36
    buildToolsVersion = "36.0.0"

    defaultConfig {
        applicationId = "io.github.primedawn.artemis"
        minSdk = 29
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0-dev"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    buildFeatures { compose = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}

kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

val webrtcAudit by configurations.creating {
    isTransitive = false
    isCanBeConsumed = false
}

dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.activity.compose)
    implementation(libs.webrtc)
    webrtcAudit(libs.webrtc)
    androidTestImplementation(libs.test.runner)
    androidTestImplementation(libs.test.junit)
}

// writer/plan.html section 3.1: the Maven AAR hash applies even when using a mirror.
val verifyWebRtcArtifact by tasks.registering {
    inputs.files(webrtcAudit)
    doLast {
        val aar = webrtcAudit.singleFile
        val sha256 = MessageDigest.getInstance("SHA-256")
        aar.inputStream().use { stream ->
            val buffer = ByteArray(65536)
            while (true) {
                val count = stream.read(buffer)
                if (count < 0) break
                sha256.update(buffer, 0, count)
            }
        }
        val actual = sha256.digest().joinToString("") { "%02x".format(it) }
        check(actual == "0a1627b1a48c2bc17d9a40d62fc47bd45166f44a311e95917f147c402de379b0") {
            "WebRTC Maven AAR SHA256 mismatch: $actual"
        }
        logger.lifecycle("WebRTC Maven AAR SHA256 verified: $actual")
    }
}
tasks.named("preBuild") { dependsOn(verifyWebRtcArtifact) }
