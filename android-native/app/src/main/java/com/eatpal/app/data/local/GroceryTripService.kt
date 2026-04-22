package com.eatpal.app.data.local

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.eatpal.app.MainActivity
import com.eatpal.app.R

/**
 * Foreground service equivalent of iOS `GroceryTripActivityService` Live
 * Activity. Shows an ongoing progress notification ("X of Y checked — last:
 * <name>") while the user is shopping. Callers interact via static methods
 * that fire intents at this service — no Binder needed.
 */
class GroceryTripService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: return START_NOT_STICKY
        when (action) {
            ACTION_START,
            ACTION_UPDATE -> {
                val total = intent.getIntExtra(EXTRA_TOTAL, 0)
                val checked = intent.getIntExtra(EXTRA_CHECKED, 0)
                val last = intent.getStringExtra(EXTRA_LAST_NAME).orEmpty()
                val notification = buildNotification(total, checked, last)
                if (action == ACTION_START) {
                    ServiceCompat.startForeground(
                        this,
                        NOTIFICATION_ID,
                        notification,
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                            android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                        } else 0,
                    )
                } else {
                    androidx.core.app.NotificationManagerCompat.from(this)
                        .notify(NOTIFICATION_ID, notification)
                }
            }
            ACTION_STOP -> {
                ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        return START_STICKY
    }

    private fun buildNotification(total: Int, checked: Int, last: String): Notification {
        val tap = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val stop = PendingIntent.getService(
            this,
            1,
            Intent(this, GroceryTripService::class.java).apply { action = ACTION_STOP },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val title = "Shopping trip — $checked of $total"
        val body = if (last.isBlank()) "Tap items as you grab them." else "Last: $last"

        return NotificationCompat.Builder(this, NotificationService.Channel.REMINDERS.id)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setContentIntent(tap)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setProgress(total.coerceAtLeast(1), checked.coerceAtMost(total), total == 0)
            .addAction(0, "Finish trip", stop)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    companion object {
        const val ACTION_START = "com.eatpal.app.grocery_trip.START"
        const val ACTION_UPDATE = "com.eatpal.app.grocery_trip.UPDATE"
        const val ACTION_STOP = "com.eatpal.app.grocery_trip.STOP"
        const val EXTRA_TOTAL = "total"
        const val EXTRA_CHECKED = "checked"
        const val EXTRA_LAST_NAME = "last_name"
        const val NOTIFICATION_ID = 9901

        fun start(context: Context, total: Int, checked: Int) = send(
            context, ACTION_START, total, checked, ""
        )

        fun update(context: Context, total: Int, checked: Int, lastName: String) = send(
            context, ACTION_UPDATE, total, checked, lastName
        )

        fun stop(context: Context) {
            context.startService(
                Intent(context, GroceryTripService::class.java).apply { action = ACTION_STOP }
            )
        }

        private fun send(context: Context, action: String, total: Int, checked: Int, last: String) {
            val intent = Intent(context, GroceryTripService::class.java).apply {
                this.action = action
                putExtra(EXTRA_TOTAL, total)
                putExtra(EXTRA_CHECKED, checked)
                putExtra(EXTRA_LAST_NAME, last)
            }
            if (action == ACTION_START && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
    }
}
