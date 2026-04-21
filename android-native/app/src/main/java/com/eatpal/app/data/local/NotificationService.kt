package com.eatpal.app.data.local

import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.eatpal.app.R
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Local notifications — meal reminders and family activity. FCM push (iOS APNs
 * parity) is pending per prd.json US-213 because it requires the Firebase
 * google-services.json config which isn't committed to the repo yet.
 *
 * Channels match iOS `NotificationService` intent: reminders, family_activity,
 * tips.
 */
@Singleton
class NotificationService @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    enum class Channel(val id: String, val displayName: String, val importance: Int) {
        REMINDERS("reminders", "Meal reminders", NotificationManager.IMPORTANCE_DEFAULT),
        FAMILY_ACTIVITY("family_activity", "Family activity", NotificationManager.IMPORTANCE_LOW),
        TIPS("tips", "Tips & insights", NotificationManager.IMPORTANCE_LOW),
    }

    fun ensureChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        for (ch in Channel.entries) {
            if (manager.getNotificationChannel(ch.id) != null) continue
            val channel = NotificationChannel(ch.id, ch.displayName, ch.importance)
            manager.createNotificationChannel(channel)
        }
    }

    /**
     * Schedules a one-shot local reminder at [atEpochMillis] on the reminders
     * channel. Caller is responsible for runtime POST_NOTIFICATIONS permission
     * (API 33+).
     */
    @SuppressLint("MissingPermission")
    fun scheduleMealReminder(id: Int, atEpochMillis: Long, title: String, body: String) {
        ensureChannels()
        val alarm = context.getSystemService(AlarmManager::class.java) ?: return

        val intent = Intent(context, LocalNotificationReceiver::class.java).apply {
            action = LocalNotificationReceiver.ACTION_FIRE
            putExtra(LocalNotificationReceiver.EXTRA_ID, id)
            putExtra(LocalNotificationReceiver.EXTRA_TITLE, title)
            putExtra(LocalNotificationReceiver.EXTRA_BODY, body)
            putExtra(LocalNotificationReceiver.EXTRA_CHANNEL, Channel.REMINDERS.id)
        }
        val pending = PendingIntent.getBroadcast(
            context,
            id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarm.canScheduleExactAlarms()) {
            // User hasn't granted SCHEDULE_EXACT_ALARM — fall back to window.
            alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atEpochMillis, pending)
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarm.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atEpochMillis, pending)
        } else {
            alarm.setExact(AlarmManager.RTC_WAKEUP, atEpochMillis, pending)
        }
    }

    fun cancelMealReminder(id: Int) {
        val alarm = context.getSystemService(AlarmManager::class.java) ?: return
        val intent = Intent(context, LocalNotificationReceiver::class.java).apply {
            action = LocalNotificationReceiver.ACTION_FIRE
        }
        val pending = PendingIntent.getBroadcast(
            context,
            id,
            intent,
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
        ) ?: return
        alarm.cancel(pending)
    }
}

/**
 * Receives the AlarmManager wakeup and posts the actual notification. Kept as
 * a dumb bridge so we can unit-test NotificationService without a device.
 */
class LocalNotificationReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_FIRE) return
        val id = intent.getIntExtra(EXTRA_ID, 0)
        val title = intent.getStringExtra(EXTRA_TITLE) ?: return
        val body = intent.getStringExtra(EXTRA_BODY) ?: return
        val channelId = intent.getStringExtra(EXTRA_CHANNEL)
            ?: NotificationService.Channel.REMINDERS.id

        val notification: Notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .build()

        try {
            NotificationManagerCompat.from(context).notify(id, notification)
        } catch (_: SecurityException) {
            // POST_NOTIFICATIONS denied — silently drop. UI surfaces the
            // permission prompt before calling scheduleMealReminder().
        }
    }

    companion object {
        const val ACTION_FIRE = "com.eatpal.app.LOCAL_NOTIFICATION"
        const val EXTRA_ID = "id"
        const val EXTRA_TITLE = "title"
        const val EXTRA_BODY = "body"
        const val EXTRA_CHANNEL = "channel"
    }
}
