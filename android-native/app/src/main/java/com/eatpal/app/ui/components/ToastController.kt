package com.eatpal.app.ui.components

import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * Compose-scoped mirror of iOS `ToastManager`. Provides `success / error /
 * info` helpers dispatched through a Material 3 `SnackbarHostState`. The
 * host lives on `RootScreen`'s Scaffold; callers grab the controller via
 * `LocalToastController.current`.
 */
@Singleton
class ToastController(
    private val host: SnackbarHostState,
    private val scope: CoroutineScope,
) {
    fun success(title: String, detail: String? = null) = show(format(title, detail))
    fun error(title: String, detail: String? = null) = show(format(title, detail))
    fun info(title: String, detail: String? = null) = show(format(title, detail))

    private fun show(message: String) {
        scope.launch { host.showSnackbar(message, duration = SnackbarDuration.Short) }
    }

    private fun format(title: String, detail: String?): String =
        if (detail.isNullOrBlank()) title else "$title — $detail"
}

val LocalToastController = staticCompositionLocalOf<ToastController> {
    error("ToastController not provided — wrap your content in RootScreen scaffold.")
}

@Composable
fun rememberToastController(): ToastController = LocalToastController.current
