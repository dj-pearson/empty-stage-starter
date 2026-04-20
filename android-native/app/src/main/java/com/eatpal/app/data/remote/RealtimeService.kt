package com.eatpal.app.data.remote

import com.eatpal.app.domain.AppStateStore
import com.eatpal.app.models.Food
import com.eatpal.app.models.GroceryItem
import com.eatpal.app.models.Kid
import com.eatpal.app.models.PlanEntry
import com.eatpal.app.models.Recipe
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.RealtimeChannel
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.realtime
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Kotlin port of iOS `RealtimeService.swift`. Subscribes to Postgres changes
 * on the 5 user-scoped tables and mirrors INSERT/UPDATE/DELETE into the
 * in-memory [AppStateStore] — same fan-out pattern the iOS app uses.
 */
@Singleton
class RealtimeService @Inject constructor(
    private val supabase: SupabaseClientProvider,
    private val json: Json,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val channels = mutableListOf<RealtimeChannel>()
    private val jobs = mutableListOf<Job>()

    /**
     * Subscribes to all relevant table changes for the current user.
     * Call after authentication succeeds — same contract as iOS.
     */
    suspend fun subscribe(appState: AppStateStore) {
        unsubscribeAll()
        supabase.client.realtime.connect()

        observe("foods-changes", "foods", appState) { old, newJson, action ->
            when (action) {
                Action.INSERT -> appState.onFoodInserted(json.decodeFromString<Food>(newJson))
                Action.UPDATE -> appState.onFoodUpdated(json.decodeFromString<Food>(newJson))
                Action.DELETE -> old?.let(appState::onFoodDeleted)
            }
        }

        observe("kids-changes", "kids", appState) { old, newJson, action ->
            when (action) {
                Action.INSERT -> appState.onKidInserted(json.decodeFromString<Kid>(newJson))
                Action.UPDATE -> appState.onKidUpdated(json.decodeFromString<Kid>(newJson))
                Action.DELETE -> old?.let(appState::onKidDeleted)
            }
        }

        observe("grocery-changes", "grocery_items", appState) { old, newJson, action ->
            when (action) {
                Action.INSERT -> appState.onGroceryInserted(json.decodeFromString<GroceryItem>(newJson))
                Action.UPDATE -> appState.onGroceryUpdated(json.decodeFromString<GroceryItem>(newJson))
                Action.DELETE -> old?.let(appState::onGroceryDeleted)
            }
        }

        observe("plan-changes", "plan_entries", appState) { old, newJson, action ->
            when (action) {
                Action.INSERT -> appState.onPlanInserted(json.decodeFromString<PlanEntry>(newJson))
                Action.UPDATE -> appState.onPlanUpdated(json.decodeFromString<PlanEntry>(newJson))
                Action.DELETE -> old?.let(appState::onPlanDeleted)
            }
        }

        observe("recipes-changes", "recipes", appState) { old, newJson, action ->
            when (action) {
                Action.INSERT -> appState.onRecipeInserted(json.decodeFromString<Recipe>(newJson))
                Action.UPDATE -> appState.onRecipeUpdated(json.decodeFromString<Recipe>(newJson))
                Action.DELETE -> old?.let(appState::onRecipeDeleted)
            }
        }
    }

    /**
     * Per-channel subscription wiring. Extracts the id from DELETE oldRecord
     * and the full new row from INSERT/UPDATE, then delegates decoding to the
     * caller — keeps deserialization close to the typed AppStateStore method
     * so we don't reinvoke the Json instance for each table.
     */
    private suspend fun observe(
        channelName: String,
        tableName: String,
        appState: AppStateStore,
        handler: suspend (oldId: String?, newRecordJson: String, action: Action) -> Unit,
    ) {
        val channel = supabase.client.channel(channelName)
        val flow = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
            table = tableName
        }

        val job = flow.onEach { change ->
            when (change) {
                is PostgresAction.Insert -> handler(null, change.record.toString(), Action.INSERT)
                is PostgresAction.Update -> handler(null, change.record.toString(), Action.UPDATE)
                is PostgresAction.Delete -> {
                    val id = change.oldRecord["id"]?.toString()?.trim('"')
                    handler(id, "{}", Action.DELETE)
                }
                is PostgresAction.Select -> Unit
            }
        }.launchIn(scope)

        channel.subscribe(blockUntilSubscribed = false)
        channels.add(channel)
        jobs.add(job)
    }

    suspend fun unsubscribeAll() {
        jobs.forEach(Job::cancel)
        jobs.clear()
        channels.forEach { it.unsubscribe() }
        channels.clear()
    }

    private enum class Action { INSERT, UPDATE, DELETE }
}
