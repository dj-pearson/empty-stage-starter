package com.eatpal.app.ui.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.eatpal.app.domain.AppStateStore
import com.eatpal.app.models.Food
import com.eatpal.app.models.GroceryItem
import com.eatpal.app.models.Kid
import com.eatpal.app.models.MealSlot
import com.eatpal.app.models.PlanEntry
import com.eatpal.app.models.Recipe
import com.eatpal.app.ui.theme.Spacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import javax.inject.Inject

/**
 * Today-at-a-glance dashboard mirroring iOS `DashboardHomeView` — active
 * kid's meals by slot, grocery count, pantry-low count. Reads exclusively
 * from [AppStateStore].
 */
@Composable
fun DashboardScreen(vm: DashboardViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
    ) {
        Text("Today", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)

        state.activeKidName?.let {
            Text("For $it", style = MaterialTheme.typography.titleSmall)
        } ?: Text("No child selected — add one under Kids.")

        Card {
            Column(
                modifier = Modifier.padding(Spacing.lg),
                verticalArrangement = Arrangement.spacedBy(Spacing.sm),
            ) {
                Text("Meals", fontWeight = FontWeight.SemiBold)
                HorizontalDivider()
                if (state.todaysMeals.isEmpty()) {
                    Text("No meals planned yet.", style = MaterialTheme.typography.bodyMedium)
                } else {
                    state.todaysMeals.forEach { row ->
                        Text("• ${row.slotLabel}: ${row.foodName}")
                    }
                }
            }
        }

        Card {
            Column(
                modifier = Modifier.padding(Spacing.lg),
                verticalArrangement = Arrangement.spacedBy(Spacing.sm),
            ) {
                Text("Quick counts", fontWeight = FontWeight.SemiBold)
                HorizontalDivider()
                Text("Grocery items to buy: ${state.groceryUnchecked}")
                Text("Pantry items running low: ${state.pantryLow}")
                Text("Recipes in library: ${state.recipeCount}")
            }
        }
    }
}

@HiltViewModel
class DashboardViewModel @Inject constructor(appState: AppStateStore) : ViewModel() {

    data class MealRow(val slotLabel: String, val foodName: String)

    data class UiState(
        val activeKidName: String? = null,
        val todaysMeals: List<MealRow> = emptyList(),
        val groceryUnchecked: Int = 0,
        val pantryLow: Int = 0,
        val recipeCount: Int = 0,
    )

    private data class Bundle(
        val activeKidId: String?,
        val kids: List<Kid>,
        val plan: List<PlanEntry>,
        val foods: List<Food>,
        val recipes: List<Recipe>,
        val grocery: List<GroceryItem>,
    )

    // kotlinx.coroutines.flow.combine typed overloads top out at 5 flows, so
    // we fold two pairs first, then join those with the final single flows.
    private val bundle = combine(
        combine(appState.activeKidId, appState.kids, ::Pair),
        combine(appState.planEntries, appState.foods, ::Pair),
        combine(appState.recipes, appState.groceryItems, ::Pair),
    ) { (kidId, kids), (plan, foods), (recipes, grocery) ->
        Bundle(kidId, kids, plan, foods, recipes, grocery)
    }

    val state: StateFlow<UiState> = bundle.map { b ->
        val today = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE)
        val todays = b.plan.filter {
            it.date == today && (b.activeKidId == null || it.kidId == b.activeKidId)
        }
        val rows = MealSlot.entries.mapNotNull { slot ->
            val entry = todays.firstOrNull { it.mealSlot == slot.key } ?: return@mapNotNull null
            val name = entry.recipeId
                ?.let { rid -> b.recipes.firstOrNull { it.id == rid }?.name }
                ?: b.foods.firstOrNull { it.id == entry.foodId }?.name
                ?: "Unnamed"
            MealRow(slotLabel = slot.displayName, foodName = name)
        }
        UiState(
            activeKidName = b.kids.firstOrNull { it.id == b.activeKidId }?.name,
            todaysMeals = rows,
            groceryUnchecked = b.grocery.count { !it.checked },
            pantryLow = b.foods.count { (it.quantity ?: 0.0) in 0.01..2.0 },
            recipeCount = b.recipes.size,
        )
    }.stateIn(viewModelScope, SharingStarted.Eagerly, UiState())
}
