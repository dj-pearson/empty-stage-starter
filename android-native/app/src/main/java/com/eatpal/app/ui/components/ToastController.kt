package com.eatpal.app.ui.components

import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * Compose-scoped mirror of iOS `ToastManager`. Four named styles matching
 * the web/iOS sonner helpers (success / error / info / warning) plus a
 * low-level [show] for callers that want a direct Snackbar with an action
 * button + dismiss callback.
 */
class ToastController(
    private val host: SnackbarHostState,
    private val scope: CoroutineScope,
) {
    // MARK: - Named variants (the 4 iOS helpers most of the UI uses)

    fun success(title: String, detail: String? = null) = show(format(title, detail))
    fun error(title: String, detail: String? = null) =
        show(format(title, detail), duration = SnackbarDuration.Long)
    fun info(title: String, detail: String? = null) = show(format(title, detail))
    fun warning(title: String, detail: String? = null) =
        show(format(title, detail), duration = SnackbarDuration.Long)

    /**
     * Lower-level helper for when you need an Undo-style action. [onAction]
     * fires if the user taps the action label; [onDismiss] fires for
     * everything else (timeout, swipe, next toast).
     */
    fun show(
        message: String,
        actionLabel: String? = null,
        duration: SnackbarDuration = SnackbarDuration.Short,
        onAction: (() -> Unit)? = null,
        onDismiss: (() -> Unit)? = null,
    ) {
        scope.launch {
            val result = host.showSnackbar(
                message = message,
                actionLabel = actionLabel,
                withDismissAction = actionLabel != null,
                duration = duration,
            )
            when (result) {
                SnackbarResult.ActionPerformed -> onAction?.invoke()
                SnackbarResult.Dismissed -> onDismiss?.invoke()
            }
        }
    }

    private fun format(title: String, detail: String?): String =
        if (detail.isNullOrBlank()) title else "$title — $detail"
}

val LocalToastController = staticCompositionLocalOf<ToastController> {
    error("ToastController not provided — wrap your content in RootScreen scaffold.")
}

@Composable
fun rememberToastController(): ToastController = LocalToastController.current
