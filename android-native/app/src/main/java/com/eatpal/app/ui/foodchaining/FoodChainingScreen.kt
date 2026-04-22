package com.eatpal.app.ui.foodchaining

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
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
import com.eatpal.app.ui.theme.Spacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

/**
 * Food chaining — suggest "try bite" candidates that share a category with
 * a food the child already safely eats. Simplified first pass mirroring iOS
 * `FoodChainingView` intent; real similarity modelling is a follow-up.
 */
@Composable
fun FoodChainingScreen(vm: FoodChainingViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
    ) {
        Text(
            "Food chaining",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
        )
        Text(
            "Start with a food they safely eat, then try one from its chain. Keep portions tiny — the win is one tiny bite.",
            style = MaterialTheme.typography.bodySmall,
        )

        if (state.chains.isEmpty()) {
            Text("Mark some foods as safe on the pantry tab to see chain suggestions.")
        } else {
            state.chains.forEach { chain ->
                ChainCard(chain)
            }
        }
    }
}

@Composable
private fun ChainCard(chain: FoodChainingViewModel.Chain) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(Spacing.lg),
            verticalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            Text("From: ${chain.seed.name}", fontWeight = FontWeight.SemiBold)
            Text("Category: ${chain.seed.category}", style = MaterialTheme.typography.bodySmall)
            HorizontalDivider()
            Text("Try-bite candidates:", fontWeight = FontWeight.Medium)
            if (chain.candidates.isEmpty()) {
                Text(
                    "No suggestions yet — add more foods to the same category to unlock chains.",
                    style = MaterialTheme.typography.bodySmall,
                )
            } else {
                chain.candidates.forEach { c -> Text("• ${c.name}") }
            }
        }
    }
}

@HiltViewModel
class FoodChainingViewModel @Inject constructor(
    appState: AppStateStore,
) : ViewModel() {

    data class Chain(val seed: Food, val candidates: List<Food>)
    data class UiState(val chains: List<Chain> = emptyList())

    val state: StateFlow<UiState> = appState.foods.map { foods ->
        val safe = foods.filter { it.isSafe && !it.isTryBite }
        val byCategory = foods.groupBy { it.category }
        val chains = safe.map { seed ->
            val candidates = byCategory[seed.category]
                .orEmpty()
                .filter { it.id != seed.id && !it.isSafe }
                .sortedBy { it.name.lowercase() }
                .take(5)
            Chain(seed, candidates)
        }.filter { it.candidates.isNotEmpty() }
        UiState(chains = chains)
    }.stateIn(viewModelScope, SharingStarted.Eagerly, UiState())
}
