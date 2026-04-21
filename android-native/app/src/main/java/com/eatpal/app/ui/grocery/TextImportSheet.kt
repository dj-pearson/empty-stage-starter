package com.eatpal.app.ui.grocery

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import com.eatpal.app.domain.GroceryTextParser
import com.eatpal.app.ui.theme.Spacing

/**
 * Paste a grocery list (or voice-dictation transcript). Parser generates a
 * preview; user confirms before bulk-insert. Photo OCR import is deferred
 * (prd.json US-209 remainder).
 */
@Composable
fun TextImportSheet(
    onCancel: () -> Unit,
    onAdd: (List<GroceryTextParser.ParsedItem>) -> Unit,
) {
    var text by remember { mutableStateOf("") }
    val parsed = remember(text) { GroceryTextParser.parse(text) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.sm),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                "Import from text",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.fillMaxWidth(1f / 3f))
            IconButton(onClick = onCancel) {
                Icon(Icons.Default.Close, contentDescription = "Close")
            }
        }

        Text(
            "Paste a list or type items separated by commas, 'and', or new lines.",
            style = MaterialTheme.typography.bodySmall,
        )

        OutlinedTextField(
            value = text,
            onValueChange = { text = it },
            label = { Text("Items") },
            modifier = Modifier.fillMaxWidth(),
            minLines = 4,
        )

        if (parsed.isNotEmpty()) {
            HorizontalDivider()
            Text("Preview (${parsed.size})", fontWeight = FontWeight.SemiBold)
            parsed.forEach { item ->
                val qty = if (item.quantity == item.quantity.toLong().toDouble())
                    item.quantity.toLong().toString()
                else item.quantity.toString()
                val confidenceLabel = if (item.confidence < 0.75) " (review)" else ""
                Text("• $qty ${item.unit} ${item.name} — ${item.category}$confidenceLabel")
            }
        }

        Spacer(Modifier.size(Spacing.md))

        Button(
            onClick = { onAdd(parsed) },
            enabled = parsed.isNotEmpty(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Add ${parsed.size} item${if (parsed.size == 1) "" else "s"}")
        }
    }
}
