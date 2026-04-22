package com.eatpal.app.ui.grocery

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Image
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.eatpal.app.domain.GroceryTextParser
import com.eatpal.app.ui.theme.Spacing
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume

/**
 * Pick a photo of a handwritten or printed shopping list; ML Kit OCR
 * extracts text; GroceryTextParser turns it into items. Same pipeline as
 * iOS PhotoImportGrocerySheet.
 */
@Composable
fun PhotoImportSheet(
    onCancel: () -> Unit,
    onAdd: (List<GroceryTextParser.ParsedItem>) -> Unit,
) {
    val context = LocalContext.current
    var ocrText by remember { mutableStateOf("") }
    var processing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    // Reuse the recognizer so we don't rebuild it on every pick.
    val recognizer: TextRecognizer = remember {
        TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    }
    DisposableEffect(Unit) { onDispose { runCatching { recognizer.close() } } }

    val pickPhoto = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia()
    ) { uri: Uri? ->
        uri ?: return@rememberLauncherForActivityResult
        processing = true
        error = null
        scope.launch {
            val extracted = runCatching {
                withContext(Dispatchers.IO) {
                    val input = InputImage.fromFilePath(context, uri)
                    suspendCancellableCoroutine<String> { cont ->
                        recognizer.process(input)
                            .addOnSuccessListener { result -> if (!cont.isCompleted) cont.resume(result.text) }
                            .addOnFailureListener { t -> if (!cont.isCompleted) cont.resume("") }
                    }
                }
            }
            processing = false
            extracted.onSuccess { text ->
                if (text.isBlank()) error = "No text detected in that image."
                else ocrText = text
            }
            extracted.onFailure { error = it.message }
        }
    }

    val parsed = remember(ocrText) { GroceryTextParser.parse(ocrText) }

    Column(
        modifier = Modifier.fillMaxWidth().padding(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.sm),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                "Photo import",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.fillMaxWidth(1f / 3f))
            IconButton(onClick = onCancel) {
                Icon(Icons.Default.Close, contentDescription = "Close")
            }
        }

        Text(
            "Take or pick a photo of a written/printed shopping list.",
            style = MaterialTheme.typography.bodySmall,
        )

        OutlinedButton(
            onClick = {
                pickPhoto.launch(
                    PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                )
            },
            modifier = Modifier.fillMaxWidth(),
            enabled = !processing,
        ) {
            Icon(Icons.Default.Image, contentDescription = null)
            Spacer(Modifier.size(Spacing.sm))
            Text("Choose a photo")
        }

        if (processing) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                Spacer(Modifier.size(Spacing.sm))
                Text("Reading image…", style = MaterialTheme.typography.bodySmall)
            }
        }

        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }

        OutlinedTextField(
            value = ocrText,
            onValueChange = { ocrText = it },
            label = { Text("Recognized text (edit as needed)") },
            modifier = Modifier.fillMaxWidth(),
            minLines = 3,
        )

        if (parsed.isNotEmpty()) {
            HorizontalDivider()
            Text("Preview (${parsed.size})", fontWeight = FontWeight.SemiBold)
            parsed.forEach { item ->
                val qty = if (item.quantity == item.quantity.toLong().toDouble())
                    item.quantity.toLong().toString()
                else item.quantity.toString()
                val confidence = if (item.confidence < 0.75) " (review)" else ""
                Text("• $qty ${item.unit} ${item.name} — ${item.category}$confidence")
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
