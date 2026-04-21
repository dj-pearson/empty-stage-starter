package com.eatpal.app.ui.recipes

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import com.eatpal.app.models.Recipe
import com.eatpal.app.ui.theme.Spacing

/**
 * Draft returned by [RecipeEditor]. Not an update struct — the caller (VM)
 * handles the split between create and update.
 */
data class RecipeEditorDraft(
    val name: String,
    val description: String?,
    val instructions: String?,
    val foodIds: List<String>,
    val prepTime: String?,
    val cookTime: String?,
    val servings: String?,
    val additionalIngredients: String?,
    val tips: String?,
    val imageUrl: String?,
    val difficultyLevel: String?,
)

/**
 * Create / edit form. The ingredient picker uses `foodIds` as a plain string
 * list for now — Tier 2 will swap to a real `IngredientPicker` screen against
 * [com.eatpal.app.domain.AppStateStore.foods].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecipeEditor(
    initial: Recipe?,
    onCancel: () -> Unit,
    onSave: (RecipeEditorDraft) -> Unit,
) {
    var name by remember { mutableStateOf(initial?.name.orEmpty()) }
    var description by remember { mutableStateOf(initial?.description.orEmpty()) }
    var instructions by remember { mutableStateOf(initial?.instructions.orEmpty()) }
    var prepTime by remember { mutableStateOf(initial?.prepTime.orEmpty()) }
    var cookTime by remember { mutableStateOf(initial?.cookTime.orEmpty()) }
    var servings by remember { mutableStateOf(initial?.servings.orEmpty()) }
    var additionalIngredients by remember { mutableStateOf(initial?.additionalIngredients.orEmpty()) }
    var tips by remember { mutableStateOf(initial?.tips.orEmpty()) }
    var imageUrl by remember { mutableStateOf(initial?.imageUrl.orEmpty()) }
    var difficulty by remember { mutableStateOf(initial?.difficultyLevel.orEmpty()) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (initial == null) "New recipe" else "Edit recipe") },
                navigationIcon = {
                    IconButton(onClick = onCancel) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Cancel")
                    }
                },
                actions = {
                    TextButton(
                        enabled = name.isNotBlank(),
                        onClick = {
                            onSave(
                                RecipeEditorDraft(
                                    name = name.trim(),
                                    description = description.takeIf { it.isNotBlank() },
                                    instructions = instructions.takeIf { it.isNotBlank() },
                                    foodIds = initial?.foodIds ?: emptyList(),
                                    prepTime = prepTime.takeIf { it.isNotBlank() },
                                    cookTime = cookTime.takeIf { it.isNotBlank() },
                                    servings = servings.takeIf { it.isNotBlank() },
                                    additionalIngredients = additionalIngredients.takeIf { it.isNotBlank() },
                                    tips = tips.takeIf { it.isNotBlank() },
                                    imageUrl = imageUrl.takeIf { it.isNotBlank() },
                                    difficultyLevel = difficulty.takeIf { it.isNotBlank() },
                                )
                            )
                        },
                    ) { Text("Save") }
                },
            )
        },
    ) { inner ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(inner)
                .verticalScroll(rememberScrollState())
                .padding(Spacing.lg),
            verticalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            Field("Name", name, { name = it })
            Field("Description", description, { description = it }, multiline = true)
            Field("Instructions", instructions, { instructions = it }, multiline = true)
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                OutlinedTextField(
                    value = prepTime,
                    onValueChange = { prepTime = it },
                    label = { Text("Prep time") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(0.5f),
                )
                OutlinedTextField(
                    value = cookTime,
                    onValueChange = { cookTime = it },
                    label = { Text("Cook time") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                OutlinedTextField(
                    value = servings,
                    onValueChange = { servings = it },
                    label = { Text("Servings") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(0.5f),
                )
                OutlinedTextField(
                    value = difficulty,
                    onValueChange = { difficulty = it },
                    label = { Text("Difficulty") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            Field("Image URL", imageUrl, { imageUrl = it })
            Field(
                "Additional ingredients (one per line)",
                additionalIngredients,
                { additionalIngredients = it },
                multiline = true,
            )
            Field("Tips", tips, { tips = it }, multiline = true)

            if (initial != null && initial.foodIds.isNotEmpty()) {
                Text(
                    "Linked foods: ${initial.foodIds.size}",
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    "Ingredient picker pending — see prd.json US-205.",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}

@Composable
private fun Field(
    label: String,
    value: String,
    onChange: (String) -> Unit,
    multiline: Boolean = false,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = !multiline,
        minLines = if (multiline) 3 else 1,
        modifier = Modifier.fillMaxWidth(),
    )
}
