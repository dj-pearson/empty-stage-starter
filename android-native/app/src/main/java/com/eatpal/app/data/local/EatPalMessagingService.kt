package com.eatpal.app.data.local

import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.eatpal.app.BuildConfig
import com.eatpal.app.R
import com.eatpal.app.data.remote.PushTokenService
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * FCM entry point. iOS counterpart is `NotificationService.handleDeviceToken`
 * + `application(_:didRegisterForRemoteNotificationsWithDeviceToken:)`. The
 * service stays inert until `app/google-services.json` is added and the
 * `google-services` Gradle plugin is applied to `:app` — FirebaseApp isn't
 * auto-initialized otherwise, so none of these callbacks fire.
 */
@AndroidEntryPoint
class EatPalMessagingService : FirebaseMessagingService() {

    @Inject
    lateinit var pushTokenService: PushTokenService

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        scope.launch {
            pushTokenService.register(token, BuildConfig.VERSION_NAME)
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        val title = message.notification?.title
            ?: message.data["title"]
            ?: return
        val body = message.notification?.body
            ?: message.data["body"]
            ?: ""

        val channel = message.data["channel"] ?: NotificationService.Channel.REMINDERS.id
        val id = (message.data["id"]?.toIntOrNull()) ?: (System.currentTimeMillis() % Int.MAX_VALUE).toInt()

        val notification = NotificationCompat.Builder(this, channel)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .build()

        runCatching { NotificationManagerCompat.from(this).notify(id, notification) }
    }
}
