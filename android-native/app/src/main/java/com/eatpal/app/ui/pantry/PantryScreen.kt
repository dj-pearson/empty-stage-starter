package com.eatpal.app.ui.pantry

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.Card
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
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
import com.eatpal.app.models.FoodUpdate
import com.eatpal.app.ui.components.rememberToastController
import com.eatpal.app.ui.theme.Spacing
import com.eatpal.app.util.HapticManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Pantry browser — iOS `PantryView` parity (basic). Shows foods grouped by
 * category with qty. Low-stock (0 < qty <= 2) rows get an amber highlight
 * matching the iOS widget's pantry-low count logic. Barcode scanning and
 * add-from-library are pending (prd.json US-208).
 */
@Composable
fun PantryScreen(vm: PantryViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val toast = rememberToastController()

    Column(
        modifier = Modifier.fillMaxSize().padding(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
    ) {
        Text("Pantry", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Text("${state.lowCount} running low · ${state.totalCount} total")
        HorizontalDivider()

        if (state.groups.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No foods yet. Scan a barcode or add via recipes.")
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(Spacing.sm),
            ) {
                state.groups.forEach { (category, rows) ->
                    item(key = "header-$category") {
                        Text(
                            category.ifBlank { "Other" },
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(top = Spacing.sm),
                        )
                    }
                    items(items = rows, key = { it.id }) { food ->
                        PantryRow(
                            food = food,
                            onDecrement = {
                                vm.decrement(food) { err ->
                                    if (err != null) toast.error("Couldn't update", err)
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PantryRow(food: Food, onDecrement: () -> Unit) {
    val isLow = (food.quantity ?: 0.0) in 0.01..2.0
    val amber = Color(0xFFFFF4C2)
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .then(if (isLow) Modifier.background(amber) else Modifier)
                .padding(Spacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.fillMaxWidth(1f).padding(end = Spacing.sm)) {
                Text(food.name, fontWeight = FontWeight.Medium)
                val qty = food.quantity ?: 0.0
                val unit = food.unit ?: "ea"
                val display = if (qty == qty.toLong().toDouble()) qty.toLong().toString() else qty.toString()
                Text("$display $unit", style = MaterialTheme.typography.bodySmall)
            }
            FilledTonalIconButton(onClick = onDecrement, enabled = (food.quantity ?: 0.0) > 0.0) {
                Icon(Icons.Default.Remove, contentDescription = "Use one")
            }
        }
    }
}

@HiltViewModel
class PantryViewModel @Inject constructor(
    private val appState: AppStateStore,
    private val haptics: HapticManager,
) : ViewModel() {

    data class UiState(
        val groups: List<Pair<String, List<Food>>> = emptyList(),
        val totalCount: Int = 0,
        val lowCount: Int = 0,
    )

    val state: StateFlow<UiState> = appState.foods.map { foods ->
        UiState(
            groups = foods
                .sortedWith(compareBy({ it.category }, { it.name.lowercase() }))
                .groupBy { it.category }
                .toList(),
            totalCount = foods.size,
            lowCount = foods.count { (it.quantity ?: 0.0) in 0.01..2.0 },
        )
    }.stateIn(viewModelScope, SharingStarted.Eagerly, UiState())

    fun decrement(food: Food, onResult: (err: String?) -> Unit) {
        val next = ((food.quantity ?: 0.0) - 1.0).coerceAtLeast(0.0)
        haptics.lightImpact()
        viewModelScope.launch {
            runCatching {
                appState.updateFood(food.id, FoodUpdate(quantity = next))
            }
                .onSuccess { onResult(null) }
                .onFailure { onResult(it.message) }
        }
    }
}
