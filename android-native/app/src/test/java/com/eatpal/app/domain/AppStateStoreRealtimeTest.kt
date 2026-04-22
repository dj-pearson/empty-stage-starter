package com.eatpal.app.domain

import android.content.Context
import com.eatpal.app.data.local.HealthConnectService
import com.eatpal.app.data.local.WidgetSnapshotStore
import com.eatpal.app.data.remote.DataService
import com.eatpal.app.data.remote.OfflineStore
import com.eatpal.app.data.remote.RealtimeService
import com.eatpal.app.models.Food
import com.eatpal.app.models.GroceryItem
import com.eatpal.app.models.Kid
import com.eatpal.app.models.PlanEntry
import com.eatpal.app.models.Recipe
import com.eatpal.app.util.NetworkMonitor
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.emptyFlow
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Direct tests for the RealtimeService fan-out handlers on AppStateStore —
 * these are pure StateFlow mutations so we can exercise them without faking
 * the DataService / Supabase side of the world. Mocks on constructor deps
 * are "relaxed" because the init block spawns a widget-snapshot collector
 * that touches WidgetSnapshotStore; we just need stubs that don't throw.
 */
class AppStateStoreRealtimeTest {

    private fun makeStore(): AppStateStore {
        val widget = mockk<WidgetSnapshotStore>(relaxed = true).also {
            every { it.snapshot } returns emptyFlow()
        }
        val offline = mockk<OfflineStore>(relaxed = true).also {
            every { it.isSyncing } returns MutableStateFlow(false)
            every { it.lastSyncError } returns MutableStateFlow(null)
            every { it.pendingMutationCount } returns emptyFlow()
        }
        val netMon = mockk<NetworkMonitor>(relaxed = true).also {
            every { it.isConnected } returns MutableStateFlow(true)
            every { it.connectionType } returns MutableStateFlow(NetworkMonitor.ConnectionType.WIFI)
        }
        val health = mockk<HealthConnectService>(relaxed = true).also {
            every { it.isAvailable } returns false
        }
        return AppStateStore(
            dataService = mockk<DataService>(relaxed = true),
            realtimeService = mockk<RealtimeService>(relaxed = true),
            offlineStore = offline,
            networkMonitor = netMon,
            healthConnect = health,
            widgetSnapshotStore = widget,
            appContext = mockk<Context>(relaxed = true),
        )
    }

    // MARK: - Foods

    @Test
    fun `onFoodInserted appends new food`() {
        val store = makeStore()
        val food = Food(id = "f1", userId = "u1", name = "Milk", category = "dairy")
        store.onFoodInserted(food)
        assertEquals(listOf(food), store.foods.value)
    }

    @Test
    fun `onFoodInserted ignores duplicate id`() {
        val store = makeStore()
        val food = Food(id = "f1", userId = "u1", name = "Milk", category = "dairy")
        store.onFoodInserted(food)
        store.onFoodInserted(food.copy(name = "Milk 2"))
        assertEquals(1, store.foods.value.size)
        // First write wins — iOS does the same to avoid clobbering in-flight edits.
        assertEquals("Milk", store.foods.value.first().name)
    }

    @Test
    fun `onFoodUpdated replaces by id`() {
        val store = makeStore()
        val food = Food(id = "f1", userId = "u1", name = "Milk", category = "dairy")
        store.onFoodInserted(food)
        store.onFoodUpdated(food.copy(name = "Whole Milk"))
        assertEquals("Whole Milk", store.foods.value.first().name)
    }

    @Test
    fun `onFoodDeleted removes by id`() {
        val store = makeStore()
        val a = Food(id = "f1", userId = "u1", name = "A", category = "c")
        val b = Food(id = "f2", userId = "u1", name = "B", category = "c")
        store.onFoodInserted(a)
        store.onFoodInserted(b)
        store.onFoodDeleted("f1")
        assertEquals(listOf(b), store.foods.value)
    }

    // MARK: - Kids

    @Test
    fun `onKidInserted and onKidDeleted round-trip`() {
        val store = makeStore()
        val kid = Kid(id = "k1", userId = "u1", name = "Alex")
        store.onKidInserted(kid)
        assertEquals(1, store.kids.value.size)
        store.onKidDeleted("k1")
        assertTrue(store.kids.value.isEmpty())
    }

    @Test
    fun `onKidUpdated does nothing when id not found`() {
        val store = makeStore()
        val kid = Kid(id = "k1", userId = "u1", name = "Alex")
        store.onKidUpdated(kid)
        // No pre-existing row, so update is a no-op; list stays empty.
        assertTrue(store.kids.value.isEmpty())
    }

    // MARK: - Grocery

    @Test
    fun `onGroceryInserted then onGroceryUpdated flips checked`() {
        val store = makeStore()
        val item = GroceryItem(
            id = "g1",
            userId = "u1",
            name = "Bread",
            category = "carb",
            quantity = 1.0,
            unit = "loaf",
            checked = false,
        )
        store.onGroceryInserted(item)
        store.onGroceryUpdated(item.copy(checked = true))
        assertEquals(true, store.groceryItems.value.first().checked)
    }

    // MARK: - Plan entries

    @Test
    fun `onPlanInserted appends, onPlanDeleted removes`() {
        val store = makeStore()
        val entry = PlanEntry(
            id = "p1",
            userId = "u1",
            kidId = "k1",
            date = "2026-04-22",
            mealSlot = "dinner",
            foodId = "f1",
        )
        store.onPlanInserted(entry)
        assertEquals(1, store.planEntries.value.size)
        store.onPlanDeleted("p1")
        assertTrue(store.planEntries.value.isEmpty())
    }

    // MARK: - Recipes

    @Test
    fun `onRecipeUpdated swaps fields by id`() {
        val store = makeStore()
        val base = Recipe(id = "r1", userId = "u1", name = "Pasta", foodIds = listOf("f1"))
        store.onRecipeInserted(base)
        store.onRecipeUpdated(base.copy(name = "Spaghetti"))
        assertEquals("Spaghetti", store.recipes.value.first().name)
    }

    // MARK: - activeKidId

    @Test
    fun `setActiveKid updates StateFlow`() {
        val store = makeStore()
        assertEquals(null, store.activeKidId.value)
        store.setActiveKid("k42")
        assertEquals("k42", store.activeKidId.value)
        store.setActiveKid(null)
        assertEquals(null, store.activeKidId.value)
    }
}
