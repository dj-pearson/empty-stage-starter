package com.eatpal.app.ui.kids

import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
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
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.eatpal.app.domain.AppStateStore
import com.eatpal.app.models.Kid
import com.eatpal.app.models.KidUpdate
import com.eatpal.app.ui.components.rememberToastController
import com.eatpal.app.ui.theme.Spacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

/**
 * iOS `KidsView` parity — simplified first pass. Full profile editor (20+
 * fields from iOS `KidProfileEditorView`) is still pending per prd.json US-207.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun KidsScreen(vm: KidsViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val toast = rememberToastController()
    var showAddSheet by remember { mutableStateOf(false) }
    var editingKid by remember { mutableStateOf<Kid?>(null) }
    var deletingKid by remember { mutableStateOf<Kid?>(null) }

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(onClick = { showAddSheet = true }) {
                Icon(Icons.Default.Add, contentDescription = "Add child")
            }
        },
    ) { inner ->
        Column(
            modifier = Modifier.fillMaxSize().padding(inner).padding(Spacing.lg),
            verticalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            Text("Kids", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)

            if (state.kids.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("No children yet — tap + to add one.")
                }
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    items(items = state.kids, key = { it.id }) { kid ->
                        KidCard(
                            kid = kid,
                            isActive = kid.id == state.activeKidId,
                            onSelect = { vm.setActive(kid.id) },
                            onEdit = { editingKid = kid },
                            onDelete = { deletingKid = kid },
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
            KidForm(
                initial = null,
                onCancel = {
                    scope.launch { sheetState.hide() }.invokeOnCompletion { showAddSheet = false }
                },
                onSave = { draft ->
                    vm.add(draft) { err ->
                        if (err != null) toast.error("Couldn't add", err)
                        else toast.success("Added ${draft.name}")
                    }
                    scope.launch { sheetState.hide() }.invokeOnCompletion { showAddSheet = false }
                },
            )
        }
    }

    editingKid?.let { kid ->
        val sheetState = rememberModalBottomSheetState()
        val scope = rememberCoroutineScope()
        ModalBottomSheet(
            onDismissRequest = { editingKid = null },
            sheetState = sheetState,
        ) {
            KidForm(
                initial = kid,
                onCancel = {
                    scope.launch { sheetState.hide() }.invokeOnCompletion { editingKid = null }
                },
                onSave = { draft ->
                    vm.update(kid.id, draft) { err ->
                        if (err != null) toast.error("Couldn't update", err)
                        else toast.success("Updated ${draft.name}")
                    }
                    scope.launch { sheetState.hide() }.invokeOnCompletion { editingKid = null }
                },
            )
        }
    }

    deletingKid?.let { kid ->
        AlertDialog(
            onDismissRequest = { deletingKid = null },
            title = { Text("Remove ${kid.name}?") },
            text = { Text("This removes their profile from your family.") },
            confirmButton = {
                TextButton(onClick = {
                    vm.delete(kid.id) { err ->
                        if (err != null) toast.error("Couldn't remove", err)
                        else toast.success("Removed ${kid.name}")
                    }
                    deletingKid = null
                }) { Text("Remove") }
            },
            dismissButton = {
                TextButton(onClick = { deletingKid = null }) { Text("Cancel") }
            },
        )
    }
}

@Composable
private fun KidCard(
    kid: Kid,
    isActive: Boolean,
    onSelect: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onSelect)) {
        Row(
            modifier = Modifier.padding(Spacing.md),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            Surface(
                shape = CircleShape,
                color = MaterialTheme.colorScheme.primaryContainer,
                modifier = Modifier.size(48.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.Person, contentDescription = null)
                }
            }
            Column(modifier = Modifier.fillMaxWidth(1f).padding(end = Spacing.sm)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(kid.name, fontWeight = FontWeight.SemiBold)
                    if (isActive) {
                        Spacer(modifier = Modifier.size(Spacing.sm))
                        Icon(
                            Icons.Default.Check,
                            contentDescription = "Active",
                            tint = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
                kid.age?.let { Text("Age $it", style = MaterialTheme.typography.bodySmall) }
                kid.pickinessLevel?.let {
                    Text("Pickiness: $it", style = MaterialTheme.typography.bodySmall)
                }
            }
            TextButton(onClick = onEdit) { Text("Edit") }
            IconButton(onClick = onDelete) {
                Icon(Icons.Default.Delete, contentDescription = "Remove")
            }
        }
    }
}

@Composable
private fun KidForm(
    initial: Kid?,
    onCancel: () -> Unit,
    onSave: (KidsViewModel.Draft) -> Unit,
) {
    var name by remember { mutableStateOf(initial?.name ?: "") }
    var age by remember { mutableStateOf(initial?.age?.toString() ?: "") }
    var pickiness by remember { mutableStateOf(initial?.pickinessLevel ?: "") }
    var notes by remember { mutableStateOf(initial?.notes ?: "") }

    Column(
        modifier = Modifier.fillMaxWidth().padding(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.sm),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                if (initial == null) "Add child" else "Edit child",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
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
        OutlinedTextField(
            value = age,
            onValueChange = { age = it.filter { c -> c.isDigit() } },
            label = { Text("Age (years)") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = pickiness,
            onValueChange = { pickiness = it },
            label = { Text("Pickiness level (low/medium/high)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = notes,
            onValueChange = { notes = it },
            label = { Text("Notes") },
            modifier = Modifier.fillMaxWidth(),
        )
        Button(
            onClick = {
                onSave(
                    KidsViewModel.Draft(
                        name = name.trim(),
                        age = age.toIntOrNull(),
                        pickinessLevel = pickiness.takeIf { it.isNotBlank() },
                        notes = notes.takeIf { it.isNotBlank() },
                    )
                )
            },
            enabled = name.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(if (initial == null) "Add" else "Save")
        }
    }
}

@HiltViewModel
class KidsViewModel @Inject constructor(
    private val appState: AppStateStore,
) : ViewModel() {

    data class Draft(
        val name: String,
        val age: Int? = null,
        val pickinessLevel: String? = null,
        val notes: String? = null,
    )

    data class UiState(
        val kids: List<Kid> = emptyList(),
        val activeKidId: String? = null,
    )

    val state: StateFlow<UiState> = combine(appState.kids, appState.activeKidId, ::UiState)
        .stateIn(viewModelScope, SharingStarted.Eagerly, UiState())

    fun setActive(id: String) {
        appState.setActiveKid(id)
    }

    fun add(draft: Draft, onResult: (err: String?) -> Unit) {
        val userId = appState.kids.value.firstOrNull()?.userId ?: ""
        val kid = Kid(
            id = UUID.randomUUID().toString(),
            userId = userId,
            name = draft.name,
            age = draft.age,
            pickinessLevel = draft.pickinessLevel,
            notes = draft.notes,
        )
        viewModelScope.launch {
            runCatching { appState.addKid(kid) }
                .onSuccess { onResult(null) }
                .onFailure { onResult(it.message) }
        }
    }

    fun update(id: String, draft: Draft, onResult: (err: String?) -> Unit) {
        val updates = KidUpdate(
            name = draft.name,
            age = draft.age,
            pickinessLevel = draft.pickinessLevel,
            notes = draft.notes,
        )
        viewModelScope.launch {
            runCatching { appState.updateKid(id, updates) }
                .onSuccess { onResult(null) }
                .onFailure { onResult(it.message) }
        }
    }

    fun delete(id: String, onResult: (err: String?) -> Unit) {
        viewModelScope.launch {
            runCatching { appState.deleteKid(id) }
                .onSuccess { onResult(null) }
                .onFailure { onResult(it.message) }
        }
    }
}
