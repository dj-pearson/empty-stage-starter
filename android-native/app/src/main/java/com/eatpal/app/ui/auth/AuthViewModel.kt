package com.eatpal.app.ui.auth

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.eatpal.app.data.remote.AuthService
import com.eatpal.app.util.GoogleSignInHelper
import com.eatpal.app.util.PasswordValidator
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Android counterpart of iOS `AuthViewModel`. Drives the AuthScreen form:
 * tracks mode (sign in / sign up / reset), input values, inline validation,
 * and a single `AuthUiState.error` surface for screen-level errors that the
 * ToastController / inline text can render.
 */
@HiltViewModel
class AuthViewModel @Inject constructor(
    private val authService: AuthService,
) : ViewModel() {

    enum class Mode { SIGN_IN, SIGN_UP, RESET }

    data class UiState(
        val mode: Mode = Mode.SIGN_IN,
        val email: String = "",
        val password: String = "",
        val confirmPassword: String = "",
        val isBusy: Boolean = false,
        val error: String? = null,
        val info: String? = null,
        val passwordFailures: List<String> = emptyList(),
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    fun setMode(mode: Mode) = _state.update {
        it.copy(mode = mode, error = null, info = null, passwordFailures = emptyList())
    }

    fun onEmail(value: String) = _state.update { it.copy(email = value.trim(), error = null) }

    fun onPassword(value: String) = _state.update {
        val failures = if (it.mode == Mode.SIGN_UP) PasswordValidator.validate(value).failures else emptyList()
        it.copy(password = value, passwordFailures = failures, error = null)
    }

    fun onConfirmPassword(value: String) = _state.update { it.copy(confirmPassword = value, error = null) }

    fun submit() {
        val s = _state.value
        when (s.mode) {
            Mode.SIGN_IN -> signIn(s.email, s.password)
            Mode.SIGN_UP -> signUp(s.email, s.password, s.confirmPassword)
            Mode.RESET -> resetPassword(s.email)
        }
    }

    fun signInWithGoogle(context: Context) {
        viewModelScope.launch {
            _state.update { it.copy(isBusy = true, error = null) }
            runCatching {
                val token = GoogleSignInHelper.getIdToken(context)
                authService.signInWithGoogle(token.idToken, token.rawNonce)
            }.onFailure { t ->
                _state.update { it.copy(isBusy = false, error = t.message ?: "Google sign-in failed.") }
            }.onSuccess {
                _state.update { it.copy(isBusy = false) }
            }
        }
    }

    private fun signIn(email: String, password: String) {
        if (email.isBlank() || password.isBlank()) {
            _state.update { it.copy(error = "Enter your email and password.") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isBusy = true, error = null) }
            runCatching { authService.signIn(email, password) }
                .onSuccess { _state.update { it.copy(isBusy = false) } }
                .onFailure { t ->
                    _state.update { it.copy(isBusy = false, error = t.message ?: "Sign-in failed.") }
                }
        }
    }

    private fun signUp(email: String, password: String, confirm: String) {
        val failures = PasswordValidator.validate(password).failures
        if (email.isBlank() || password.isBlank()) {
            _state.update { it.copy(error = "Enter your email and password.") }
            return
        }
        if (password != confirm) {
            _state.update { it.copy(error = "Passwords don't match.") }
            return
        }
        if (failures.isNotEmpty()) {
            _state.update { it.copy(error = "Password is too weak.") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isBusy = true, error = null) }
            runCatching { authService.signUp(email, password) }
                .onSuccess {
                    _state.update {
                        it.copy(
                            isBusy = false,
                            info = "Check your email to verify your account.",
                        )
                    }
                }
                .onFailure { t ->
                    _state.update { it.copy(isBusy = false, error = t.message ?: "Sign-up failed.") }
                }
        }
    }

    private fun resetPassword(email: String) {
        if (email.isBlank()) {
            _state.update { it.copy(error = "Enter the email on your account.") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isBusy = true, error = null) }
            runCatching { authService.resetPassword(email) }
                .onSuccess {
                    _state.update {
                        it.copy(
                            isBusy = false,
                            info = "Password reset email sent.",
                        )
                    }
                }
                .onFailure { t ->
                    _state.update { it.copy(isBusy = false, error = t.message ?: "Reset failed.") }
                }
        }
    }
}
