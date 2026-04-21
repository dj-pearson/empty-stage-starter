package com.eatpal.app.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.eatpal.app.ui.theme.Spacing

/**
 * Email/password sign-in, sign-up, and password-reset UI with a Google
 * Sign-In button. Mirrors the iOS `AuthView` layout and mode-switching
 * behavior. No Scaffold — AuthScreen is nested inside RootScreen's scaffold.
 */
@Composable
fun AuthScreen(vm: AuthViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(Spacing.xl),
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "EatPal",
            style = MaterialTheme.typography.displaySmall,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = when (state.mode) {
                AuthViewModel.Mode.SIGN_IN -> "Welcome back"
                AuthViewModel.Mode.SIGN_UP -> "Create your account"
                AuthViewModel.Mode.RESET -> "Reset your password"
            },
            style = MaterialTheme.typography.titleMedium,
        )

        Spacer(Modifier.height(Spacing.sm))

        OutlinedTextField(
            value = state.email,
            onValueChange = vm::onEmail,
            label = { Text("Email") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxWidth(),
            enabled = !state.isBusy,
        )

        if (state.mode != AuthViewModel.Mode.RESET) {
            OutlinedTextField(
                value = state.password,
                onValueChange = vm::onPassword,
                label = { Text("Password") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.isBusy,
                isError = state.mode == AuthViewModel.Mode.SIGN_UP && state.passwordFailures.isNotEmpty(),
                supportingText = {
                    if (state.mode == AuthViewModel.Mode.SIGN_UP && state.passwordFailures.isNotEmpty()) {
                        Text("Password needs: " + state.passwordFailures.joinToString(", "))
                    }
                },
            )
        }

        if (state.mode == AuthViewModel.Mode.SIGN_UP) {
            OutlinedTextField(
                value = state.confirmPassword,
                onValueChange = vm::onConfirmPassword,
                label = { Text("Confirm password") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.isBusy,
            )
        }

        state.error?.let {
            Text(it, color = MaterialTheme.colorScheme.error)
        }
        state.info?.let {
            Text(it, color = MaterialTheme.colorScheme.primary)
        }

        Button(
            onClick = vm::submit,
            enabled = !state.isBusy,
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (state.isBusy) {
                CircularProgressIndicator(
                    modifier = Modifier.height(20.dp),
                    strokeWidth = 2.dp,
                )
            } else {
                Text(
                    when (state.mode) {
                        AuthViewModel.Mode.SIGN_IN -> "Sign in"
                        AuthViewModel.Mode.SIGN_UP -> "Create account"
                        AuthViewModel.Mode.RESET -> "Send reset email"
                    }
                )
            }
        }

        if (state.mode != AuthViewModel.Mode.RESET) {
            HorizontalDivider(modifier = Modifier.padding(vertical = Spacing.sm))
            OutlinedButton(
                onClick = { vm.signInWithGoogle(context) },
                enabled = !state.isBusy,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Continue with Google")
            }
        }

        Spacer(Modifier.height(Spacing.sm))

        when (state.mode) {
            AuthViewModel.Mode.SIGN_IN -> {
                TextButton(onClick = { vm.setMode(AuthViewModel.Mode.RESET) }) {
                    Text("Forgot password?")
                }
                TextButton(onClick = { vm.setMode(AuthViewModel.Mode.SIGN_UP) }) {
                    Text("Create an account")
                }
            }
            AuthViewModel.Mode.SIGN_UP -> {
                TextButton(onClick = { vm.setMode(AuthViewModel.Mode.SIGN_IN) }) {
                    Text("Already have an account? Sign in")
                }
            }
            AuthViewModel.Mode.RESET -> {
                TextButton(onClick = { vm.setMode(AuthViewModel.Mode.SIGN_IN) }) {
                    Text("Back to sign in")
                }
            }
        }
    }
}
