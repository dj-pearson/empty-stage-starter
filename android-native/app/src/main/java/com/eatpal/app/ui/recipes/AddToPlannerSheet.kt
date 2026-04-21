package com.eatpal.app.ui.recipes

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.eatpal.app.models.Kid
import com.eatpal.app.models.MealSlot
import com.eatpal.app.models.Recipe
import com.eatpal.app.ui.theme.Spacing
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/**
 * Compose mirror of iOS `AddToPlannerPopover`: pick date, slot, and kid,
 * then create a PlanEntry linking this recipe.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddToPlannerSheet(
    recipe: Recipe,
    kids: List<Kid>,
    onCancel: () -> Unit,
    onConfirm: (AddToPlannerRequest) -> Unit,
) {
    var dateText by remember {
        mutableStateOf(LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE))
    }
    var slot by remember { mutableStateOf(MealSlot.DINNER) }
    var selectedKidId by remember { mutableStateOf(kids.firstOrNull()?.id.orEmpty()) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Add to plan") },
                navigationIcon = {
                    IconButton(onClick = onCancel) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Cancel")
                    }
                },
            )
        },
    ) { inner ->
        Column(
            modifier = Modifier.fillMaxSize().padding(inner).padding(Spacing.lg),
            verticalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            Text(recipe.name, fontWeight = FontWeight.SemiBold)

            OutlinedTextField(
                value = dateText,
                onValueChange = { dateText = it },
                label = { Text("Date (YYYY-MM-DD)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            Text("Meal slot", style = MaterialTheme.typography.titleSmall)
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                MealSlot.entries.forEach { s ->
                    FilterChip(
                        selected = slot == s,
                        onClick = { slot = s },
                        label = { Text(s.displayName) },
                    )
                }
            }

            Text("Child", style = MaterialTheme.typography.titleSmall)
            if (kids.isEmpty()) {
                Text("No children yet — add one under Kids first.")
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    kids.forEach { kid ->
                        FilterChip(
                            selected = selectedKidId == kid.id,
                            onClick = { selectedKidId = kid.id },
                            label = { Text(kid.name) },
                        )
                    }
                }
            }

            Spacer(Modifier.size(Spacing.md))

            Button(
                onClick = {
                    onConfirm(
                        AddToPlannerRequest(
                            kidId = selectedKidId,
                            date = dateText.trim(),
                            slot = slot,
                        )
                    )
                },
                enabled = selectedKidId.isNotBlank() && dateText.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Add")
            }
        }
    }
}
