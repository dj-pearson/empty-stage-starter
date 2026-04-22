package com.eatpal.app.data.remote

import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Kotlin port of iOS `NotificationService.handleDeviceToken`. Upserts the FCM
 * registration token into the shared `push_notifications` Supabase table.
 * Same user_id + platform + token shape iOS writes, so server-side senders
 * can target either platform with a single query.
 */
@Singleton
class PushTokenService @Inject constructor(
    private val supabase: SupabaseClientProvider,
) {
    @Serializable
    private data class PushTokenRow(
        @SerialName("user_id") val userId: String,
        val token: String,
        val platform: String = "android",
        @SerialName("app_version") val appVersion: String,
    )

    /** Stores [token] against the current session user. No-ops if not signed in. */
    suspend fun register(token: String, appVersion: String) {
        val userId = supabase.client.auth.currentUserOrNull()?.id ?: return
        val row = PushTokenRow(userId = userId.lowercase(), token = token, appVersion = appVersion)
        runCatching {
            supabase.client.postgrest.from("push_notifications").upsert(row) {
                onConflict = "user_id,token"
            }
        }
    }

    /** Invalidates this device's token when the user signs out. */
    suspend fun unregister(token: String) {
        runCatching {
            supabase.client.postgrest.from("push_notifications").delete {
                filter { eq("token", token) }
            }
        }
    }
}
