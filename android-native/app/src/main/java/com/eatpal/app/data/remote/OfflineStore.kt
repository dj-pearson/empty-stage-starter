package com.eatpal.app.data.remote

import com.eatpal.app.data.local.dao.CacheDao
import com.eatpal.app.data.local.dao.PendingMutationDao
import com.eatpal.app.data.local.entities.CachedFood
import com.eatpal.app.data.local.entities.CachedGroceryItem
import com.eatpal.app.data.local.entities.CachedKid
import com.eatpal.app.data.local.entities.PendingMutation
import com.eatpal.app.models.Food
import com.eatpal.app.models.FoodUpdate
import com.eatpal.app.models.GroceryItem
import com.eatpal.app.models.GroceryItemUpdate
import com.eatpal.app.models.Kid
import com.eatpal.app.models.PlanEntry
import com.eatpal.app.models.PlanEntryUpdate
import com.eatpal.app.models.Recipe
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Kotlin port of iOS `OfflineStore.swift`. Same responsibilities:
 *   - cache foods / kids / grocery items locally for offline reads
 *   - queue insert/update/delete mutations while offline
 *   - replay the queue against Supabase when connectivity returns, stopping
 *     on first failure so ordering is preserved
 *
 * One difference: Room is persistent by construction, so we don't need
 * SwiftData's in-memory fallback branch.
 */
@Singleton
class OfflineStore @Inject constructor(
    private val supabase: SupabaseClientProvider,
    private val cacheDao: CacheDao,
    @PublishedApi internal val pendingDao: PendingMutationDao,
    @PublishedApi internal val json: Json,
) {
    private val syncMutex = Mutex()

    private val _isSyncing = MutableStateFlow(false)
    val isSyncing: StateFlow<Boolean> = _isSyncing.asStateFlow()

    private val _lastSyncError = MutableStateFlow<String?>(null)
    val lastSyncError: StateFlow<String?> = _lastSyncError.asStateFlow()

    /** Observable queue depth so UI matches iOS `pendingMutationCount`. */
    val pendingMutationCount: Flow<Int> = pendingDao.observeCount()

    // MARK: - Cache reads / writes

    suspend fun cacheFoods(foods: List<Food>) {
        cacheDao.upsertFoods(foods.map { CachedFood.from(it) })
    }

    suspend fun loadCachedFoods(userId: String): List<Food> =
        cacheDao.getFoods().map { it.toFood(userId) }

    suspend fun cacheKids(kids: List<Kid>) {
        cacheDao.upsertKids(kids.map { CachedKid.from(it) })
    }

    suspend fun cacheGroceryItems(items: List<GroceryItem>) {
        cacheDao.upsertGroceryItems(items.map { CachedGroceryItem.from(it) })
    }

    // MARK: - Typed enqueue helpers (parity with iOS `enqueueInsert/Update/Delete`)

    suspend inline fun <reified T> enqueueInsert(payload: T, table: String, entityId: String) {
        pendingDao.add(
            PendingMutation(
                tableName = table,
                operation = PendingMutation.OP_INSERT,
                entityId = entityId,
                payload = json.encodeToString(payload),
            )
        )
    }

    suspend inline fun <reified T> enqueueUpdate(payload: T, table: String, entityId: String) {
        pendingDao.add(
            PendingMutation(
                tableName = table,
                operation = PendingMutation.OP_UPDATE,
                entityId = entityId,
                payload = json.encodeToString(payload),
            )
        )
    }

    suspend fun enqueueDelete(table: String, entityId: String) {
        pendingDao.add(
            PendingMutation(
                tableName = table,
                operation = PendingMutation.OP_DELETE,
                entityId = entityId,
                payload = null,
            )
        )
    }

    // MARK: - Sync

    /**
     * Replays pending mutations against Supabase when coming back online.
     * Per-table dispatch decodes the stored payload and posts the right typed
     * insert/update to the right endpoint. Stops on first failure so queue
     * ordering is preserved — next NetworkMonitor tick retries from there.
     */
    suspend fun syncPendingMutations() {
        if (!syncMutex.tryLock()) return
        try {
            _isSyncing.value = true
            _lastSyncError.value = null

            val mutations = pendingDao.getAll()
            for (mutation in mutations) {
                try {
                    replay(mutation)
                    pendingDao.remove(mutation)
                } catch (t: Throwable) {
                    _lastSyncError.value = t.message
                    break
                }
            }
        } finally {
            _isSyncing.value = false
            syncMutex.unlock()
        }
    }

    private suspend fun replay(mutation: PendingMutation) {
        val db = supabase.client.postgrest
        val table = mutation.tableName
        val payload = mutation.payload

        when (mutation.operation) {
            PendingMutation.OP_DELETE -> {
                db.from(table).delete { filter { eq("id", mutation.entityId) } }
            }

            PendingMutation.OP_INSERT -> {
                if (payload == null) return
                when (table) {
                    PendingMutation.TBL_GROCERY_ITEMS ->
                        db.from(table).insert(json.decodeFromString<GroceryItem>(payload))
                    PendingMutation.TBL_FOODS ->
                        db.from(table).insert(json.decodeFromString<Food>(payload))
                    PendingMutation.TBL_PLAN_ENTRIES ->
                        db.from(table).insert(json.decodeFromString<PlanEntry>(payload))
                    PendingMutation.TBL_KIDS ->
                        db.from(table).insert(json.decodeFromString<Kid>(payload))
                    PendingMutation.TBL_RECIPES ->
                        db.from(table).insert(json.decodeFromString<Recipe>(payload))
                }
            }

            PendingMutation.OP_UPDATE -> {
                if (payload == null) return
                when (table) {
                    PendingMutation.TBL_GROCERY_ITEMS -> {
                        val u = json.decodeFromString<GroceryItemUpdate>(payload)
                        db.from(table).update(u) { filter { eq("id", mutation.entityId) } }
                    }
                    PendingMutation.TBL_FOODS -> {
                        val u = json.decodeFromString<FoodUpdate>(payload)
                        db.from(table).update(u) { filter { eq("id", mutation.entityId) } }
                    }
                    PendingMutation.TBL_PLAN_ENTRIES -> {
                        val u = json.decodeFromString<PlanEntryUpdate>(payload)
                        db.from(table).update(u) { filter { eq("id", mutation.entityId) } }
                    }
                }
            }
        }
    }
}
