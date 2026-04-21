package com.eatpal.app.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.eatpal.app.data.remote.OfflineStore
import com.eatpal.app.ui.theme.Spacing
import com.eatpal.app.util.NetworkMonitor
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

/**
 * Compose mirror of iOS `OfflineBannerView`. Shows while the device is offline
 * AND fades in a "syncing N" pill while the offline queue drains. Backed by
 * [NetworkMonitor.isConnected] + [OfflineStore.pendingMutationCount].
 */
@Composable
fun OfflineBanner(vm: OfflineBannerViewModel = hiltViewModel()) {
    val isConnected by vm.isConnected.collectAsStateWithLifecycle()
    val pending by vm.pendingCount.collectAsStateWithLifecycle(initialValue = 0)

    AnimatedVisibility(
        visible = !isConnected || pending > 0,
        enter = slideInVertically { -it } + fadeIn(),
        exit = slideOutVertically { -it } + fadeOut(),
    ) {
        val amber = Color(0xFFFFF4C2)
        val amberText = Color(0xFF7A5A00)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(amber)
                .padding(horizontal = Spacing.lg, vertical = Spacing.sm),
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Default.CloudOff, contentDescription = null, tint = amberText)
            val text = when {
                !isConnected && pending > 0 ->
                    "Offline — $pending change${if (pending == 1) "" else "s"} queued"
                !isConnected -> "No internet connection"
                pending > 0 -> "Syncing $pending change${if (pending == 1) "" else "s"}…"
                else -> ""
            }
            Text(text, color = amberText)
        }
    }
}

@HiltViewModel
class OfflineBannerViewModel @Inject constructor(
    networkMonitor: NetworkMonitor,
    offlineStore: OfflineStore,
) : ViewModel() {
    val isConnected: StateFlow<Boolean> = networkMonitor.isConnected
    val pendingCount: Flow<Int> = offlineStore.pendingMutationCount
}
