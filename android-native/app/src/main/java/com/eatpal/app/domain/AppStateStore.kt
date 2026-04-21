package com.eatpal.app.domain

import android.content.Context
import com.eatpal.app.data.local.HealthConnectService
import com.eatpal.app.data.local.WidgetSnapshotStore
import com.eatpal.app.data.local.entities.PendingMutation
import com.eatpal.app.models.MealSlot
import com.eatpal.app.widget.EatPalWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.updateAll
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import com.eatpal.app.data.remote.DataService
import com.eatpal.app.data.remote.OfflineStore
import com.eatpal.app.data.remote.RealtimeService
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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
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
    private val healthConnect: HealthConnectService,
    private val widgetSnapshotStore: WidgetSnapshotStore,
    @ApplicationContext private val appContext: Context,
) {
    private val backgroundScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    init {
        setupWidgetSnapshotSync()
    }
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
        // Parity with iOS US-144: push macros to Health Connect when the meal
        // was eaten and the user has opted in. Silently skipped otherwise.
        if (updates.result == com.eatpal.app.models.MealResult.ATE.key) {
            val current = _planEntries.value.firstOrNull { it.id == id } ?: return
            backgroundScope.launch { writeHealthSample(current) }
        }
    }

    private suspend fun writeHealthSample(entry: PlanEntry) {
        if (!healthConnect.isAvailable) return
        if (!healthConnect.isEnabled.first()) return

        val recipeId = entry.recipeId ?: return
        val recipe = _recipes.value.firstOrNull { it.id == recipeId } ?: return
        val nutrition = recipe.nutritionInfo ?: return

        val mealDate = runCatching { java.time.LocalDate.parse(entry.date) }.getOrNull()
            ?: java.time.LocalDate.now()

        runCatching {
            healthConnect.writeMeal(
                calories = nutrition.calories,
                proteinGrams = nutrition.proteinG,
                carbsGrams = nutrition.carbsG,
                fatGrams = nutrition.fatG,
                mealDate = mealDate,
                mealName = recipe.name,
            )
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

    /**
     * iOS `setupWidgetSnapshotSync` parity. Debounced 500ms combine of the 4
     * flows that feed the widget, then writes a snapshot + triggers a reload.
     */
    @OptIn(FlowPreview::class)
    private fun setupWidgetSnapshotSync() {
        backgroundScope.launch {
            combine(
                _planEntries,
                _foods,
                _groceryItems,
                combine(_recipes, _activeKidId, ::Pair),
            ) { entries, foods, grocery, (recipes, kidId) ->
                composeSnapshot(entries, foods, recipes, grocery, kidId)
            }
                .debounce(500)
                .collect { payload ->
                    widgetSnapshotStore.write(payload)
                    runCatching {
                        GlanceAppWidgetManager(appContext).apply {
                            EatPalWidget().updateAll(appContext)
                        }
                    }
                }
        }
    }

    private fun composeSnapshot(
        entries: List<PlanEntry>,
        foods: List<Food>,
        recipes: List<Recipe>,
        grocery: List<GroceryItem>,
        kidId: String?,
    ): WidgetSnapshotStore.Payload {
        val today = java.time.LocalDate.now().format(java.time.format.DateTimeFormatter.ISO_LOCAL_DATE)
        val todaysEntries = entries.filter {
            it.date == today && (kidId == null || it.kidId == kidId)
        }
        val meals = MealSlot.entries.mapNotNull { slot ->
            val entry = todaysEntries.firstOrNull { it.mealSlot == slot.key } ?: return@mapNotNull null
            val name = entry.recipeId?.let { rid -> recipes.firstOrNull { it.id == rid }?.name }
                ?: foods.firstOrNull { it.id == entry.foodId }?.name
                ?: "Unnamed"
            WidgetSnapshotStore.Meal(slot = slot.displayName, foodName = name)
        }
        val tonight = todaysEntries.firstOrNull { it.mealSlot == MealSlot.DINNER.key }?.let { entry ->
            entry.recipeId?.let { rid -> recipes.firstOrNull { it.id == rid }?.name }
                ?: foods.firstOrNull { it.id == entry.foodId }?.name
        }
        val pantryLow = foods.count { (it.quantity ?: 0.0) in 0.01..2.0 }
        val unchecked = grocery.count { !it.checked }
        return WidgetSnapshotStore.Payload(
            meals = meals,
            groceryCount = unchecked,
            pantryLowCount = pantryLow,
            tonightDish = tonight,
            tryBiteStreak = 0,
        )
    }

    private suspend fun coroutineScopeAwait(vararg blocks: suspend () -> Any): List<Any> =
        kotlinx.coroutines.coroutineScope {
            blocks.map { async { it() } }.awaitAll()
        }
}
