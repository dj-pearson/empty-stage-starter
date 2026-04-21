package com.eatpal.app.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Kitchen
import androidx.compose.material.icons.filled.LocalGroceryStore
import androidx.compose.material.icons.filled.RestaurantMenu
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.eatpal.app.data.local.OnboardingStore
import com.eatpal.app.ui.theme.Spacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * 3-step welcome tour shown on first launch — iOS `OnboardingView` parity.
 * Calls [OnboardingStore.markCompleted] on finish so it doesn't reappear.
 */
@Composable
fun OnboardingScreen(vm: OnboardingViewModel = hiltViewModel(), onFinished: () -> Unit) {
    var step by remember { mutableStateOf(0) }
    val pages = remember {
        listOf(
            OnboardingPage(
                icon = Icons.Default.RestaurantMenu,
                title = "Plan meals your kids will eat",
                body = "Drop recipes into a weekly plan, and mark each meal as eaten, tasted, or refused as you go.",
            ),
            OnboardingPage(
                icon = Icons.Default.LocalGroceryStore,
                title = "Shop with confidence",
                body = "Auto-generate a grocery list from your week's plan. Works offline — edits sync when you're back online.",
            ),
            OnboardingPage(
                icon = Icons.Default.Kitchen,
                title = "Track pantry + try-bites",
                body = "Scan barcodes to build your pantry, and celebrate the wins when a picky eater tries something new.",
            ),
        )
    }

    val page = pages[step]
    Column(
        modifier = Modifier.fillMaxSize().padding(Spacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
        ) {
            TextButton(onClick = { vm.complete(onFinished) }) { Text("Skip") }
        }

        Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(Spacing.lg),
            ) {
                Surface(
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.primaryContainer,
                    modifier = Modifier.size(120.dp),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(page.icon, contentDescription = null, modifier = Modifier.size(56.dp))
                    }
                }
                Text(
                    page.title,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                )
                Text(
                    page.body,
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center,
                )
            }
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(Spacing.xs),
            modifier = Modifier.padding(vertical = Spacing.md),
        ) {
            pages.indices.forEach { i ->
                val active = i == step
                Surface(
                    shape = CircleShape,
                    color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
                    modifier = Modifier.size(if (active) 10.dp else 8.dp),
                ) {
                    Spacer(Modifier.size(1.dp))
                }
            }
        }

        Button(
            onClick = {
                if (step < pages.lastIndex) step += 1 else vm.complete(onFinished)
            },
            modifier = Modifier.fillMaxWidth().height(48.dp),
        ) {
            Text(if (step < pages.lastIndex) "Next" else "Get started")
        }
    }
}

private data class OnboardingPage(
    val icon: ImageVector,
    val title: String,
    val body: String,
)

@HiltViewModel
class OnboardingViewModel @Inject constructor(
    private val store: OnboardingStore,
) : ViewModel() {
    fun complete(done: () -> Unit) {
        viewModelScope.launch {
            store.markCompleted()
            done()
        }
    }
}
