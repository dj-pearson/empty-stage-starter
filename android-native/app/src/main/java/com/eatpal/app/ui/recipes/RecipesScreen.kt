package com.eatpal.app.ui.recipes

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Event
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material3.Card
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import coil.compose.AsyncImage
import com.eatpal.app.domain.AppStateStore
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
import javax.inject.Inject

/**
 * Recipes library — search + list + detail + edit. Mirrors iOS `RecipesView`.
 * Navigation within the tab uses a local "currentView" state rather than a
 * nested NavHost so the bottom bar stays visible; feels like iOS push/pop.
 */
@Composable
fun RecipesScreen(vm: RecipesViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val toast = rememberToastController()
    var view by remember { mutableStateOf<RecipesView>(RecipesView.List) }

    when (val current = view) {
        is RecipesView.List -> RecipesList(
            state = state,
            onSearch = vm::onSearch,
            onTap = { recipe -> view = RecipesView.Detail(recipe.id) },
            onNew = { view = RecipesView.Edit(initialId = null) },
        )
        is RecipesView.Detail -> {
            val recipe = state.all.firstOrNull { it.id == current.id }
            if (recipe == null) {
                view = RecipesView.List
            } else {
                RecipeDetail(
                    recipe = recipe,
                    foodLookup = state.foodLookup,
                    onBack = { view = RecipesView.List },
                    onEdit = { view = RecipesView.Edit(recipe.id) },
                    onDelete = {
                        vm.delete(recipe.id) { err ->
                            if (err != null) toast.error("Couldn't delete", err)
                            else {
                                toast.success("Deleted ${recipe.name}")
                                view = RecipesView.List
                            }
                        }
                    },
                    onAddToPlanner = { view = RecipesView.AddToPlanner(recipe.id) },
                )
            }
        }
        is RecipesView.Edit -> {
            val initial = current.initialId?.let { id -> state.all.firstOrNull { it.id == id } }
            RecipeEditor(
                initial = initial,
                onCancel = { view = initial?.let { RecipesView.Detail(it.id) } ?: RecipesView.List },
                onSave = { draft ->
                    if (initial == null) {
                        vm.create(draft) { err, newId ->
                            if (err != null) toast.error("Couldn't save", err)
                            else {
                                toast.success("Saved ${draft.name}")
                                view = newId?.let { RecipesView.Detail(it) } ?: RecipesView.List
                            }
                        }
                    } else {
                        vm.update(initial.id, draft) { err ->
                            if (err != null) toast.error("Couldn't save", err)
                            else {
                                toast.success("Saved ${draft.name}")
                                view = RecipesView.Detail(initial.id)
                            }
                        }
                    }
                },
            )
        }
        is RecipesView.AddToPlanner -> {
            val recipe = state.all.firstOrNull { it.id == current.recipeId }
            if (recipe == null) {
                view = RecipesView.List
            } else {
                AddToPlannerSheet(
                    recipe = recipe,
                    kids = state.kids,
                    onCancel = { view = RecipesView.Detail(recipe.id) },
                    onConfirm = { req ->
                        vm.addToPlanner(recipe, req) { err ->
                            if (err != null) toast.error("Couldn't add to plan", err)
                            else {
                                toast.success("Added to ${req.slot.displayName}")
                                view = RecipesView.Detail(recipe.id)
                            }
                        }
                    },
                )
            }
        }
    }
}

private sealed interface RecipesView {
    data object List : RecipesView
    data class Detail(val id: String) : RecipesView
    data class Edit(val initialId: String?) : RecipesView
    data class AddToPlanner(val recipeId: String) : RecipesView
}

@Composable
private fun RecipesList(
    state: RecipesViewModel.UiState,
    onSearch: (String) -> Unit,
    onTap: (Recipe) -> Unit,
    onNew: () -> Unit,
) {
    Scaffold(
        floatingActionButton = {
            FloatingActionButton(onClick = onNew) {
                Icon(Icons.Default.Add, contentDescription = "New recipe")
            }
        },
    ) { inner ->
        Column(modifier = Modifier.fillMaxSize().padding(inner).padding(Spacing.lg)) {
            Text("Recipes", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(Spacing.sm))
            OutlinedTextField(
                value = state.search,
                onValueChange = onSearch,
                label = { Text("Search") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(Spacing.sm))

            if (state.filtered.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(if (state.search.isBlank()) "No recipes yet — tap + to create one." else "No matches.")
                }
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    items(items = state.filtered, key = { it.id }) { recipe ->
                        RecipeRow(recipe = recipe, onTap = { onTap(recipe) })
                    }
                }
            }
        }
    }
}

@Composable
private fun RecipeRow(recipe: Recipe, onTap: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onTap),
        shape = RoundedCornerShape(12.dp),
    ) {
        Row(
            modifier = Modifier.padding(Spacing.md),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            if (recipe.imageUrl != null) {
                AsyncImage(
                    model = recipe.imageUrl,
                    contentDescription = null,
                    modifier = Modifier.size(56.dp),
                    contentScale = ContentScale.Crop,
                )
            } else {
                Icon(
                    Icons.Default.Restaurant,
                    contentDescription = null,
                    modifier = Modifier.size(40.dp),
                )
            }
            Column(modifier = Modifier.fillMaxWidth(1f)) {
                Text(recipe.name, fontWeight = FontWeight.SemiBold)
                val subtitle = buildString {
                    recipe.prepTime?.let { append(it) }
                    recipe.cookTime?.takeIf { it.isNotBlank() }?.let {
                        if (isNotEmpty()) append(" · ")
                        append(it)
                    }
                    recipe.rating?.let {
                        if (isNotEmpty()) append(" · ")
                        append("${"%.1f".format(it)}⭐")
                    }
                }
                if (subtitle.isNotBlank()) {
                    Text(subtitle, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

@HiltViewModel
class RecipesViewModel @Inject constructor(
    private val appState: AppStateStore,
) : ViewModel() {

    data class UiState(
        val all: List<Recipe> = emptyList(),
        val filtered: List<Recipe> = emptyList(),
        val search: String = "",
        val foodLookup: Map<String, String> = emptyMap(),
        val kids: List<com.eatpal.app.models.Kid> = emptyList(),
    )

    private val searchFlow = MutableStateFlow("")

    val state: StateFlow<UiState> = combine(
        combine(appState.recipes, appState.foods, ::Pair),
        searchFlow,
        appState.kids,
    ) { (recipes, foods), q, kids ->
        val query = q.trim().lowercase()
        val filtered = if (query.isBlank()) recipes.sortedBy { it.name.lowercase() }
        else recipes.filter {
            it.name.lowercase().contains(query) ||
                it.description.orEmpty().lowercase().contains(query) ||
                it.tags.orEmpty().any { t -> t.lowercase().contains(query) }
        }.sortedBy { it.name.lowercase() }
        UiState(
            all = recipes,
            filtered = filtered,
            search = q,
            foodLookup = foods.associate { it.id to it.name },
            kids = kids,
        )
    }.stateIn(viewModelScope, SharingStarted.Eagerly, UiState())

    fun onSearch(q: String) {
        searchFlow.value = q
    }

    fun create(draft: RecipeEditorDraft, onResult: (err: String?, newId: String?) -> Unit) {
        val userId = appState.kids.value.firstOrNull()?.userId ?: ""
        val recipe = Recipe(
            id = java.util.UUID.randomUUID().toString(),
            userId = userId,
            name = draft.name,
            description = draft.description,
            instructions = draft.instructions,
            foodIds = draft.foodIds,
            prepTime = draft.prepTime,
            cookTime = draft.cookTime,
            servings = draft.servings,
            additionalIngredients = draft.additionalIngredients,
            tips = draft.tips,
            imageUrl = draft.imageUrl,
            difficultyLevel = draft.difficultyLevel,
        )
        viewModelScope.launch {
            runCatching { appState.addRecipe(recipe) }
                .onSuccess { onResult(null, recipe.id) }
                .onFailure { onResult(it.message, null) }
        }
    }

    fun update(id: String, draft: RecipeEditorDraft, onResult: (err: String?) -> Unit) {
        val updates = com.eatpal.app.models.RecipeUpdate(
            name = draft.name,
            description = draft.description,
            instructions = draft.instructions,
            foodIds = draft.foodIds,
            prepTime = draft.prepTime,
            cookTime = draft.cookTime,
            servings = draft.servings,
            additionalIngredients = draft.additionalIngredients,
            tips = draft.tips,
            imageUrl = draft.imageUrl,
            difficultyLevel = draft.difficultyLevel,
        )
        viewModelScope.launch {
            runCatching { appState.updateRecipe(id, updates) }
                .onSuccess { onResult(null) }
                .onFailure { onResult(it.message) }
        }
    }

    fun delete(id: String, onResult: (err: String?) -> Unit) {
        viewModelScope.launch {
            runCatching { appState.deleteRecipe(id) }
                .onSuccess { onResult(null) }
                .onFailure { onResult(it.message) }
        }
    }

    fun addToPlanner(
        recipe: Recipe,
        req: AddToPlannerRequest,
        onResult: (err: String?) -> Unit,
    ) {
        val userId = appState.kids.value.firstOrNull()?.userId ?: ""
        // Plan entries require a foodId — use the recipe's first ingredient.
        val foodId = recipe.foodIds.firstOrNull()
        if (foodId.isNullOrBlank()) {
            onResult("This recipe has no linked foods. Add at least one ingredient first.")
            return
        }
        val entry = com.eatpal.app.models.PlanEntry(
            id = java.util.UUID.randomUUID().toString(),
            userId = userId,
            kidId = req.kidId,
            date = req.date,
            mealSlot = req.slot.key,
            foodId = foodId,
            recipeId = recipe.id,
        )
        viewModelScope.launch {
            runCatching { appState.addPlanEntry(entry) }
                .onSuccess { onResult(null) }
                .onFailure { onResult(it.message) }
        }
    }
}

data class AddToPlannerRequest(
    val kidId: String,
    val date: String,
    val slot: com.eatpal.app.models.MealSlot,
)
