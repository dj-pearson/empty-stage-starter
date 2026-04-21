package com.eatpal.app.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.eatpal.app.BuildConfig
import com.eatpal.app.data.remote.AuthService
import com.eatpal.app.data.remote.OfflineStore
import com.eatpal.app.domain.AppStateStore
import com.eatpal.app.ui.components.rememberToastController
import com.eatpal.app.ui.theme.Spacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * iOS `SettingsView` parity: account info, sync diagnostics, sign out,
 * delete account. Health sync + subscription management are separate screens
 * (prd.json US-215 / US-214).
 */
@Composable
fun SettingsScreen(vm: SettingsViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val pending by vm.pendingMutationCount.collectAsStateWithLifecycle(initialValue = 0)
    val toast = rememberToastController()
    var confirmingDelete by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
    ) {
        Text(
            "Settings",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
        )

        Card(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(Spacing.lg),
                verticalArrangement = Arrangement.spacedBy(Spacing.sm),
            ) {
                Text("Account", fontWeight = FontWeight.SemiBold)
                HorizontalDivider()
                Text("Signed in as ${state.email ?: "unknown"}")
                state.userId?.let {
                    Text(
                        "User id: $it",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }

        Card(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(Spacing.lg),
                verticalArrangement = Arrangement.spacedBy(Spacing.sm),
            ) {
                Text("Sync", fontWeight = FontWeight.SemiBold)
                HorizontalDivider()
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Pending offline changes:", modifier = Modifier.fillMaxWidth(1f))
                    Text("$pending")
                }
                state.lastSyncError?.let {
                    Text(
                        "Last sync error: $it",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                Button(
                    onClick = {
                        vm.triggerSync { err ->
                            if (err != null) toast.error("Sync failed", err)
                            else toast.success("Synced")
                        }
                    },
                    enabled = pending > 0 && !state.isSyncing,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (state.isSyncing) "Syncing…" else "Sync now")
                }
            }
        }

        Card(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(Spacing.lg),
                verticalArrangement = Arrangement.spacedBy(Spacing.sm),
            ) {
                Text("Diagnostics", fontWeight = FontWeight.SemiBold)
                HorizontalDivider()
                Text("Version: ${BuildConfig.VERSION_NAME} (build ${BuildConfig.VERSION_CODE})")
                Text("Application id: ${BuildConfig.APPLICATION_ID}")
            }
        }

        Spacer(Modifier.padding(Spacing.sm))

        OutlinedButton(
            onClick = {
                vm.signOut { err ->
                    if (err != null) toast.error("Sign out failed", err)
                }
            },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Sign out")
        }

        Button(
            onClick = { confirmingDelete = true },
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.errorContainer,
                contentColor = MaterialTheme.colorScheme.onErrorContainer,
            ),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Delete account")
        }
    }

    if (confirmingDelete) {
        AlertDialog(
            onDismissRequest = { confirmingDelete = false },
            title = { Text("Delete your account?") },
            text = {
                Text(
                    "This permanently removes your account and all your data. " +
                        "This cannot be undone. Required by the Apple Guideline 5.1.1(v) " +
                        "and Google Play policy parity."
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    confirmingDelete = false
                    vm.deleteAccount { err ->
                        if (err != null) toast.error("Delete failed", err)
                    }
                }) {
                    Text("Delete", color = Color(0xFFB00020))
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmingDelete = false }) { Text("Cancel") }
            },
        )
    }
}

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val authService: AuthService,
    private val offlineStore: OfflineStore,
    private val appState: AppStateStore,
) : ViewModel() {

    data class UiState(
        val email: String? = null,
        val userId: String? = null,
        val isSyncing: Boolean = false,
        val lastSyncError: String? = null,
    )

    private val _state = MutableStateFlow(
        UiState(
            email = authService.currentUser()?.email,
            userId = authService.currentUser()?.id,
        )
    )
    val state: StateFlow<UiState> = _state.asStateFlow()

    val pendingMutationCount: Flow<Int> = offlineStore.pendingMutationCount

    init {
        // Propagate offline store status into UiState so the button stays accurate.
        viewModelScope.launch {
            offlineStore.isSyncing.collect { busy -> _state.update { it.copy(isSyncing = busy) } }
        }
        viewModelScope.launch {
            offlineStore.lastSyncError.collect { err -> _state.update { it.copy(lastSyncError = err) } }
        }
    }

    fun triggerSync(onResult: (err: String?) -> Unit) {
        viewModelScope.launch {
            runCatching { offlineStore.syncPendingMutations() }
                .onSuccess { onResult(offlineStore.lastSyncError.value) }
                .onFailure { onResult(it.message) }
        }
    }

    fun signOut(onResult: (err: String?) -> Unit) {
        viewModelScope.launch {
            runCatching {
                appState.clearData()
                authService.signOut()
            }
                .onSuccess { onResult(null) }
                .onFailure { onResult(it.message) }
        }
    }

    fun deleteAccount(onResult: (err: String?) -> Unit) {
        viewModelScope.launch {
            runCatching {
                authService.deleteAccount()
                appState.clearData()
            }
                .onSuccess { onResult(null) }
                .onFailure { onResult(it.message) }
        }
    }
}
