package com.eatpal.app.ui.mealplan

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.eatpal.app.domain.AppStateStore
import com.eatpal.app.models.Food
import com.eatpal.app.models.Kid
import com.eatpal.app.models.MealSlot
import com.eatpal.app.models.PlanEntry
import com.eatpal.app.models.Recipe
import com.eatpal.app.ui.components.rememberToastController
import com.eatpal.app.ui.theme.Spacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters
import java.util.UUID
import javax.inject.Inject

/**
 * Week-at-a-glance meal plan — iOS `MealPlanView` parity (first pass).
 * Horizontal strip selects the active kid; one card per day with per-slot
 * rows. Tap an empty slot to open the add-meal sheet. AI generation
 * deferred (prd.json US-206).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MealPlanScreen(vm: MealPlanViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val toast = rememberToastController()
    var adding by remember { mutableStateOf<AddSlot?>(null) }
    var deleting by remember { mutableStateOf<PlanEntry?>(null) }

    Scaffold { inner ->
        Column(modifier = Modifier.fillMaxSize().padding(inner).padding(Spacing.lg)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.fillMaxWidth(1f).padding(end = Spacing.sm)) {
                    Text(
                        "Meal plan",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(state.weekLabel, style = MaterialTheme.typography.bodyMedium)
                }
                IconButton(onClick = vm::prevWeek) {
                    Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = "Previous week")
                }
                IconButton(onClick = vm::nextWeek) {
                    Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = "Next week")
                }
            }

            if (state.kids.isNotEmpty()) {
                Spacer(Modifier.size(Spacing.sm))
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.xs),
                ) {
                    state.kids.forEach { kid ->
                        FilterChip(
                            selected = kid.id == state.activeKidId,
                            onClick = { vm.setActiveKid(kid.id) },
                            label = { Text(kid.name) },
                        )
                    }
                }
            }

            Spacer(Modifier.size(Spacing.md))

            if (state.activeKidId == null) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Select a child to see their plan.")
                }
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
                    items(items = state.days, key = { it.date }) { day ->
                        DayCard(
                            day = day,
                            foodLookup = state.foodLookup,
                            recipeLookup = state.recipeLookup,
                            onAdd = { slot -> adding = AddSlot(day.date, slot) },
                            onDelete = { entry -> deleting = entry },
                        )
                    }
                }
            }
        }

        adding?.let { target ->
            val sheetState = rememberModalBottomSheetState()
            val scope = rememberCoroutineScope()
            ModalBottomSheet(
                onDismissRequest = { adding = null },
                sheetState = sheetState,
            ) {
                AddMealForm(
                    foods = state.allFoods,
                    recipes = state.allRecipes,
                    target = target,
                    onCancel = {
                        scope.launch { sheetState.hide() }.invokeOnCompletion { adding = null }
                    },
                    onAdd = { selection ->
                        vm.addEntry(
                            date = target.date,
                            slotKey = target.slot.key,
                            selection = selection,
                        ) { err ->
                            if (err != null) toast.error("Couldn't add meal", err)
                            else toast.success("Added to ${target.slot.displayName}")
                        }
                        scope.launch { sheetState.hide() }.invokeOnCompletion { adding = null }
                    },
                )
            }
        }

        deleting?.let { entry ->
            AlertDialog(
                onDismissRequest = { deleting = null },
                title = { Text("Remove meal?") },
                confirmButton = {
                    TextButton(onClick = {
                        vm.deleteEntry(entry.id) { err ->
                            if (err != null) toast.error("Couldn't remove", err)
                        }
                        deleting = null
                    }) { Text("Remove") }
                },
                dismissButton = {
                    TextButton(onClick = { deleting = null }) { Text("Cancel") }
                },
            )
        }
    }
}

private data class AddSlot(val date: String, val slot: MealSlot)

@Composable
private fun DayCard(
    day: MealPlanViewModel.Day,
    foodLookup: Map<String, String>,
    recipeLookup: Map<String, String>,
    onAdd: (MealSlot) -> Unit,
    onDelete: (PlanEntry) -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
        Column(
            modifier = Modifier.padding(Spacing.md),
            verticalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            Text(day.label, fontWeight = FontWeight.SemiBold)
            MealSlot.entries.forEach { slot ->
                val entry = day.entries.firstOrNull { it.mealSlot == slot.key }
                SlotRow(
                    slot = slot,
                    entry = entry,
                    foodLookup = foodLookup,
                    recipeLookup = recipeLookup,
                    onTap = { onAdd(slot) },
                    onDelete = onDelete,
                )
            }
        }
    }
}

@Composable
private fun SlotRow(
    slot: MealSlot,
    entry: PlanEntry?,
    foodLookup: Map<String, String>,
    recipeLookup: Map<String, String>,
    onTap: () -> Unit,
    onDelete: (PlanEntry) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = entry == null) { onTap() },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            slot.displayName,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.fillMaxWidth(0.3f),
        )
        if (entry == null) {
            AssistChip(onClick = onTap, label = { Text("+ add") })
        } else {
            val name = entry.recipeId?.let { recipeLookup[it] }
                ?: foodLookup[entry.foodId]
                ?: "Unnamed"
            Text(name, modifier = Modifier.fillMaxWidth(1f).padding(end = Spacing.sm))
            IconButton(onClick = { onDelete(entry) }) {
                Icon(Icons.Default.Delete, contentDescription = "Remove")
            }
        }
    }
}

@Composable
private fun AddMealForm(
    foods: List<Food>,
    recipes: List<Recipe>,
    target: AddSlot,
    onCancel: () -> Unit,
    onAdd: (MealPlanViewModel.Selection) -> Unit,
) {
    var mode by remember { mutableStateOf(Mode.FOOD) }
    var query by remember { mutableStateOf("") }
    var selectedFoodId by remember { mutableStateOf<String?>(null) }
    var selectedRecipeId by remember { mutableStateOf<String?>(null) }

    Column(
        modifier = Modifier.fillMaxWidth().padding(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.sm),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                "Add to ${target.slot.displayName}, ${target.date}",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.fillMaxWidth(1f / 3f))
            IconButton(onClick = onCancel) {
                Icon(Icons.Default.Close, contentDescription = "Close")
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
            FilterChip(selected = mode == Mode.FOOD, onClick = { mode = Mode.FOOD }, label = { Text("Food") })
            FilterChip(selected = mode == Mode.RECIPE, onClick = { mode = Mode.RECIPE }, label = { Text("Recipe") })
        }

        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            label = { Text("Search") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )

        val q = query.trim().lowercase()
        when (mode) {
            Mode.FOOD -> {
                val results = if (q.isBlank()) foods.sortedBy { it.name.lowercase() }
                else foods.filter { it.name.lowercase().contains(q) }.sortedBy { it.name.lowercase() }
                ResultColumn(
                    rows = results.map { it.id to it.name },
                    selectedId = selectedFoodId,
                    onSelect = {
                        selectedFoodId = it
                        selectedRecipeId = null
                    },
                )
            }
            Mode.RECIPE -> {
                val results = if (q.isBlank()) recipes.sortedBy { it.name.lowercase() }
                else recipes.filter { it.name.lowercase().contains(q) }.sortedBy { it.name.lowercase() }
                ResultColumn(
                    rows = results.map { it.id to it.name },
                    selectedId = selectedRecipeId,
                    onSelect = {
                        selectedRecipeId = it
                        selectedFoodId = null
                    },
                )
            }
        }

        Button(
            onClick = {
                val sel = when (mode) {
                    Mode.FOOD -> selectedFoodId?.let { MealPlanViewModel.Selection.FoodRef(it) }
                    Mode.RECIPE -> selectedRecipeId?.let { MealPlanViewModel.Selection.RecipeRef(it) }
                } ?: return@Button
                onAdd(sel)
            },
            enabled = selectedFoodId != null || selectedRecipeId != null,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Add")
        }
    }
}

@Composable
private fun ResultColumn(
    rows: List<Pair<String, String>>,
    selectedId: String?,
    onSelect: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        if (rows.isEmpty()) Text("No matches.")
        rows.take(30).forEach { (id, name) ->
            val selected = id == selectedId
            Text(
                name,
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                color = if (selected) MaterialTheme.colorScheme.primary else Color.Unspecified,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onSelect(id) }
                    .padding(Spacing.xs),
            )
        }
    }
}

private enum class Mode { FOOD, RECIPE }

@HiltViewModel
class MealPlanViewModel @Inject constructor(
    private val appState: AppStateStore,
) : ViewModel() {

    sealed interface Selection {
        data class FoodRef(val foodId: String) : Selection
        data class RecipeRef(val recipeId: String) : Selection
    }

    data class Day(val date: String, val label: String, val entries: List<PlanEntry>)

    data class UiState(
        val weekStart: LocalDate = LocalDate.now().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)),
        val weekLabel: String = "",
        val days: List<Day> = emptyList(),
        val kids: List<Kid> = emptyList(),
        val activeKidId: String? = null,
        val allFoods: List<Food> = emptyList(),
        val allRecipes: List<Recipe> = emptyList(),
        val foodLookup: Map<String, String> = emptyMap(),
        val recipeLookup: Map<String, String> = emptyMap(),
    )

    private val weekStartFlow = MutableStateFlow(
        LocalDate.now().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
    )

    val state: StateFlow<UiState> = combine(
        combine(appState.planEntries, appState.activeKidId, ::Pair),
        combine(appState.foods, appState.recipes, ::Pair),
        combine(appState.kids, weekStartFlow, ::Pair),
    ) { (plan, kidId), (foods, recipes), (kids, weekStart) ->
        val fmt = DateTimeFormatter.ISO_LOCAL_DATE
        val days = (0..6).map { offset ->
            val d = weekStart.plusDays(offset.toLong())
            val iso = d.format(fmt)
            val entries = plan.filter {
                it.date == iso && (kidId == null || it.kidId == kidId)
            }
            Day(
                date = iso,
                label = "${d.dayOfWeek.name.take(3).lowercase().replaceFirstChar(Char::uppercase)} $iso",
                entries = entries,
            )
        }
        val weekEnd = weekStart.plusDays(6)
        UiState(
            weekStart = weekStart,
            weekLabel = "${weekStart.format(fmt)} → ${weekEnd.format(fmt)}",
            days = days,
            kids = kids,
            activeKidId = kidId,
            allFoods = foods,
            allRecipes = recipes,
            foodLookup = foods.associate { it.id to it.name },
            recipeLookup = recipes.associate { it.id to it.name },
        )
    }.stateIn(viewModelScope, SharingStarted.Eagerly, UiState())

    fun prevWeek() {
        weekStartFlow.value = weekStartFlow.value.minusDays(7)
    }

    fun nextWeek() {
        weekStartFlow.value = weekStartFlow.value.plusDays(7)
    }

    fun setActiveKid(id: String) {
        appState.setActiveKid(id)
    }

    fun addEntry(
        date: String,
        slotKey: String,
        selection: Selection,
        onResult: (err: String?) -> Unit,
    ) {
        val activeKidId = appState.activeKidId.value ?: return onResult("No child selected.")
        val userId = appState.kids.value.firstOrNull { it.id == activeKidId }?.userId
            ?: appState.kids.value.firstOrNull()?.userId
            ?: ""

        val (foodId, recipeId) = when (selection) {
            is Selection.FoodRef -> selection.foodId to null
            is Selection.RecipeRef -> {
                val rec = appState.recipes.value.firstOrNull { it.id == selection.recipeId }
                val firstFood = rec?.foodIds?.firstOrNull()
                if (firstFood.isNullOrBlank()) {
                    return onResult("This recipe has no linked foods. Add ingredients first.")
                }
                firstFood to selection.recipeId
            }
        }

        val entry = PlanEntry(
            id = UUID.randomUUID().toString(),
            userId = userId,
            kidId = activeKidId,
            date = date,
            mealSlot = slotKey,
            foodId = foodId,
            recipeId = recipeId,
        )
        viewModelScope.launch {
            runCatching { appState.addPlanEntry(entry) }
                .onSuccess { onResult(null) }
                .onFailure { onResult(it.message) }
        }
    }

    fun deleteEntry(id: String, onResult: (err: String?) -> Unit) {
        viewModelScope.launch {
            runCatching { appState.deletePlanEntry(id) }
                .onSuccess { onResult(null) }
                .onFailure { onResult(it.message) }
        }
    }
}
