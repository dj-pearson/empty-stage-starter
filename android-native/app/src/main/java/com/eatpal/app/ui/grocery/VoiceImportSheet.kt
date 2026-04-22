package com.eatpal.app.ui.grocery

import android.Manifest
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import com.eatpal.app.domain.GroceryTextParser
import com.eatpal.app.ui.theme.Spacing
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState

/**
 * Dictate a grocery list. Uses Android's on-device SpeechRecognizer — same
 * surface as iOS SFSpeechRecognizer. Transcript feeds GroceryTextParser so
 * voice + text imports share the exact same normalization pipeline.
 */
@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun VoiceImportSheet(
    onCancel: () -> Unit,
    onAdd: (List<GroceryTextParser.ParsedItem>) -> Unit,
) {
    val context = LocalContext.current
    val micPermission = rememberPermissionState(Manifest.permission.RECORD_AUDIO)
    var transcript by remember { mutableStateOf("") }
    var listening by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val recognizer = remember {
        if (SpeechRecognizer.isRecognitionAvailable(context)) {
            SpeechRecognizer.createSpeechRecognizer(context)
        } else null
    }

    DisposableEffect(Unit) {
        onDispose { recognizer?.destroy() }
    }

    val parsed = remember(transcript) { GroceryTextParser.parse(transcript) }

    Column(
        modifier = Modifier.fillMaxWidth().padding(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.sm),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                "Voice add",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.fillMaxWidth(1f / 3f))
            IconButton(onClick = onCancel) {
                Icon(Icons.Default.Close, contentDescription = "Close")
            }
        }

        if (!micPermission.status.isGranted) {
            Text("Microphone permission needed to dictate items.")
            Button(onClick = { micPermission.launchPermissionRequest() }) {
                Text("Grant microphone access")
            }
            return@Column
        }

        if (recognizer == null) {
            Text("Speech recognition isn't available on this device.")
            return@Column
        }

        Text(
            "Tap the mic and say items separated by 'and' or commas — e.g., " +
                "\"two pounds of chicken, a gallon of milk, and broccoli\".",
            style = MaterialTheme.typography.bodySmall,
        )

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            IconButton(onClick = {
                if (listening) {
                    recognizer.stopListening()
                } else {
                    error = null
                    recognizer.setRecognitionListener(object : RecognitionListener {
                        override fun onReadyForSpeech(params: Bundle?) { listening = true }
                        override fun onBeginningOfSpeech() {}
                        override fun onRmsChanged(rmsdB: Float) {}
                        override fun onBufferReceived(buffer: ByteArray?) {}
                        override fun onEndOfSpeech() { listening = false }
                        override fun onError(e: Int) {
                            listening = false
                            error = "Recognition error ($e). Try again."
                        }
                        override fun onResults(results: Bundle?) {
                            listening = false
                            val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                            matches?.firstOrNull()?.let { transcript = it }
                        }
                        override fun onPartialResults(partial: Bundle?) {
                            val matches = partial?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                            matches?.firstOrNull()?.let { transcript = it }
                        }
                        override fun onEvent(eventType: Int, params: Bundle?) {}
                    })
                    recognizer.startListening(
                        Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                        }
                    )
                }
            }) {
                if (listening) {
                    Icon(Icons.Default.MicOff, contentDescription = "Stop")
                } else {
                    Icon(Icons.Default.Mic, contentDescription = "Start dictation")
                }
            }
            if (listening) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp()),
                    strokeWidth = 2.dp(),
                )
                Text("Listening…", style = MaterialTheme.typography.bodySmall)
            }
        }

        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }

        OutlinedTextField(
            value = transcript,
            onValueChange = { transcript = it },
            label = { Text("Transcript (edit if needed)") },
            modifier = Modifier.fillMaxWidth(),
            minLines = 2,
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

// Local alias so I don't have to import androidx.compose.ui.unit.dp twice in this file.
private fun Int.dp(): androidx.compose.ui.unit.Dp = androidx.compose.ui.unit.Dp(this.toFloat())
