package com.eatpal.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.eatpal.app.ui.RootScreen
import com.eatpal.app.ui.theme.EatPalTheme
import com.eatpal.app.util.DeepLinkHandler
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.MutableStateFlow

/**
 * Single-activity host. Navigation lives inside Compose via Navigation-Compose —
 * mirrors the iOS `RootView`. Deep links come in via [onNewIntent]; we pass
 * the resolved route down through a StateFlow that RootScreen observes.
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    private val pendingRoute = MutableStateFlow<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pendingRoute.value = DeepLinkHandler.resolve(intent)
        setContent {
            EatPalTheme {
                val route by pendingRoute.collectAsState()
                RootScreen(
                    pendingDeepLinkRoute = route,
                    onDeepLinkConsumed = { pendingRoute.value = null },
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        DeepLinkHandler.resolve(intent)?.let { pendingRoute.value = it }
    }
}
