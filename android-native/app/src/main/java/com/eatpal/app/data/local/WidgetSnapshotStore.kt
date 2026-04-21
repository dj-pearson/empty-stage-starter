package com.eatpal.app.data.local

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

private val Context.widgetDataStore by preferencesDataStore(name = "eatpal_widget")

/**
 * Android equivalent of iOS `WidgetSnapshot`. Persists today's meals + counts
 * so the Glance widget can render without hitting the network. AppStateStore
 * debounces writes at 500ms (same as iOS) before calling through here.
 */
@Singleton
class WidgetSnapshotStore @Inject constructor(
    @ApplicationContext private val context: Context,
    private val json: Json,
) {
    @Serializable
    data class Meal(val slot: String, val foodName: String)

    @Serializable
    data class Payload(
        val meals: List<Meal> = emptyList(),
        val groceryCount: Int = 0,
        val pantryLowCount: Int = 0,
        val tonightDish: String? = null,
        val tryBiteStreak: Int = 0,
    )

    private val mealsKey = stringPreferencesKey("meals_json")
    private val groceryKey = intPreferencesKey("grocery_count")
    private val pantryKey = intPreferencesKey("pantry_low_count")
    private val tonightKey = stringPreferencesKey("tonight_dish")
    private val streakKey = intPreferencesKey("try_bite_streak")
    private val updatedAtKey = longPreferencesKey("last_updated_at")

    val snapshot: Flow<Payload> = context.widgetDataStore.data.map { it.toPayload() }

    suspend fun write(payload: Payload) {
        context.widgetDataStore.edit { prefs ->
            prefs[mealsKey] = json.encodeToString(ListSerializer(Meal.serializer()), payload.meals)
            prefs[groceryKey] = payload.groceryCount
            prefs[pantryKey] = payload.pantryLowCount
            payload.tonightDish?.let { prefs[tonightKey] = it } ?: prefs.remove(tonightKey)
            prefs[streakKey] = payload.tryBiteStreak
            prefs[updatedAtKey] = System.currentTimeMillis()
        }
    }

    private fun Preferences.toPayload(): Payload {
        val mealsJson = this[mealsKey].orEmpty()
        val meals: List<Meal> = if (mealsJson.isBlank()) emptyList()
        else runCatching {
            json.decodeFromString(ListSerializer(Meal.serializer()), mealsJson)
        }.getOrDefault(emptyList())
        return Payload(
            meals = meals,
            groceryCount = this[groceryKey] ?: 0,
            pantryLowCount = this[pantryKey] ?: 0,
            tonightDish = this[tonightKey],
            tryBiteStreak = this[streakKey] ?: 0,
        )
    }
}
