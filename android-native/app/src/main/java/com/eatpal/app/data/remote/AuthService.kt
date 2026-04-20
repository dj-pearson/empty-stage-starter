package com.eatpal.app.data.remote

import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.Google
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.providers.builtin.IDToken
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.auth.user.UserInfo
import io.github.jan.supabase.auth.user.UserSession
import io.github.jan.supabase.functions.functions
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Kotlin port of iOS `AuthService.swift`. Keeps the same surface: session/user
 * accessors, sign up / sign in / Apple-or-Google / reset / update / sign out /
 * delete account, and a Flow of auth state changes.
 */
@Singleton
class AuthService @Inject constructor(
    private val supabase: SupabaseClientProvider,
) {
    private val client get() = supabase.client

    // MARK: - Session / user

    fun currentSession(): UserSession? = client.auth.currentSessionOrNull()

    fun currentUser(): UserInfo? = client.auth.currentUserOrNull()

    /** Emits the latest [SessionStatus] — Authenticated / NotAuthenticated / LoadingFromStorage. */
    val sessionStatus: Flow<SessionStatus> = client.auth.sessionStatus

    // MARK: - Sign up / in

    suspend fun signUp(email: String, password: String) {
        client.auth.signUpWith(Email) {
            this.email = email
            this.password = password
        }
    }

    suspend fun signIn(email: String, password: String) {
        client.auth.signInWith(Email) {
            this.email = email
            this.password = password
        }
    }

    /**
     * Android equivalent of iOS Sign in with Apple. Uses Credential Manager /
     * Google Sign-In to get an ID token then exchanges it with Supabase.
     * Call site (UI layer) is responsible for obtaining `idToken` + `nonce`.
     */
    suspend fun signInWithGoogle(idToken: String, rawNonce: String?) {
        client.auth.signInWith(IDToken) {
            provider = Google
            this.idToken = idToken
            this.nonce = rawNonce
        }
    }

    // MARK: - Password reset / update

    suspend fun resetPassword(email: String) {
        client.auth.resetPasswordForEmail(email)
    }

    suspend fun updatePassword(newPassword: String) {
        client.auth.updateUser { password = newPassword }
    }

    // MARK: - Sign out

    suspend fun signOut() {
        client.auth.signOut()
    }

    // MARK: - Delete account (iOS parity: `delete-account` edge function)

    /**
     * Calls the `delete-account` edge function, which removes user-keyed data
     * and the auth.users row with service-role credentials. Same contract as
     * iOS. On non-2xx the Ktor call throws `RestException` — we propagate.
     * Best-effort local sign-out at the end — even if the final signOut
     * fails, the server already dropped the account.
     */
    suspend fun deleteAccount() {
        client.functions.invoke("delete-account")
        runCatching { client.auth.signOut() }
    }
}

class AuthException(message: String) : Exception(message)
