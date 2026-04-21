package com.eatpal.app.ui.recipes

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Event
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.eatpal.app.models.Recipe
import com.eatpal.app.ui.theme.Spacing

/**
 * Detail view — photo, metadata, ingredients (resolved against foods), tips,
 * nutrition, actions. Mirrors iOS `RecipeDetailView`.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecipeDetail(
    recipe: Recipe,
    foodLookup: Map<String, String>,
    onBack: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onAddToPlanner: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(recipe.name) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = onEdit) { Icon(Icons.Default.Edit, contentDescription = "Edit") }
                    IconButton(onClick = onDelete) { Icon(Icons.Default.Delete, contentDescription = "Delete") }
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
            verticalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            recipe.imageUrl?.let {
                AsyncImage(
                    model = it,
                    contentDescription = null,
                    modifier = Modifier.fillMaxWidth().height(220.dp),
                    contentScale = ContentScale.Crop,
                )
            }

            recipe.description?.takeIf { it.isNotBlank() }?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium)
            }

            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
                recipe.prepTime?.let { Meta("Prep", it) }
                recipe.cookTime?.let { Meta("Cook", it) }
                recipe.servings?.let { Meta("Servings", it) }
                recipe.difficultyLevel?.let { Meta("Difficulty", it) }
            }

            if (recipe.foodIds.isNotEmpty() || !recipe.additionalIngredients.isNullOrBlank()) {
                Section("Ingredients") {
                    recipe.foodIds.forEach { id ->
                        Text("• ${foodLookup[id] ?: "Unknown food"}")
                    }
                    recipe.additionalIngredients?.takeIf { it.isNotBlank() }?.let { extra ->
                        extra.lines().filter { it.isNotBlank() }.forEach { line ->
                            Text("• $line")
                        }
                    }
                }
            }

            recipe.instructions?.takeIf { it.isNotBlank() }?.let { inst ->
                Section("Instructions") {
                    Text(inst)
                }
            }

            recipe.tips?.takeIf { it.isNotBlank() }?.let { tips ->
                Section("Tips") {
                    Text(tips)
                }
            }

            recipe.nutritionInfo?.let { n ->
                Section("Nutrition (per serving)") {
                    n.calories?.let { Text("Calories: ${it.toInt()}") }
                    n.proteinG?.let { Text("Protein: ${it}g") }
                    n.carbsG?.let { Text("Carbs: ${it}g") }
                    n.fatG?.let { Text("Fat: ${it}g") }
                }
            }

            Spacer(Modifier.height(Spacing.md))
            Button(onClick = onAddToPlanner, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Default.Event, contentDescription = null)
                Spacer(Modifier.height(0.dp))
                Text("  Add to planner")
            }
            OutlinedButton(onClick = onEdit, modifier = Modifier.fillMaxWidth()) {
                Text("Edit recipe")
            }
        }
    }
}

@Composable
private fun Meta(label: String, value: String) {
    Column {
        Text(label, style = MaterialTheme.typography.labelSmall)
        Text(value, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
        content()
    }
}
