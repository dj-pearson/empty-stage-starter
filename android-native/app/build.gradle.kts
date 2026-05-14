import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

// Loads SUPABASE_URL / SUPABASE_ANON_KEY / SENTRY_DSN from a local env file so
// real keys never land in git. Mirrors the iOS Info.plist substitution pattern.
val envProps: Properties = Properties().apply {
    val f = rootProject.file("../env.local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun env(key: String, fallback: String = ""): String =
    System.getenv(key) ?: envProps.getProperty(key) ?: fallback

// Release signing config — read from `../keystore.properties` (gitignored)
// for local Android Studio builds, with env-var fallback for CI. The file
// MUST live alongside env.local.properties at the repo root so the same
// `keytool`-generated .jks can be referenced from anywhere in the tree.
//
// Required keys (see RELEASE_GUIDE.md):
//   storeFile=path/to/eatpal-release.jks
//   storePassword=...
//   keyAlias=...
//   keyPassword=...
//
// CI equivalents (in .github/workflows/android-release.yml):
//   ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD,
//   ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
val keystoreProps: Properties = Properties().apply {
    val f = rootProject.file("../keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
val ciKeystorePath: String? = System.getenv("ANDROID_KEYSTORE_PATH")
val haveReleaseSigning =
    (keystoreProps.getProperty("storeFile") != null && keystoreProps.getProperty("keyAlias") != null) ||
    (ciKeystorePath != null && System.getenv("ANDROID_KEY_ALIAS") != null)

android {
    namespace = "com.eatpal.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.eatpal.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables { useSupportLibrary = true }

        // Parity with iOS SupabaseManager.client / SentryService.configure().
        // Never hardcode real keys — provide via env.local.properties or env vars.
        buildConfigField(
            "String",
            "SUPABASE_URL",
            "\"${env("SUPABASE_URL", "https://api.tryeatpal.com")}\""
        )
        buildConfigField(
            "String",
            "SUPABASE_ANON_KEY",
            "\"${env("SUPABASE_ANON_KEY", "REPLACE_WITH_YOUR_ANON_KEY")}\""
        )
        buildConfigField(
            "String",
            "SENTRY_DSN",
            "\"${env("SENTRY_DSN")}\""
        )
        // Google Cloud OAuth 2.0 Web client id — paste into Supabase Auth's
        // Google provider config so Supabase accepts IDToken exchanges. iOS
        // uses the Apple Services Id in the same role.
        buildConfigField(
            "String",
            "GOOGLE_WEB_CLIENT_ID",
            "\"${env("GOOGLE_WEB_CLIENT_ID")}\""
        )
    }

    signingConfigs {
        // Created on demand so a developer who hasn't set up signing can
        // still build the debug variant. Release builds fail loudly via
        // `haveReleaseSigning` below if the keystore is missing.
        if (haveReleaseSigning) {
            create("release") {
                storeFile = file(
                    System.getenv("ANDROID_KEYSTORE_PATH")
                        ?: keystoreProps.getProperty("storeFile")
                )
                storePassword =
                    System.getenv("ANDROID_KEYSTORE_PASSWORD")
                        ?: keystoreProps.getProperty("storePassword")
                keyAlias =
                    System.getenv("ANDROID_KEY_ALIAS")
                        ?: keystoreProps.getProperty("keyAlias")
                keyPassword =
                    System.getenv("ANDROID_KEY_PASSWORD")
                        ?: keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
            applicationIdSuffix = ".debug"
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // Only attach the signing config when it's actually configured;
            // unsigned release builds still compile (useful for local sanity
            // checks before generating the keystore for the first time).
            if (haveReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    // AndroidX + Compose
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.navigation.compose)
    debugImplementation(libs.androidx.compose.ui.tooling)

    // Hilt
    implementation(libs.hilt.android)
    implementation(libs.hilt.navigation.compose)
    ksp(libs.hilt.compiler)

    // Coroutines + serialization
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)

    // Supabase — BOM aligns transitive modules
    implementation(platform(libs.supabase.bom))
    implementation(libs.supabase.postgrest)
    implementation(libs.supabase.auth)
    implementation(libs.supabase.realtime)
    implementation(libs.supabase.storage)
    implementation(libs.supabase.functions)
    implementation(libs.ktor.client.okhttp)

    // Room
    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)

    // DataStore
    implementation(libs.datastore.preferences)

    // Coil (images)
    implementation(libs.coil.compose)

    // Sentry
    implementation(libs.sentry.android)

    // Permissions
    implementation(libs.accompanist.permissions)

    // Credential Manager (Google Sign-In)
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services.auth)
    implementation(libs.googleid)

    // Health Connect (HealthKit parity)
    implementation(libs.health.connect.client)

    // Glance (home-screen widget)
    implementation(libs.glance.appwidget)
    implementation(libs.glance.material3)

    // CameraX + ML Kit barcode (US-208)
    implementation(libs.androidx.camera.core)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.view)
    implementation(libs.mlkit.barcode.scanning)
    implementation(libs.mlkit.text.recognition)

    // CameraX ProcessCameraProvider exposes ListenableFuture from Guava as
    // its setup API; Guava isn't on the compile classpath unless we add it.
    implementation("com.google.guava:guava:33.3.1-android")

    // Play Billing (US-214)
    implementation(libs.billing.ktx)

    // Firebase Cloud Messaging (US-213). The `google-services` Gradle plugin
    // and `app/google-services.json` still need to be added before this
    // actually registers — without them FirebaseApp stays uninitialized and
    // EatPalMessagingService.onNewToken never fires. Code ships so the day
    // the config lands we don't have a chicken-and-egg problem.
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)

    // Testing
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.mockk)
    testImplementation(libs.turbine)
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
}
