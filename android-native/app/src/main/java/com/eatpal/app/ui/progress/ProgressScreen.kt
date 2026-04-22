package com.eatpal.app.ui.progress

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.eatpal.app.domain.AppStateStore
import com.eatpal.app.models.MealResult
import com.eatpal.app.ui.theme.Spacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import javax.inject.Inject

/**
 * Data-driven progress dashboard — variety score, ate/tasted/refused counts
 * for the last 30 days, pantry breadth. Lightweight first pass; a Vico- or
 * Canvas-based chart can replace the bars later.
 */
@Composable
fun ProgressScreen(vm: ProgressViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
    ) {
        Text(
            "Progress",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
        )
        state.activeKidName?.let { Text("For $it · last 30 days") }

        StatCard("Variety score", "${state.varietyScore}", "Unique foods tried")

        Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
            Column(
                modifier = Modifier.padding(Spacing.lg),
                verticalArrangement = Arrangement.spacedBy(Spacing.sm),
            ) {
                Text("Meal outcomes", fontWeight = FontWeight.SemiBold)
                HorizontalDivider()
                MealBar(
                    label = "Ate",
                    value = state.ate,
                    total = state.totalOutcomes.coerceAtLeast(1),
                    color = Color(0xFF2E7D5B),
                )
                MealBar(
                    label = "Tasted",
                    value = state.tasted,
                    total = state.totalOutcomes.coerceAtLeast(1),
                    color = Color(0xFFF79D65),
                )
                MealBar(
                    label = "Refused",
                    value = state.refused,
                    total = state.totalOutcomes.coerceAtLeast(1),
                    color = Color(0xFFB00020),
                )
                if (state.totalOutcomes == 0) {
                    Text(
                        "No meals logged yet. Mark meals as eaten/tasted/refused on the plan to see stats here.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }

        StatCard("Pantry breadth", "${state.pantrySize} items", "${state.safeCount} marked safe")
        StatCard("Recipes", "${state.recipeCount}", "${state.plannedMeals} planned meals this month")
    }
}

@Composable
private fun StatCard(title: String, value: String, subtitle: String) {
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Text(title, fontWeight = FontWeight.SemiBold)
            Text(value, style = MaterialTheme.typography.headlineMedium)
            Text(subtitle, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun MealBar(label: String, value: Int, total: Int, color: Color) {
    Column {
        Row {
            Text(label, modifier = Modifier.fillMaxWidth(0.3f))
            Text("$value", fontWeight = FontWeight.SemiBold)
        }
        val fraction = (value.toFloat() / total.toFloat()).coerceIn(0f, 1f)
        Surface(
            shape = RoundedCornerShape(4.dp),
            color = Color(0xFFEEEEEE),
            modifier = Modifier.fillMaxWidth().height(6.dp),
        ) {
            Box {
                Surface(
                    shape = RoundedCornerShape(4.dp),
                    color = color,
                    modifier = Modifier.fillMaxWidth(fraction).height(6.dp),
                ) { Box {} }
            }
        }
    }
}

@HiltViewModel
class ProgressViewModel @Inject constructor(
    appState: AppStateStore,
) : ViewModel() {

    data class UiState(
        val activeKidName: String? = null,
        val varietyScore: Int = 0,
        val ate: Int = 0,
        val tasted: Int = 0,
        val refused: Int = 0,
        val totalOutcomes: Int = 0,
        val pantrySize: Int = 0,
        val safeCount: Int = 0,
        val recipeCount: Int = 0,
        val plannedMeals: Int = 0,
    )

    val state: StateFlow<UiState> = combine(
        combine(appState.activeKidId, appState.kids, ::Pair),
        combine(appState.planEntries, appState.foods, ::Pair),
        appState.recipes,
    ) { (kidId, kids), (plan, foods), recipes ->
        val fmt = DateTimeFormatter.ISO_LOCAL_DATE
        val cutoff = LocalDate.now().minusDays(30).format(fmt)

        val windowed = plan.filter { it.date >= cutoff && (kidId == null || it.kidId == kidId) }
        val outcomes = windowed.mapNotNull { it.result }
        val variety = windowed.map { it.foodId }.toSet().size

        UiState(
            activeKidName = kids.firstOrNull { it.id == kidId }?.name,
            varietyScore = variety,
            ate = outcomes.count { it == MealResult.ATE.key },
            tasted = outcomes.count { it == MealResult.TASTED.key },
            refused = outcomes.count { it == MealResult.REFUSED.key },
            totalOutcomes = outcomes.size,
            pantrySize = foods.size,
            safeCount = foods.count { it.isSafe },
            recipeCount = recipes.size,
            plannedMeals = windowed.size,
        )
    }.stateIn(viewModelScope, SharingStarted.Eagerly, UiState())
}
