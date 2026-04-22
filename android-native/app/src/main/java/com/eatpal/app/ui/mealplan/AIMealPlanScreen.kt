package com.eatpal.app.ui.mealplan

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.eatpal.app.data.remote.AIMealService
import com.eatpal.app.domain.AppStateStore
import com.eatpal.app.models.MealSlot
import com.eatpal.app.models.PlanEntry
import com.eatpal.app.ui.components.rememberToastController
import com.eatpal.app.ui.theme.Spacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.UUID
import javax.inject.Inject

/**
 * AI-generated meal plan for a single day. Matches iOS `AIMealPlanView`
 * layout — active-kid badge, date picker, Generate button, result card per
 * slot with reasoning + "Approve all" / "Regenerate" actions.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AIMealPlanScreen(vm: AIMealPlanViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val toast = rememberToastController()

    Scaffold { inner ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(inner)
                .verticalScroll(rememberScrollState())
                .padding(Spacing.lg),
            verticalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            Text(
                "AI meal plan",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
            )
            state.activeKidName?.let { Text("For $it") }
                ?: Text("Select a child first (Kids tab).")

            OutlinedTextField(
                value = state.date,
                onValueChange = vm::onDateChange,
                label = { Text("Date (YYYY-MM-DD)") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii),
                modifier = Modifier.fillMaxWidth(),
            )

            Button(
                onClick = vm::generate,
                enabled = !state.isLoading && state.activeKidId != null,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (state.isLoading) {
                    CircularProgressIndicator(modifier = Modifier.padding(end = Spacing.sm))
                    Text("Generating…")
                } else {
                    Text(if (state.suggestions.isEmpty()) "Generate suggestions" else "Regenerate")
                }
            }

            state.error?.let {
                Text(
                    "Using local fallback — edge function unavailable ($it)",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }

            if (state.suggestions.isEmpty()) {
                Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Text("No suggestions yet.")
                }
            } else {
                // One card per slot the model returned.
                state.suggestions.forEach { s ->
                    SuggestionCard(
                        suggestion = s,
                        accepted = s.id in state.acceptedIds,
                        onAccept = { vm.acceptOne(s) },
                    )
                }

                HorizontalDivider()
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    OutlinedButton(
                        onClick = { vm.clear() },
                        modifier = Modifier.fillMaxWidth(0.5f),
                    ) { Text("Clear") }
                    Button(
                        onClick = {
                            vm.acceptAll { added, err ->
                                if (err != null) toast.error("Couldn't save plan", err)
                                else toast.success("Added $added meals to plan")
                            }
                        },
                        enabled = state.suggestions.any { it.id !in state.acceptedIds },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("Approve all") }
                }
            }
        }
    }
}

@Composable
private fun SuggestionCard(
    suggestion: AIMealService.MealSuggestion,
    accepted: Boolean,
    onAccept: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(Spacing.lg),
            verticalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                val slot = MealSlot.fromKey(suggestion.mealSlot)
                Text(
                    slot?.displayName ?: suggestion.mealSlot,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.fillMaxWidth(0.4f))
                FilterChip(
                    selected = accepted,
                    onClick = onAccept,
                    label = { Text(if (accepted) "Added" else "Add") },
                    enabled = !accepted,
                )
            }
            Text(suggestion.foodName, fontWeight = FontWeight.SemiBold)
            Text(suggestion.reasoning, style = MaterialTheme.typography.bodySmall)
            suggestion.nutritionNote?.takeIf { it.isNotBlank() }?.let {
                Text(it, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@HiltViewModel
class AIMealPlanViewModel @Inject constructor(
    private val appState: AppStateStore,
    private val aiMeal: AIMealService,
) : ViewModel() {

    data class UiState(
        val date: String = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE),
        val activeKidId: String? = null,
        val activeKidName: String? = null,
        val isLoading: Boolean = false,
        val suggestions: List<AIMealService.MealSuggestion> = emptyList(),
        val acceptedIds: Set<String> = emptySet(),
        val error: String? = null,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            appState.activeKidId.collect { id ->
                _state.update {
                    it.copy(
                        activeKidId = id,
                        activeKidName = appState.kids.value.firstOrNull { k -> k.id == id }?.name,
                    )
                }
            }
        }
    }

    fun onDateChange(v: String) = _state.update { it.copy(date = v) }

    fun generate() {
        val kidId = _state.value.activeKidId ?: return
        val kid = appState.kids.value.firstOrNull { it.id == kidId } ?: return
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null, acceptedIds = emptySet()) }
            val result = aiMeal.generate(
                kid = kid,
                date = _state.value.date,
                foods = appState.foods.value,
                recentEntries = appState.planEntries.value.filter { it.kidId == kidId }
                    .sortedByDescending { it.date },
                allFoods = appState.foods.value,
            )
            _state.update {
                it.copy(
                    isLoading = false,
                    suggestions = result.suggestions,
                    error = result.error,
                )
            }
        }
    }

    fun clear() = _state.update {
        it.copy(suggestions = emptyList(), acceptedIds = emptySet(), error = null)
    }

    fun acceptOne(suggestion: AIMealService.MealSuggestion) {
        val kidId = _state.value.activeKidId ?: return
        val userId = appState.kids.value.firstOrNull { it.id == kidId }?.userId ?: return
        val foodId = resolveFoodId(suggestion) ?: return

        viewModelScope.launch {
            val entry = PlanEntry(
                id = UUID.randomUUID().toString(),
                userId = userId,
                kidId = kidId,
                date = _state.value.date,
                mealSlot = suggestion.mealSlot,
                foodId = foodId,
            )
            runCatching { appState.addPlanEntry(entry) }
                .onSuccess { _state.update { s -> s.copy(acceptedIds = s.acceptedIds + suggestion.id) } }
        }
    }

    fun acceptAll(onResult: (added: Int, err: String?) -> Unit) {
        val kidId = _state.value.activeKidId ?: return onResult(0, "No active child.")
        val userId = appState.kids.value.firstOrNull { it.id == kidId }?.userId ?: ""
        val date = _state.value.date

        viewModelScope.launch {
            var added = 0
            for (s in _state.value.suggestions) {
                if (s.id in _state.value.acceptedIds) continue
                val foodId = resolveFoodId(s) ?: continue
                val entry = PlanEntry(
                    id = UUID.randomUUID().toString(),
                    userId = userId,
                    kidId = kidId,
                    date = date,
                    mealSlot = s.mealSlot,
                    foodId = foodId,
                )
                val r = runCatching { appState.addPlanEntry(entry) }
                if (r.isFailure) return@launch onResult(added, r.exceptionOrNull()?.message)
                _state.update { st -> st.copy(acceptedIds = st.acceptedIds + s.id) }
                added += 1
            }
            onResult(added, null)
        }
    }

    /**
     * A PlanEntry requires a valid food_id (NOT NULL UUID in Postgres). If
     * the AI returned a food_id we trust it; otherwise we resolve by name
     * against the user's pantry. Dropping the suggestion is safer than
     * inserting a bogus foreign key.
     */
    private fun resolveFoodId(s: AIMealService.MealSuggestion): String? {
        s.foodId?.takeIf { UUID_REGEX.matches(it) }?.let { return it }
        return appState.foods.value
            .firstOrNull { it.name.equals(s.foodName, ignoreCase = true) }
            ?.id
    }

    companion object {
        private val UUID_REGEX =
            Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
    }
}
