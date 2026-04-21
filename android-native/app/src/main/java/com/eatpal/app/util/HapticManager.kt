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
 * Android mirror of iOS `HapticManager`. Same four patterns iOS uses:
 * success, error, lightImpact, mediumImpact.
 */
@Singleton
class HapticManager @Inject constructor(@ApplicationContext context: Context) {
    private val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        context.getSystemService(VibratorManager::class.java)?.defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }

    fun success() = vibrate(longArrayOf(0, 30, 40, 30))
    fun error() = vibrate(longArrayOf(0, 60, 50, 60, 50, 60))
    fun lightImpact() = vibrate(longArrayOf(0, 15))
    fun mediumImpact() = vibrate(longArrayOf(0, 30))

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
