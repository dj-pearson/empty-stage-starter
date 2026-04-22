package com.eatpal.app.util

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Android mirror of iOS `HapticManager`. iOS ships 5 named styles (success,
 * warning, error, selection, impact light/medium/heavy). We map each onto a
 * VibrationEffect pattern tuned to feel similar on Android — not identical,
 * but recognisably the same "this worked" / "slow down" / "that broke" cues.
 */
@Singleton
class HapticManager @Inject constructor(@ApplicationContext context: Context) {
    private val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        context.getSystemService(VibratorManager::class.java)?.defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }

    // Notification-style cues — used around success/failure of async work.
    fun success() = vibrate(longArrayOf(0, 30, 40, 30))
    fun warning() = vibrate(longArrayOf(0, 40, 60, 40))
    fun error() = vibrate(longArrayOf(0, 60, 50, 60, 50, 60))

    // Selection — very short click for list-item taps / chip presses.
    fun selection() = vibrate(longArrayOf(0, 10))

    // Impact feedback — weighted durations matching iOS UIImpactFeedbackStyle.
    fun lightImpact() = vibrate(longArrayOf(0, 15))
    fun mediumImpact() = vibrate(longArrayOf(0, 30))
    fun heavyImpact() = vibrate(longArrayOf(0, 50))

    private fun vibrate(pattern: LongArray) {
        val v = vibrator ?: return
        if (!v.hasVibrator()) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            v.vibrate(VibrationEffect.createWaveform(pattern, -1))
        } else {
            @Suppress("DEPRECATION")
            v.vibrate(pattern, -1)
        }
    }
}
