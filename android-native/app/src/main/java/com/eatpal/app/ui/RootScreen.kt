package com.eatpal.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.eatpal.app.data.remote.AuthService
import com.eatpal.app.domain.AppStateStore
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

/**
 * Minimal Compose shell so the module compiles and boots end-to-end.
 * Swaps between a "signed-out" placeholder and the main content based on
 * the Supabase session. Real screens tracked in prd.json (UI section).
 */
@Composable
fun RootScreen(vm: RootViewModel = hiltViewModel()) {
    val sessionStatus by vm.sessionStatus.collectAsStateWithLifecycle()
    val isLoading by vm.appState.isLoading.collectAsStateWithLifecycle()
    val foods by vm.appState.foods.collectAsStateWithLifecycle()
    val kids by vm.appState.kids.collectAsStateWithLifecycle()
    val groceryItems by vm.appState.groceryItems.collectAsStateWithLifecycle()

    // Parity with iOS RootView: once authenticated, kick the bulk load.
    LaunchedEffect(sessionStatus) {
        when (sessionStatus) {
            is SessionStatus.Authenticated -> vm.appState.loadAllData()
            is SessionStatus.NotAuthenticated -> vm.appState.clearData()
            else -> Unit
        }
    }

    Scaffold { inner ->
        Column(
            modifier = Modifier.fillMaxSize().padding(inner).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            horizontalAlignment = Alignment.Start,
        ) {
            when (val s = sessionStatus) {
                is SessionStatus.Initializing -> {
                    Text("Starting…")
                    CircularProgressIndicator()
                }
                is SessionStatus.NotAuthenticated -> {
                    Text("Signed out")
                    Text("Auth UI pending — see prd.json.")
                }
                is SessionStatus.RefreshFailure -> {
                    Text("Session expired. Please sign in again.")
                }
                is SessionStatus.Authenticated -> {
                    Text("Signed in as ${s.session.user?.email ?: "user"}")
                    if (isLoading) CircularProgressIndicator()
                    Text("Foods: ${foods.size}")
                    Text("Kids: ${kids.size}")
                    Text("Grocery items: ${groceryItems.size}")
                }
            }
        }
    }
}

@HiltViewModel
class RootViewModel @Inject constructor(
    val appState: AppStateStore,
    authService: AuthService,
) : ViewModel() {
    val sessionStatus: StateFlow<SessionStatus> = authService.sessionStatus
        .stateIn(viewModelScope, SharingStarted.Eagerly, SessionStatus.Initializing)
}
