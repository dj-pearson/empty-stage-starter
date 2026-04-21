package com.eatpal.app.ui.aicoach

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.eatpal.app.data.remote.AICoachService
import com.eatpal.app.domain.AppStateStore
import com.eatpal.app.models.ChatMessage
import com.eatpal.app.ui.theme.Spacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Conversational coach UI mirroring iOS `AICoachView`. Reads active-kid +
 * foods context from AppStateStore so the edge function gets the same
 * personalization signals as iOS.
 */
@Composable
fun AICoachScreen(vm: AICoachViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    var input by remember { mutableStateOf("") }
    val listState = rememberLazyListState()

    LaunchedEffect(state.messages.size) {
        if (state.messages.isNotEmpty()) listState.animateScrollToItem(state.messages.lastIndex)
    }

    Scaffold { inner ->
        Column(modifier = Modifier.fillMaxSize().padding(inner)) {
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.md).weight(1f, fill = true),
                verticalArrangement = Arrangement.spacedBy(Spacing.sm),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = Spacing.md),
            ) {
                items(items = state.messages, key = { it.id }) { msg ->
                    MessageBubble(msg)
                }
                if (state.isLoading) {
                    item(key = "loading") {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp,
                            )
                            Spacer(Modifier.size(Spacing.sm))
                            Text("Coach is thinking…", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth().padding(Spacing.md),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
            ) {
                OutlinedTextField(
                    value = input,
                    onValueChange = { input = it },
                    label = { Text("Ask the coach") },
                    modifier = Modifier.weight(1f),
                )
                IconButton(
                    enabled = input.isNotBlank() && !state.isLoading,
                    onClick = {
                        val text = input.trim()
                        if (text.isBlank()) return@IconButton
                        input = ""
                        vm.send(text)
                    },
                ) {
                    Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send")
                }
            }
        }
    }
}

@Composable
private fun MessageBubble(msg: ChatMessage) {
    val isUser = msg.role == ChatMessage.Role.USER
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start,
    ) {
        Surface(
            color = if (isUser) MaterialTheme.colorScheme.primaryContainer
            else MaterialTheme.colorScheme.surfaceVariant,
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.padding(horizontal = Spacing.xs),
        ) {
            Text(
                msg.content,
                modifier = Modifier.padding(horizontal = Spacing.md, vertical = Spacing.sm),
                fontWeight = if (isUser) FontWeight.Medium else FontWeight.Normal,
            )
        }
    }
}

@HiltViewModel
class AICoachViewModel @Inject constructor(
    private val service: AICoachService,
    private val appState: AppStateStore,
) : ViewModel() {

    data class UiState(
        val messages: List<ChatMessage> = listOf(
            ChatMessage(
                role = ChatMessage.Role.ASSISTANT,
                content = "Hi! I'm your AI meal coach. I can help with meal ideas, picky eating strategies, nutrition questions, and food introduction tips. How can I help?",
            ),
        ),
        val isLoading: Boolean = false,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    fun send(text: String) {
        val userMsg = ChatMessage(role = ChatMessage.Role.USER, content = text)
        _state.update { it.copy(messages = it.messages + userMsg, isLoading = true) }
        val history = _state.value.messages
        val activeKid = appState.kids.value.firstOrNull { it.id == appState.activeKidId.value }
        val foods = appState.foods.value
        viewModelScope.launch {
            val reply = service.send(text, history, activeKid, foods)
            val assistant = ChatMessage(role = ChatMessage.Role.ASSISTANT, content = reply)
            _state.update { it.copy(messages = it.messages + assistant, isLoading = false) }
        }
    }

    fun clear() {
        _state.value = UiState()
    }
}
