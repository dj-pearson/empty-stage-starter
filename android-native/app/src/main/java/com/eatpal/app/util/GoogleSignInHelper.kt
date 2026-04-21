package com.eatpal.app.util

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialException
import com.eatpal.app.BuildConfig
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import java.security.MessageDigest
import java.security.SecureRandom

/**
 * Wraps androidx.credentials to obtain a Google ID token + nonce, which the
 * UI then hands to `AuthService.signInWithGoogle`. Android equivalent of the
 * iOS `AppleSignInHelper`.
 *
 * Requires `GOOGLE_WEB_CLIENT_ID` to be set in env.local.properties. Without
 * it we throw — surfacing a clear error instead of a cryptic Credentials API
 * failure.
 */
object GoogleSignInHelper {

    data class Token(val idToken: String, val rawNonce: String)

    /**
     * Prompts the user to pick a Google account and returns their ID token.
     * Must be called from an Activity context — pass `activity` so the
     * bottom-sheet can be anchored to the window.
     *
     * `filterByAuthorized` — true on "continue as" flow for returning users,
     * false to force the account picker for first-time sign-in.
     */
    suspend fun getIdToken(
        context: Context,
        filterByAuthorized: Boolean = false,
    ): Token {
        val clientId = BuildConfig.GOOGLE_WEB_CLIENT_ID
        require(clientId.isNotBlank()) {
            "GOOGLE_WEB_CLIENT_ID not configured in env.local.properties."
        }

        val rawNonce = generateRawNonce()
        val hashedNonce = sha256(rawNonce)

        val option = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(filterByAuthorized)
            .setServerClientId(clientId)
            .setNonce(hashedNonce)
            .setAutoSelectEnabled(filterByAuthorized)
            .build()

        val request = GetCredentialRequest.Builder()
            .addCredentialOption(option)
            .build()

        val result = try {
            CredentialManager.create(context).getCredential(context, request)
        } catch (e: GetCredentialException) {
            throw GoogleSignInException(e.message ?: "Google sign-in failed.", e)
        }

        val credential = result.credential
        val googleCred = try {
            GoogleIdTokenCredential.createFrom(credential.data)
        } catch (e: GoogleIdTokenParsingException) {
            throw GoogleSignInException("Invalid Google ID token.", e)
        }

        return Token(idToken = googleCred.idToken, rawNonce = rawNonce)
    }

    private fun generateRawNonce(): String {
        val bytes = ByteArray(32)
        SecureRandom().nextBytes(bytes)
        return bytes.joinToString("") { "%02x".format(it) }
    }

    private fun sha256(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }
    }
}

class GoogleSignInException(message: String, cause: Throwable? = null) : Exception(message, cause)
