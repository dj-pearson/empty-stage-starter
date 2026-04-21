package com.eatpal.app.ui.grocery

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.eatpal.app.domain.AppStateStore
import com.eatpal.app.domain.GroceryGeneratorService
import com.eatpal.app.models.GroceryItem
import com.eatpal.app.models.GroceryItemUpdate
import com.eatpal.app.ui.components.rememberToastController
import com.eatpal.app.ui.theme.Spacing
import com.eatpal.app.util.HapticManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

/**
 * Mirrors iOS `GroceryView`: items grouped by category with checkbox toggle,
 * swipe-to-delete (via delete icon for now — US-204 follow-up can add
 * SwipeToDismissBox), add-item sheet, and a 'Clear completed' action. Routes
 * all writes through [AppStateStore] so offline queue semantics apply.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GroceryScreen(vm: GroceryViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val toast = rememberToastController()
    var showAddSheet by remember { mutableStateOf(false) }
    var showTextImport by remember { mutableStateOf(false) }

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(onClick = { showAddSheet = true }) {
                Icon(Icons.Default.Add, contentDescription = "Add item")
            }
        },
    ) { inner ->
        Column(modifier = Modifier.fillMaxSize().padding(inner).padding(Spacing.lg)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.fillMaxWidth().padding(end = Spacing.sm)) {
                    Text(
                        "Grocery",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold,
                    )
                    Text("${state.uncheckedCount} unchecked · ${state.items.size} total")
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                if (state.checkedCount > 0) {
                    TextButton(onClick = {
                        vm.clearChecked { count, err ->
                            if (err != null) toast.error("Couldn't clear", err)
                            else toast.success("Cleared $count items")
                        }
                    }) {
                        Text("Clear ${state.checkedCount} completed")
                    }
                }
                TextButton(onClick = {
                    vm.generateFromPlan { count, err ->
                        if (err != null) toast.error("Couldn't generate", err)
                        else if (count == 0) toast.info("No items needed", "Your plan is fully covered.")
                        else toast.success("Added $count items")
                    }
                }) {
                    Text("Generate from plan")
                }
                TextButton(onClick = { showTextImport = true }) {
                    Text("Paste list")
                }
            }

            HorizontalDivider(modifier = Modifier.padding(vertical = Spacing.sm))

            if (state.items.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("Your grocery list is empty. Tap + to add.")
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(Spacing.sm),
                ) {
                    state.groups.forEach { (category, rows) ->
                        item(key = "header-$category") {
                            Text(
                                category,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(top = Spacing.sm),
                            )
                        }
                        items(items = rows, key = { it.id }) { item ->
                            GroceryRow(
                                item = item,
                                onToggle = { vm.toggle(item) },
                                onDelete = {
                                    vm.delete(item) { err ->
                                        if (err != null) toast.error("Couldn't delete", err)
                                    }
                                },
                            )
                        }
                    }
                }
            }
        }

        if (showAddSheet) {
            val sheetState = rememberModalBottomSheetState()
            val scope = rememberCoroutineScope()
            ModalBottomSheet(
                onDismissRequest = { showAddSheet = false },
                sheetState = sheetState,
            ) {
                AddItemForm(
                    onCancel = {
                        scope.launch { sheetState.hide() }.invokeOnCompletion { showAddSheet = false }
                    },
                    onAdd = { draft ->
                        vm.add(draft) { err ->
                            if (err != null) toast.error("Couldn't add", err)
                            else toast.success("Added ${draft.name}")
                        }
                        scope.launch { sheetState.hide() }.invokeOnCompletion { showAddSheet = false }
                    },
                )
            }
        }

        if (showTextImport) {
            val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
            val scope = rememberCoroutineScope()
            ModalBottomSheet(
                onDismissRequest = { showTextImport = false },
                sheetState = sheetState,
            ) {
                TextImportSheet(
                    onCancel = {
                        scope.launch { sheetState.hide() }.invokeOnCompletion { showTextImport = false }
                    },
                    onAdd = { parsedItems ->
                        vm.bulkAdd(parsedItems) { added, err ->
                            if (err != null) toast.error("Couldn't add", err)
                            else toast.success("Added $added items")
                        }
                        scope.launch { sheetState.hide() }.invokeOnCompletion { showTextImport = false }
                    },
                )
            }
        }
    }
}

@Composable
private fun GroceryRow(
    item: GroceryItem,
    onToggle: () -> Unit,
    onDelete: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onToggle() }
            .padding(vertical = Spacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(checked = item.checked, onCheckedChange = { onToggle() })
        Column(modifier = Modifier.padding(start = Spacing.sm)) {
            Text(
                item.name,
                textDecoration = if (item.checked) TextDecoration.LineThrough else null,
            )
            val qty = "${item.quantity.trimTrailingZero()} ${item.unit}"
            Text(qty, style = MaterialTheme.typography.bodySmall)
        }
        Spacer(modifier = Modifier.height(0.dp).padding(end = Spacing.sm))
        IconButton(onClick = onDelete, modifier = Modifier.padding(start = Spacing.sm)) {
            Icon(Icons.Default.Delete, contentDescription = "Delete")
        }
    }
}

private fun Double.trimTrailingZero(): String =
    if (this == this.toLong().toDouble()) this.toLong().toString() else this.toString()

@Composable
private fun AddItemForm(onCancel: () -> Unit, onAdd: (GroceryViewModel.Draft) -> Unit) {
    var name by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("other") }
    var quantity by remember { mutableStateOf("1") }
    var unit by remember { mutableStateOf("ea") }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.sm),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Add item", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Spacer(modifier = Modifier.fillMaxWidth(1f / 3f))
            IconButton(onClick = onCancel) {
                Icon(Icons.Default.Close, contentDescription = "Close")
            }
        }
        OutlinedTextField(
            value = name,
            onValueChange = { name = it },
            label = { Text("Name") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            OutlinedTextField(
                value = quantity,
                onValueChange = { quantity = it },
                label = { Text("Qty") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.fillMaxWidth(0.3f),
            )
            OutlinedTextField(
                value = unit,
                onValueChange = { unit = it },
                label = { Text("Unit") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(0.5f),
            )
            OutlinedTextField(
                value = category,
                onValueChange = { category = it },
                label = { Text("Category") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        Button(
            onClick = {
                val qty = quantity.toDoubleOrNull() ?: 1.0
                onAdd(GroceryViewModel.Draft(name = name.trim(), category = category, quantity = qty, unit = unit))
            },
            enabled = name.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Add")
        }
    }
}

@HiltViewModel
class GroceryViewModel @Inject constructor(
    private val appState: AppStateStore,
    private val haptics: HapticManager,
    private val generator: GroceryGeneratorService,
) : ViewModel() {

    data class Draft(
        val name: String,
        val category: String = "other",
        val quantity: Double = 1.0,
        val unit: String = "ea",
    )

    data class UiState(
        val items: List<GroceryItem> = emptyList(),
        val groups: List<Pair<String, List<GroceryItem>>> = emptyList(),
        val uncheckedCount: Int = 0,
        val checkedCount: Int = 0,
    )

    val state: StateFlow<UiState> = combine(appState.groceryItems, appState.activeKidId) { items, _ ->
        val groups = items
            .sortedWith(compareBy({ it.checked }, { it.category }, { it.name.lowercase() }))
            .groupBy { it.category }
            .toList()
        UiState(
            items = items,
            groups = groups,
            uncheckedCount = items.count { !it.checked },
            checkedCount = items.count { it.checked },
        )
    }.stateIn(viewModelScope, SharingStarted.Eagerly, UiState())

    fun add(draft: Draft, onResult: (err: String?) -> Unit) {
        val userId = appState.kids.value.firstOrNull()?.userId ?: ""
        val item = GroceryItem(
            id = UUID.randomUUID().toString(),
            userId = userId,
            name = draft.name,
            category = draft.category,
            quantity = draft.quantity,
            unit = draft.unit,
            checked = false,
        )
        viewModelScope.launch {
            runCatching { appState.addGroceryItem(item) }
                .onSuccess { haptics.success(); onResult(null) }
                .onFailure { haptics.error(); onResult(it.message) }
        }
    }

    fun toggle(item: GroceryItem) {
        haptics.lightImpact()
        viewModelScope.launch {
            runCatching {
                appState.updateGroceryItem(item.id, GroceryItemUpdate(checked = !item.checked))
            }
        }
    }

    fun delete(item: GroceryItem, onResult: (err: String?) -> Unit) {
        haptics.mediumImpact()
        viewModelScope.launch {
            runCatching { appState.deleteGroceryItem(item.id) }
                .onSuccess { onResult(null) }
                .onFailure { onResult(it.message) }
        }
    }

    /**
     * Builds a grocery list from the current ISO week + all kids, then bulk-
     * inserts via AppStateStore so the offline queue still applies on failure.
     */
    fun generateFromPlan(onResult: (count: Int, err: String?) -> Unit) {
        viewModelScope.launch {
            val today = java.time.LocalDate.now()
            val weekStart = today.with(
                java.time.temporal.TemporalAdjusters.previousOrSame(java.time.DayOfWeek.MONDAY)
            )
            val kidIds = appState.kids.value.map { it.id }
            if (kidIds.isEmpty()) return@launch onResult(0, "No children yet.")

            runCatching {
                val generated = generator.generateFromMealPlan(weekStart, kidIds)
                generator.addGenerated(generated)
                generated.size
            }
                .onSuccess {
                    haptics.success()
                    onResult(it, null)
                }
                .onFailure {
                    haptics.error()
                    onResult(0, it.message)
                }
        }
    }

    /** Bulk-inserts parsed items from TextImportSheet. */
    fun bulkAdd(
        parsed: List<com.eatpal.app.domain.GroceryTextParser.ParsedItem>,
        onResult: (added: Int, err: String?) -> Unit,
    ) {
        if (parsed.isEmpty()) return onResult(0, null)
        val userId = appState.kids.value.firstOrNull()?.userId ?: ""
        viewModelScope.launch {
            var added = 0
            for (p in parsed) {
                val item = GroceryItem(
                    id = UUID.randomUUID().toString(),
                    userId = userId,
                    name = p.name,
                    category = p.category,
                    quantity = p.quantity,
                    unit = p.unit.ifBlank { "ea" },
                    checked = false,
                    addedVia = "text_import",
                )
                val result = runCatching { appState.addGroceryItem(item) }
                if (result.isFailure) {
                    haptics.error()
                    return@launch onResult(added, result.exceptionOrNull()?.message)
                }
                added += 1
            }
            haptics.success()
            onResult(added, null)
        }
    }

    fun clearChecked(onResult: (count: Int, err: String?) -> Unit) {
        viewModelScope.launch {
            val checked = appState.groceryItems.value.filter { it.checked }
            var failure: Throwable? = null
            for (item in checked) {
                val result = runCatching { appState.deleteGroceryItem(item.id) }
                if (result.isFailure) {
                    failure = result.exceptionOrNull()
                    break
                }
            }
            if (failure != null) {
                haptics.error()
                onResult(0, failure.message)
            } else {
                haptics.success()
                onResult(checked.size, null)
            }
        }
    }
}
