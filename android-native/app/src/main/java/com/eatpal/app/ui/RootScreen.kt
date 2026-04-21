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
import com.eatpal.app.data.local.OnboardingStore
import com.eatpal.app.data.remote.AuthService
import com.eatpal.app.domain.AppStateStore
import com.eatpal.app.ui.auth.AuthScreen
import com.eatpal.app.ui.auth.OnboardingScreen
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
 * Boot gate. Order of precedence:
 *   1. Onboarding — if user has never completed it, show the 3-step welcome.
 *   2. Auth — if no session, show AuthScreen.
 *   3. Main app — tab navigation.
 * All three share the offline banner, snackbar host, and toast controller.
 */
@Composable
fun RootScreen(vm: RootViewModel = hiltViewModel()) {
    val sessionStatus by vm.sessionStatus.collectAsStateWithLifecycle()
    val onboarded by vm.onboardingCompleted.collectAsStateWithLifecycle()

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
                if (onboarded == true && sessionStatus is SessionStatus.Authenticated) {
                    MainBottomBar(navController)
                }
            },
        ) { inner ->
            Column(modifier = Modifier.fillMaxSize().padding(inner)) {
                OfflineBanner()
                when {
                    onboarded == null -> BootSpinner()
                    onboarded == false -> OnboardingScreen(onFinished = { /* flow observes store */ })
                    sessionStatus is SessionStatus.Initializing -> BootSpinner()
                    sessionStatus is SessionStatus.NotAuthenticated ||
                        sessionStatus is SessionStatus.RefreshFailure -> AuthScreen()
                    else -> MainNavigation(navController)
                }
            }
        }
    }
}

@Composable
private fun BootSpinner() {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.Start,
    ) {
        Text("Starting…")
        CircularProgressIndicator()
    }
}

@HiltViewModel
class RootViewModel @Inject constructor(
    val appState: AppStateStore,
    authService: AuthService,
    onboardingStore: OnboardingStore,
) : ViewModel() {
    val sessionStatus: StateFlow<SessionStatus> = authService.sessionStatus
        .stateIn(viewModelScope, SharingStarted.Eagerly, SessionStatus.Initializing)

    val onboardingCompleted: StateFlow<Boolean?> = onboardingStore.isCompleted
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)
}
