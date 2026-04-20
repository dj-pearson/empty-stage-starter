package com.eatpal.app.data.remote

import com.eatpal.app.BuildConfig
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.storage.Storage
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Mirrors iOS `SupabaseManager.client`:
 *   - URL + anon key sourced from build config (iOS reads Info.plist; here we
 *     read BuildConfig populated from env.local.properties or env vars).
 *   - Real keys never live in source — fallback placeholder `REPLACE_WITH_...`
 *     matches the iOS convention so accidental commits are obvious.
 *
 * Singleton — installed via Hilt `NetworkModule` so every repository sees the
 * same session, realtime socket, and auth state.
 */
@Singleton
class SupabaseClientProvider @Inject constructor() {
    val client: SupabaseClient = createSupabaseClient(
        supabaseUrl = BuildConfig.SUPABASE_URL,
        supabaseKey = BuildConfig.SUPABASE_ANON_KEY,
    ) {
        install(Auth) {
            // Android auto-refresh uses the default token store (shared prefs)
            // unless we override. Matches iOS supabase-swift session behaviour.
            alwaysAutoRefresh = true
            autoLoadFromStorage = true
        }
        install(Postgrest)
        install(Realtime)
        install(Storage)
        install(Functions)
    }
}
