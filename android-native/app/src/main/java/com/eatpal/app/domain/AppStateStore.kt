package com.eatpal.app.domain

import com.eatpal.app.data.remote.DataService
import com.eatpal.app.data.remote.OfflineStore
import com.eatpal.app.data.remote.RealtimeService
import com.eatpal.app.data.local.entities.PendingMutation
import com.eatpal.app.models.Food
import com.eatpal.app.models.FoodUpdate
import com.eatpal.app.models.GroceryItem
import com.eatpal.app.models.GroceryItemUpdate
import com.eatpal.app.models.GroceryList
import com.eatpal.app.models.Kid
import com.eatpal.app.models.KidUpdate
import com.eatpal.app.models.PlanEntry
import com.eatpal.app.models.PlanEntryUpdate
import com.eatpal.app.models.Recipe
import com.eatpal.app.models.RecipeUpdate
import com.eatpal.app.util.NetworkMonitor
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Kotlin port of iOS `AppState.swift`. The single source of truth for the
 * in-memory view of the user's data. UI observes the StateFlows; methods here
 * mirror iOS ones 1:1 (add*, update*, delete*, toggle*) with the same
 * optimistic-update-then-rollback pattern.
 *
 * Called `AppStateStore` (not `AppState`) to keep it explicitly a store/holder
 * so it's obvious which Compose screens depend on it vs a ViewModel.
 */
@Singleton
class AppStateStore @Inject constructor(
    private val dataService: DataService,
    private val realtimeService: RealtimeService,
    private val offlineStore: OfflineStore,
    private val networkMonitor: NetworkMonitor,
) {
    // MARK: - Published state (iOS @Published -> StateFlow)

    private val _foods = MutableStateFlow<List<Food>>(emptyList())
    val foods: StateFlow<List<Food>> = _foods.asStateFlow()

    private val _kids = MutableStateFlow<List<Kid>>(emptyList())
    val kids: StateFlow<List<Kid>> = _kids.asStateFlow()

    private val _recipes = MutableStateFlow<List<Recipe>>(emptyList())
    val recipes: StateFlow<List<Recipe>> = _recipes.asStateFlow()

    private val _planEntries = MutableStateFlow<List<PlanEntry>>(emptyList())
    val planEntries: StateFlow<List<PlanEntry>> = _planEntries.asStateFlow()

    private val _groceryItems = MutableStateFlow<List<GroceryItem>>(emptyList())
    val groceryItems: StateFlow<List<GroceryItem>> = _groceryItems.asStateFlow()

    private val _groceryLists = MutableStateFlow<List<GroceryList>>(emptyList())
    val groceryLists: StateFlow<List<GroceryList>> = _groceryLists.asStateFlow()

    private val _activeKidId = MutableStateFlow<String?>(null)
    val activeKidId: StateFlow<String?> = _activeKidId.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    // MARK: - Bulk load (parity with iOS `loadAllData`)

    suspend fun loadAllData() {
        _isLoading.value = true
        _errorMessage.value = null
        try {
            val results = coroutineScopeAwait(
                suspend { dataService.fetchFoods() },
                suspend { dataService.fetchKids() },
                suspend { dataService.fetchRecipes() },
                suspend { dataService.fetchPlanEntries() },
                suspend { dataService.fetchGroceryItems() },
                suspend { dataService.fetchGroceryLists() },
            )
            @Suppress("UNCHECKED_CAST")
            _foods.value = results[0] as List<Food>
            @Suppress("UNCHECKED_CAST")
            _kids.value = results[1] as List<Kid>
            @Suppress("UNCHECKED_CAST")
            _recipes.value = results[2] as List<Recipe>
            @Suppress("UNCHECKED_CAST")
            _planEntries.value = results[3] as List<PlanEntry>
            @Suppress("UNCHECKED_CAST")
            _groceryItems.value = results[4] as List<GroceryItem>
            @Suppress("UNCHECKED_CAST")
            _groceryLists.value = results[5] as List<GroceryList>

            if (_activeKidId.value == null) {
                _activeKidId.value = _kids.value.firstOrNull()?.id
            }

            // Kick off realtime only after initial load. iOS does the same.
            realtimeService.subscribe(this)

            // Warm the offline cache so the next cold launch has data.
            offlineStore.cacheFoods(_foods.value)
            offlineStore.cacheKids(_kids.value)
            offlineStore.cacheGroceryItems(_groceryItems.value)
        } catch (t: Throwable) {
            _errorMessage.value = t.message
        } finally {
            _isLoading.value = false
        }
    }

    suspend fun clearData() {
        realtimeService.unsubscribeAll()
        _foods.value = emptyList()
        _kids.value = emptyList()
        _recipes.value = emptyList()
        _planEntries.value = emptyList()
        _groceryItems.value = emptyList()
        _groceryLists.value = emptyList()
        _activeKidId.value = null
    }

    fun setActiveKid(id: String?) {
        _activeKidId.value = id
    }

    // MARK: - Foods

    suspend fun addFood(food: Food) {
        _foods.update { it + food }
        runCatching { dataService.insertFood(food) }.onFailure { t ->
            _foods.update { list -> list.filterNot { it.id == food.id } }
            throw t
        }
    }

    suspend fun updateFood(id: String, updates: FoodUpdate) {
        val original = _foods.value.firstOrNull { it.id == id } ?: return
        _foods.update { list -> list.map { if (it.id == id) it.applying(updates) else it } }
        runCatching { dataService.updateFood(id, updates) }.onFailure { t ->
            _foods.update { list -> list.map { if (it.id == id) original else it } }
            throw t
        }
    }

    suspend fun deleteFood(id: String) {
        val original = _foods.value.firstOrNull { it.id == id } ?: return
        _foods.update { list -> list.filterNot { it.id == id } }
        runCatching { dataService.deleteFood(id) }.onFailure { t ->
            _foods.update { it + original }
            throw t
        }
    }

    // MARK: - Kids

    suspend fun addKid(kid: Kid) {
        _kids.update { it + kid }
        runCatching { dataService.insertKid(kid) }.onSuccess {
            if (_activeKidId.value == null) _activeKidId.value = kid.id
        }.onFailure { t ->
            _kids.update { list -> list.filterNot { it.id == kid.id } }
            throw t
        }
    }

    suspend fun updateKid(id: String, updates: KidUpdate) {
        val original = _kids.value.firstOrNull { it.id == id } ?: return
        _kids.update { list -> list.map { if (it.id == id) it.applying(updates) else it } }
        runCatching { dataService.updateKid(id, updates) }.onFailure { t ->
            _kids.update { list -> list.map { if (it.id == id) original else it } }
            throw t
        }
    }

    suspend fun deleteKid(id: String) {
        val original = _kids.value.firstOrNull { it.id == id } ?: return
        _kids.update { list -> list.filterNot { it.id == id } }
        if (_activeKidId.value == id) _activeKidId.value = _kids.value.firstOrNull()?.id
        runCatching { dataService.deleteKid(id) }.onFailure { t ->
            _kids.update { it + original }
            throw t
        }
    }

    // MARK: - Recipes

    suspend fun addRecipe(recipe: Recipe) {
        _recipes.update { it + recipe }
        runCatching { dataService.insertRecipe(recipe) }.onFailure { t ->
            _recipes.update { list -> list.filterNot { it.id == recipe.id } }
            throw t
        }
    }

    suspend fun updateRecipe(id: String, updates: RecipeUpdate) {
        val original = _recipes.value.firstOrNull { it.id == id } ?: return
        _recipes.update { list -> list.map { if (it.id == id) it.applying(updates) else it } }
        runCatching { dataService.updateRecipe(id, updates) }.onFailure { t ->
            _recipes.update { list -> list.map { if (it.id == id) original else it } }
            throw t
        }
    }

    suspend fun deleteRecipe(id: String) {
        val original = _recipes.value.firstOrNull { it.id == id } ?: return
        _recipes.update { list -> list.filterNot { it.id == id } }
        runCatching { dataService.deleteRecipe(id) }.onFailure { t ->
            _recipes.update { it + original }
            throw t
        }
    }

    // MARK: - Plan entries

    suspend fun addPlanEntry(entry: PlanEntry) {
        _planEntries.update { it + entry }
        runCatching { dataService.insertPlanEntry(entry) }.onFailure { t ->
            _planEntries.update { list -> list.filterNot { it.id == entry.id } }
            throw t
        }
    }

    suspend fun updatePlanEntry(id: String, updates: PlanEntryUpdate) {
        val original = _planEntries.value.firstOrNull { it.id == id } ?: return
        _planEntries.update { list -> list.map { if (it.id == id) it.applying(updates) else it } }
        runCatching { dataService.updatePlanEntry(id, updates) }.onFailure { t ->
            _planEntries.update { list -> list.map { if (it.id == id) original else it } }
            throw t
        }
    }

    suspend fun deletePlanEntry(id: String) {
        val original = _planEntries.value.firstOrNull { it.id == id } ?: return
        _planEntries.update { list -> list.filterNot { it.id == id } }
        runCatching { dataService.deletePlanEntry(id) }.onFailure { t ->
            _planEntries.update { it + original }
            throw t
        }
    }

    // MARK: - Grocery items (iOS parity — queues writes when offline)

    suspend fun addGroceryItem(item: GroceryItem) {
        _groceryItems.update { it + item }
        runCatching { dataService.insertGroceryItem(item) }.onFailure { t ->
            if (networkMonitor.isNetworkError(t)) {
                // US-150 parity: keep the optimistic row and queue the write.
                offlineStore.enqueueInsert(
                    payload = item,
                    table = PendingMutation.TBL_GROCERY_ITEMS,
                    entityId = item.id,
                )
            } else {
                _groceryItems.update { list -> list.filterNot { it.id == item.id } }
                throw t
            }
        }
    }

    suspend fun updateGroceryItem(id: String, updates: GroceryItemUpdate) {
        val original = _groceryItems.value.firstOrNull { it.id == id } ?: return
        _groceryItems.update { list -> list.map { if (it.id == id) it.applying(updates) else it } }
        runCatching { dataService.updateGroceryItem(id, updates) }.onFailure { t ->
            if (networkMonitor.isNetworkError(t)) {
                offlineStore.enqueueUpdate(
                    payload = updates,
                    table = PendingMutation.TBL_GROCERY_ITEMS,
                    entityId = id,
                )
            } else {
                _groceryItems.update { list -> list.map { if (it.id == id) original else it } }
                throw t
            }
        }
    }

    suspend fun deleteGroceryItem(id: String) {
        val original = _groceryItems.value.firstOrNull { it.id == id } ?: return
        _groceryItems.update { list -> list.filterNot { it.id == id } }
        runCatching { dataService.deleteGroceryItem(id) }.onFailure { t ->
            if (networkMonitor.isNetworkError(t)) {
                offlineStore.enqueueDelete(PendingMutation.TBL_GROCERY_ITEMS, id)
            } else {
                _groceryItems.update { it + original }
                throw t
            }
        }
    }

    suspend fun toggleGroceryItem(id: String) {
        val current = _groceryItems.value.firstOrNull { it.id == id } ?: return
        updateGroceryItem(id, GroceryItemUpdate(checked = !current.checked))
    }

    // MARK: - Realtime handlers (called by RealtimeService)

    fun onFoodInserted(food: Food) = _foods.update { list ->
        if (list.any { it.id == food.id }) list else list + food
    }
    fun onFoodUpdated(food: Food) = _foods.update { list ->
        list.map { if (it.id == food.id) food else it }
    }
    fun onFoodDeleted(id: String) = _foods.update { list -> list.filterNot { it.id == id } }

    fun onKidInserted(kid: Kid) = _kids.update { list ->
        if (list.any { it.id == kid.id }) list else list + kid
    }
    fun onKidUpdated(kid: Kid) = _kids.update { list ->
        list.map { if (it.id == kid.id) kid else it }
    }
    fun onKidDeleted(id: String) = _kids.update { list -> list.filterNot { it.id == id } }

    fun onGroceryInserted(item: GroceryItem) = _groceryItems.update { list ->
        if (list.any { it.id == item.id }) list else list + item
    }
    fun onGroceryUpdated(item: GroceryItem) = _groceryItems.update { list ->
        list.map { if (it.id == item.id) item else it }
    }
    fun onGroceryDeleted(id: String) = _groceryItems.update { list -> list.filterNot { it.id == id } }

    fun onPlanInserted(entry: PlanEntry) = _planEntries.update { list ->
        if (list.any { it.id == entry.id }) list else list + entry
    }
    fun onPlanUpdated(entry: PlanEntry) = _planEntries.update { list ->
        list.map { if (it.id == entry.id) entry else it }
    }
    fun onPlanDeleted(id: String) = _planEntries.update { list -> list.filterNot { it.id == id } }

    fun onRecipeInserted(recipe: Recipe) = _recipes.update { list ->
        if (list.any { it.id == recipe.id }) list else list + recipe
    }
    fun onRecipeUpdated(recipe: Recipe) = _recipes.update { list ->
        list.map { if (it.id == recipe.id) recipe else it }
    }
    fun onRecipeDeleted(id: String) = _recipes.update { list -> list.filterNot { it.id == id } }

    private suspend fun coroutineScopeAwait(vararg blocks: suspend () -> Any): List<Any> =
        kotlinx.coroutines.coroutineScope {
            blocks.map { async { it() } }.awaitAll()
        }
}
