package com.eatpal.app.ui.paywall

import android.app.Activity
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.eatpal.app.data.remote.PlayBillingService
import com.eatpal.app.ui.theme.Spacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

private val FEATURES: Map<PlayBillingService.Tier, List<String>> = mapOf(
    PlayBillingService.Tier.BASIC_MONTHLY to listOf(
        "Meal planning for 1 child",
        "Grocery list with offline sync",
        "Core pantry + recipe library",
    ),
    PlayBillingService.Tier.FAMILY_MONTHLY to listOf(
        "Everything in Basic",
        "Up to 4 child profiles",
        "AI meal plan generator",
        "Family grocery voting",
    ),
    PlayBillingService.Tier.PREMIUM_MONTHLY to listOf(
        "Everything in Family",
        "AI coach with unlimited chats",
        "Grocery delivery integration",
        "Priority support",
    ),
)

@Composable
fun PaywallScreen(vm: PaywallViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current

    LaunchedEffect(Unit) { vm.load() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
    ) {
        Text(
            "EatPal Pro",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
        )
        Text("Unlock meal planning superpowers.")

        if (state.error != null) {
            Text(
                state.error!!,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
            )
        }

        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (state.products.isEmpty()) {
            Text(
                "Products not configured yet. Set product ids in Play Console matching " +
                    "PlayBillingService.Tier, then reload.",
                style = MaterialTheme.typography.bodySmall,
            )
        } else {
            state.products.forEach { product ->
                TierCard(
                    product = product,
                    onSubscribe = {
                        (context as? Activity)?.let { activity ->
                            vm.purchase(activity, product)
                        }
                    },
                )
            }
        }

        Spacer(Modifier.padding(Spacing.sm))

        OutlinedButton(
            onClick = vm::restore,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Restore purchases")
        }

        Text(
            "Subscriptions auto-renew until cancelled. Manage or cancel in Google Play.",
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

@Composable
private fun TierCard(product: PlayBillingService.Product, onSubscribe: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
        Column(modifier = Modifier.padding(Spacing.lg), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            Text(product.tier.displayName, fontWeight = FontWeight.SemiBold)
            val price = product.details.subscriptionOfferDetails
                ?.firstOrNull()?.pricingPhases?.pricingPhaseList?.firstOrNull()?.formattedPrice
                ?: "—"
            Text(price, style = MaterialTheme.typography.titleMedium)
            HorizontalDivider()
            FEATURES[product.tier].orEmpty().forEach { feature ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Default.Check,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                    )
                    Spacer(Modifier.padding(start = 4.dp))
                    Text(feature)
                }
            }
            Button(onClick = onSubscribe, modifier = Modifier.fillMaxWidth()) {
                Text("Subscribe")
            }
        }
    }
}

@HiltViewModel
class PaywallViewModel @Inject constructor(
    private val billing: PlayBillingService,
) : ViewModel() {

    data class UiState(
        val products: List<PlayBillingService.Product> = emptyList(),
        val activePurchases: List<com.android.billingclient.api.Purchase> = emptyList(),
        val isLoading: Boolean = false,
        val error: String? = null,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = combine(
        _state,
        billing.products,
        billing.activePurchases,
    ) { local, prods, purchases ->
        local.copy(products = prods, activePurchases = purchases)
    }.stateIn(viewModelScope, SharingStarted.Eagerly, UiState())

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            runCatching { billing.loadProducts() }
                .onFailure { t -> _state.update { it.copy(error = t.message) } }
            _state.update { it.copy(isLoading = false) }
        }
    }

    fun restore() {
        viewModelScope.launch {
            runCatching { billing.restorePurchases() }
                .onFailure { t -> _state.update { it.copy(error = t.message) } }
        }
    }

    fun purchase(activity: Activity, product: PlayBillingService.Product) {
        billing.launchPurchaseFlow(activity, product)
    }
}
