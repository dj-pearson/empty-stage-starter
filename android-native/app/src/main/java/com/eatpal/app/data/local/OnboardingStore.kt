package com.eatpal.app.data.local

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.onboardingDataStore by preferencesDataStore(name = "eatpal_onboarding")

/**
 * Persists the "user finished onboarding" flag so the 3-step welcome doesn't
 * reappear after sign-out. DataStore avoids SharedPreferences' sync footguns.
 */
@Singleton
class OnboardingStore @Inject constructor(@ApplicationContext private val context: Context) {
    private val completedKey = booleanPreferencesKey("completed")

    val isCompleted: Flow<Boolean> =
        context.onboardingDataStore.data.map { it[completedKey] ?: false }

    suspend fun markCompleted() {
        context.onboardingDataStore.edit { it[completedKey] = true }
    }
}
