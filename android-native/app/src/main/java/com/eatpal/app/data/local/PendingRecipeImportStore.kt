package com.eatpal.app.data.local

import android.content.Context
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

private val Context.pendingRecipesDataStore by preferencesDataStore(name = "eatpal_pending_recipes")

/**
 * DataStore-backed queue of recipe URLs shared via the Android share sheet
 * while the user was signed out or the app was backgrounded. Drained by
 * AppStateStore after sign-in — iOS `PendingRecipeImportQueue` parity.
 */
@Singleton
class PendingRecipeImportStore @Inject constructor(
    @ApplicationContext private val context: Context,
    private val json: Json,
) {

    @Serializable
    data class PendingImport(
        val id: String,
        val sourceUrl: String,
        val createdAt: Long,
    )

    private val queueKey = stringPreferencesKey("queue")

    suspend fun enqueue(item: PendingImport) {
        val current = load().toMutableList()
        current.removeAll { it.id == item.id }
        current += item
        save(current)
    }

    suspend fun load(): List<PendingImport> {
        val raw = context.pendingRecipesDataStore.data.map { it[queueKey].orEmpty() }.first()
        if (raw.isBlank()) return emptyList()
        return runCatching {
            json.decodeFromString(ListSerializer(PendingImport.serializer()), raw)
        }.getOrDefault(emptyList())
    }

    suspend fun remove(id: String) {
        val current = load().filterNot { it.id == id }
        save(current)
    }

    suspend fun clear() = save(emptyList())

    private suspend fun save(items: List<PendingImport>) {
        context.pendingRecipesDataStore.edit { prefs ->
            prefs[queueKey] = json.encodeToString(
                ListSerializer(PendingImport.serializer()),
                items,
            )
        }
    }
}
