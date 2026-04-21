package com.eatpal.app.ui.kids

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import coil.compose.AsyncImage
import com.eatpal.app.data.remote.ImageUploadService
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
 * Kids list + full-profile editor matching iOS `KidsView` / `KidProfileEditorView`.
 * Editor covers all 20+ Kid fields. Profile picture uploads via
 * [ImageUploadService] (Supabase Storage `images/kids/`).
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
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        val scope = rememberCoroutineScope()
        ModalBottomSheet(onDismissRequest = { showAddSheet = false }, sheetState = sheetState) {
            KidEditorForm(
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
                uploadProfilePicture = vm::uploadProfilePicture,
            )
        }
    }

    editingKid?.let { kid ->
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        val scope = rememberCoroutineScope()
        ModalBottomSheet(onDismissRequest = { editingKid = null }, sheetState = sheetState) {
            KidEditorForm(
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
                uploadProfilePicture = { uri -> vm.uploadProfilePicture(uri, existingId = kid.id) },
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
            if (!kid.profilePictureUrl.isNullOrBlank()) {
                AsyncImage(
                    model = kid.profilePictureUrl,
                    contentDescription = null,
                    modifier = Modifier.size(48.dp).clip(CircleShape),
                    contentScale = ContentScale.Crop,
                )
            } else {
                Surface(
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.primaryContainer,
                    modifier = Modifier.size(48.dp),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.Person, contentDescription = null)
                    }
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
private fun KidEditorForm(
    initial: Kid?,
    onCancel: () -> Unit,
    onSave: (KidsViewModel.Draft) -> Unit,
    uploadProfilePicture: suspend (Uri) -> String?,
) {
    var name by remember { mutableStateOf(initial?.name.orEmpty()) }
    var age by remember { mutableStateOf(initial?.age?.toString().orEmpty()) }
    var gender by remember { mutableStateOf(initial?.gender.orEmpty()) }
    var heightCm by remember { mutableStateOf(initial?.heightCm?.toString().orEmpty()) }
    var weightKg by remember { mutableStateOf(initial?.weightKg?.toString().orEmpty()) }
    var pickiness by remember { mutableStateOf(initial?.pickinessLevel.orEmpty()) }
    var newFoodWillingness by remember { mutableStateOf(initial?.newFoodWillingness.orEmpty()) }
    var eatingBehavior by remember { mutableStateOf(initial?.eatingBehavior.orEmpty()) }
    var textureSensitivity by remember { mutableStateOf(initial?.textureSensitivityLevel.orEmpty()) }
    var allergens by remember { mutableStateOf(initial?.allergens?.joinToString(", ").orEmpty()) }
    var dietaryRestrictions by remember { mutableStateOf(initial?.dietaryRestrictions?.joinToString(", ").orEmpty()) }
    var favorites by remember { mutableStateOf(initial?.favoriteFoods?.joinToString(", ").orEmpty()) }
    var dislikes by remember { mutableStateOf(initial?.dislikedFoods?.joinToString(", ").orEmpty()) }
    var alwaysEats by remember { mutableStateOf(initial?.alwaysEatsFoods?.joinToString(", ").orEmpty()) }
    var texturePreferences by remember { mutableStateOf(initial?.texturePreferences?.joinToString(", ").orEmpty()) }
    var textureDislikes by remember { mutableStateOf(initial?.textureDislikes?.joinToString(", ").orEmpty()) }
    var flavorPreferences by remember { mutableStateOf(initial?.flavorPreferences?.joinToString(", ").orEmpty()) }
    var healthGoals by remember { mutableStateOf(initial?.healthGoals?.joinToString(", ").orEmpty()) }
    var nutritionConcerns by remember { mutableStateOf(initial?.nutritionConcerns?.joinToString(", ").orEmpty()) }
    var helpfulStrategies by remember { mutableStateOf(initial?.helpfulStrategies?.joinToString(", ").orEmpty()) }
    var notes by remember { mutableStateOf(initial?.notes.orEmpty()) }
    var behavioralNotes by remember { mutableStateOf(initial?.behavioralNotes.orEmpty()) }
    var profilePictureUrl by remember { mutableStateOf(initial?.profilePictureUrl.orEmpty()) }
    var uploading by remember { mutableStateOf(false) }

    val scope = rememberCoroutineScope()
    val pickPhoto = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia()
    ) { uri: Uri? ->
        uri ?: return@rememberLauncherForActivityResult
        uploading = true
        scope.launch {
            val url = uploadProfilePicture(uri)
            uploading = false
            if (url != null) profilePictureUrl = url
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.sm),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                if (initial == null) "Add child" else "Edit child",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.fillMaxWidth(1f / 3f))
            IconButton(onClick = onCancel) {
                Icon(Icons.Default.Close, contentDescription = "Close")
            }
        }

        // Profile picture
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
            Box(contentAlignment = Alignment.Center, modifier = Modifier.size(72.dp)) {
                if (profilePictureUrl.isNotBlank()) {
                    AsyncImage(
                        model = profilePictureUrl,
                        contentDescription = null,
                        modifier = Modifier.size(72.dp).clip(CircleShape),
                        contentScale = ContentScale.Crop,
                    )
                } else {
                    Surface(
                        shape = CircleShape,
                        color = MaterialTheme.colorScheme.primaryContainer,
                        modifier = Modifier.size(72.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Default.Person, contentDescription = null)
                        }
                    }
                }
                if (uploading) {
                    CircularProgressIndicator(modifier = Modifier.size(28.dp), strokeWidth = 2.dp)
                }
            }
            OutlinedButton(onClick = {
                pickPhoto.launch(
                    PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                )
            }) {
                Text(if (profilePictureUrl.isBlank()) "Choose photo" else "Change photo")
            }
        }

        SectionHeader("Basics")
        Field("Name", name) { name = it }
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            NumberField("Age", age, modifier = Modifier.fillMaxWidth(0.5f)) { age = it }
            Field("Gender", gender, modifier = Modifier.fillMaxWidth()) { gender = it }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            NumberField("Height (cm)", heightCm, decimal = true, modifier = Modifier.fillMaxWidth(0.5f)) { heightCm = it }
            NumberField("Weight (kg)", weightKg, decimal = true, modifier = Modifier.fillMaxWidth()) { weightKg = it }
        }

        SectionHeader("Eating personality")
        Field("Pickiness level (low/medium/high)", pickiness) { pickiness = it }
        Field("New-food willingness", newFoodWillingness) { newFoodWillingness = it }
        Field("Eating behavior", eatingBehavior) { eatingBehavior = it }
        Field("Texture sensitivity level", textureSensitivity) { textureSensitivity = it }

        SectionHeader("Allergies & diet")
        Field("Allergens (comma-separated)", allergens, multiline = true) { allergens = it }
        Field("Dietary restrictions", dietaryRestrictions, multiline = true) { dietaryRestrictions = it }

        SectionHeader("Foods")
        Field("Favorites", favorites, multiline = true) { favorites = it }
        Field("Dislikes", dislikes, multiline = true) { dislikes = it }
        Field("Always eats", alwaysEats, multiline = true) { alwaysEats = it }

        SectionHeader("Textures & flavors")
        Field("Texture preferences", texturePreferences, multiline = true) { texturePreferences = it }
        Field("Texture dislikes", textureDislikes, multiline = true) { textureDislikes = it }
        Field("Flavor preferences", flavorPreferences, multiline = true) { flavorPreferences = it }

        SectionHeader("Goals & strategies")
        Field("Health goals", healthGoals, multiline = true) { healthGoals = it }
        Field("Nutrition concerns", nutritionConcerns, multiline = true) { nutritionConcerns = it }
        Field("Helpful strategies", helpfulStrategies, multiline = true) { helpfulStrategies = it }

        SectionHeader("Notes")
        Field("Notes", notes, multiline = true) { notes = it }
        Field("Behavioral notes", behavioralNotes, multiline = true) { behavioralNotes = it }

        Spacer(Modifier.size(Spacing.md))
        Button(
            onClick = {
                onSave(
                    KidsViewModel.Draft(
                        name = name.trim(),
                        age = age.toIntOrNull(),
                        gender = gender.takeIf { it.isNotBlank() },
                        heightCm = heightCm.toDoubleOrNull(),
                        weightKg = weightKg.toDoubleOrNull(),
                        pickinessLevel = pickiness.takeIf { it.isNotBlank() },
                        newFoodWillingness = newFoodWillingness.takeIf { it.isNotBlank() },
                        eatingBehavior = eatingBehavior.takeIf { it.isNotBlank() },
                        textureSensitivityLevel = textureSensitivity.takeIf { it.isNotBlank() },
                        allergens = allergens.splitCsv(),
                        dietaryRestrictions = dietaryRestrictions.splitCsv(),
                        favoriteFoods = favorites.splitCsv(),
                        dislikedFoods = dislikes.splitCsv(),
                        alwaysEatsFoods = alwaysEats.splitCsv(),
                        texturePreferences = texturePreferences.splitCsv(),
                        textureDislikes = textureDislikes.splitCsv(),
                        flavorPreferences = flavorPreferences.splitCsv(),
                        healthGoals = healthGoals.splitCsv(),
                        nutritionConcerns = nutritionConcerns.splitCsv(),
                        helpfulStrategies = helpfulStrategies.splitCsv(),
                        notes = notes.takeIf { it.isNotBlank() },
                        behavioralNotes = behavioralNotes.takeIf { it.isNotBlank() },
                        profilePictureUrl = profilePictureUrl.takeIf { it.isNotBlank() },
                    )
                )
            },
            enabled = name.isNotBlank() && !uploading,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(if (initial == null) "Add" else "Save")
        }
    }
}

@Composable
private fun SectionHeader(text: String) {
    Spacer(Modifier.size(Spacing.xs))
    Text(
        text,
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.SemiBold,
    )
    HorizontalDivider()
}

@Composable
private fun Field(
    label: String,
    value: String,
    multiline: Boolean = false,
    modifier: Modifier = Modifier,
    onChange: (String) -> Unit,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = !multiline,
        minLines = if (multiline) 2 else 1,
        modifier = modifier.fillMaxWidth(),
    )
}

@Composable
private fun NumberField(
    label: String,
    value: String,
    decimal: Boolean = false,
    modifier: Modifier = Modifier,
    onChange: (String) -> Unit,
) {
    OutlinedTextField(
        value = value,
        onValueChange = { raw ->
            val filtered = raw.filter { c -> c.isDigit() || (decimal && c == '.') }
            onChange(filtered)
        },
        label = { Text(label) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(
            keyboardType = if (decimal) KeyboardType.Decimal else KeyboardType.Number
        ),
        modifier = modifier.fillMaxWidth(),
    )
}

private fun String.splitCsv(): List<String>? =
    this.split(",").map { it.trim() }.filter { it.isNotBlank() }.takeIf { it.isNotEmpty() }

@HiltViewModel
class KidsViewModel @Inject constructor(
    private val appState: AppStateStore,
    private val imageUpload: ImageUploadService,
) : ViewModel() {

    data class Draft(
        val name: String,
        val age: Int? = null,
        val gender: String? = null,
        val heightCm: Double? = null,
        val weightKg: Double? = null,
        val pickinessLevel: String? = null,
        val newFoodWillingness: String? = null,
        val eatingBehavior: String? = null,
        val textureSensitivityLevel: String? = null,
        val allergens: List<String>? = null,
        val dietaryRestrictions: List<String>? = null,
        val favoriteFoods: List<String>? = null,
        val dislikedFoods: List<String>? = null,
        val alwaysEatsFoods: List<String>? = null,
        val texturePreferences: List<String>? = null,
        val textureDislikes: List<String>? = null,
        val flavorPreferences: List<String>? = null,
        val healthGoals: List<String>? = null,
        val nutritionConcerns: List<String>? = null,
        val helpfulStrategies: List<String>? = null,
        val notes: String? = null,
        val behavioralNotes: String? = null,
        val profilePictureUrl: String? = null,
    )

    data class UiState(
        val kids: List<Kid> = emptyList(),
        val activeKidId: String? = null,
    )

    val state: StateFlow<UiState> = combine(appState.kids, appState.activeKidId, ::UiState)
        .stateIn(viewModelScope, SharingStarted.Eagerly, UiState())

    fun setActive(id: String) = appState.setActiveKid(id)

    /**
     * Uploads a profile picture. [existingId] is used as the filename when
     * editing; null generates a provisional UUID so new-kid uploads don't
     * collide before the row is created.
     */
    suspend fun uploadProfilePicture(uri: Uri, existingId: String? = null): String? {
        val id = existingId ?: UUID.randomUUID().toString()
        return runCatching {
            imageUpload.upload(uri, ImageUploadService.Folder.KIDS, id)
        }.getOrNull()
    }

    fun add(draft: Draft, onResult: (err: String?) -> Unit) {
        val userId = appState.kids.value.firstOrNull()?.userId ?: ""
        val kid = draft.toKid(id = UUID.randomUUID().toString(), userId = userId)
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
            gender = draft.gender,
            heightCm = draft.heightCm,
            weightKg = draft.weightKg,
            pickinessLevel = draft.pickinessLevel,
            allergens = draft.allergens,
            dietaryRestrictions = draft.dietaryRestrictions,
            favoriteFoods = draft.favoriteFoods,
            dislikedFoods = draft.dislikedFoods,
            texturePreferences = draft.texturePreferences,
            textureDislikes = draft.textureDislikes,
            flavorPreferences = draft.flavorPreferences,
            healthGoals = draft.healthGoals,
            nutritionConcerns = draft.nutritionConcerns,
            helpfulStrategies = draft.helpfulStrategies,
            notes = draft.notes,
            behavioralNotes = draft.behavioralNotes,
            profilePictureUrl = draft.profilePictureUrl,
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

    private fun Draft.toKid(id: String, userId: String): Kid = Kid(
        id = id,
        userId = userId,
        name = name,
        age = age,
        gender = gender,
        heightCm = heightCm,
        weightKg = weightKg,
        pickinessLevel = pickinessLevel,
        newFoodWillingness = newFoodWillingness,
        eatingBehavior = eatingBehavior,
        textureSensitivityLevel = textureSensitivityLevel,
        allergens = allergens,
        dietaryRestrictions = dietaryRestrictions,
        favoriteFoods = favoriteFoods,
        dislikedFoods = dislikedFoods,
        alwaysEatsFoods = alwaysEatsFoods,
        texturePreferences = texturePreferences,
        textureDislikes = textureDislikes,
        flavorPreferences = flavorPreferences,
        healthGoals = healthGoals,
        nutritionConcerns = nutritionConcerns,
        helpfulStrategies = helpfulStrategies,
        notes = notes,
        behavioralNotes = behavioralNotes,
        profilePictureUrl = profilePictureUrl,
    )
}
