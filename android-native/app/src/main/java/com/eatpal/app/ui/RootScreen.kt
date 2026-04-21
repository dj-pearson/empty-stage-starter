package com.eatpal.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.rememberNavController
import com.eatpal.app.data.remote.AuthService
import com.eatpal.app.domain.AppStateStore
import com.eatpal.app.ui.auth.AuthScreen
import com.eatpal.app.ui.components.LocalToastController
import com.eatpal.app.ui.components.OfflineBanner
import com.eatpal.app.ui.components.ToastController
import com.eatpal.app.ui.nav.MainBottomBar
import com.eatpal.app.ui.nav.MainNavigation
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

/**
 * Top-level app shell. Offline banner pinned to the top edge, bottom nav
 * pinned to the bottom, routed content in between. Auth gate swaps the
 * whole content area between AuthScreen and the main nav graph based on
 * Supabase SessionStatus.
 */
@Composable
fun RootScreen(vm: RootViewModel = hiltViewModel()) {
    val sessionStatus by vm.sessionStatus.collectAsStateWithLifecycle()

    LaunchedEffect(sessionStatus) {
        when (sessionStatus) {
            is SessionStatus.Authenticated -> vm.appState.loadAllData()
            is SessionStatus.NotAuthenticated -> vm.appState.clearData()
            else -> Unit
        }
    }

    val snackbarHost = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val toast = remember { ToastController(snackbarHost, scope) }

    CompositionLocalProvider(LocalToastController provides toast) {
        val navController = rememberNavController()
        Scaffold(
            snackbarHost = { SnackbarHost(snackbarHost) },
            bottomBar = {
                if (sessionStatus is SessionStatus.Authenticated) {
                    MainBottomBar(navController)
                }
            },
        ) { inner ->
            Column(modifier = Modifier.fillMaxSize().padding(inner)) {
                OfflineBanner()
                when (sessionStatus) {
                    is SessionStatus.Initializing -> {
                        Column(
                            modifier = Modifier.fillMaxSize().padding(24.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                            horizontalAlignment = Alignment.Start,
                        ) {
                            Text("Starting…")
                            CircularProgressIndicator()
                        }
                    }
                    is SessionStatus.NotAuthenticated,
                    is SessionStatus.RefreshFailure -> AuthScreen()
                    is SessionStatus.Authenticated -> MainNavigation(navController)
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
