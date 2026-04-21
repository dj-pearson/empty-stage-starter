package com.eatpal.app

import android.app.Application
import com.eatpal.app.data.local.NotificationService
import com.eatpal.app.util.NetworkMonitor
import dagger.hilt.android.HiltAndroidApp
import io.sentry.android.core.SentryAndroid
import javax.inject.Inject

/**
 * Application entry point. Mirrors iOS `EatPalApp.init()`:
 *   - starts Sentry when a DSN is configured (skipped in debug, same as iOS)
 *   - starts the network monitor so the offline queue drains on reconnect
 */
@HiltAndroidApp
class EatPalApplication : Application() {

    @Inject
    lateinit var networkMonitor: NetworkMonitor

    @Inject
    lateinit var notificationService: NotificationService

    override fun onCreate() {
        super.onCreate()

        if (!BuildConfig.DEBUG && BuildConfig.SENTRY_DSN.isNotBlank()) {
            SentryAndroid.init(this) { options ->
                options.dsn = BuildConfig.SENTRY_DSN
                options.environment = "production"
                options.release = "${BuildConfig.APPLICATION_ID}@${BuildConfig.VERSION_NAME}+${BuildConfig.VERSION_CODE}"
                options.tracesSampleRate = 0.2
                options.profilesSampleRate = 0.1
                options.isEnableAutoSessionTracking = true
            }
        }

        networkMonitor.start()
        notificationService.ensureChannels()
    }
}
