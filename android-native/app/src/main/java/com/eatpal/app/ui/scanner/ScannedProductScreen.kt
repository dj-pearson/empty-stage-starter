package com.eatpal.app.ui.scanner

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.eatpal.app.data.remote.BarcodeService
import com.eatpal.app.domain.AppStateStore
import com.eatpal.app.models.Food
import com.eatpal.app.ui.components.rememberToastController
import com.eatpal.app.ui.theme.Spacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

/**
 * Shows the Open Food Facts result for a scanned barcode. User can "Add to
 * pantry" (inserts a Food row with barcode + allergens + category), or
 * rescan. Mirrors iOS `ScannedProductView`.
 */
@Composable
fun ScannedProductScreen(
    barcode: String,
    onRescan: () -> Unit,
    onDone: () -> Unit,
    vm: ScannedProductViewModel = hiltViewModel(),
) {
    val toast = rememberToastController()
    var loading by remember { mutableStateOf(true) }
    var product by remember { mutableStateOf<BarcodeService.ProductResult?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(barcode) {
        loading = true
        val result = runCatching { vm.lookup(barcode) }
        loading = false
        result.onSuccess { product = it; if (it == null) error = "No product found." }
        result.onFailure { error = it.message }
    }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
    ) {
        Text("Scanned product", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Text("Barcode: $barcode", style = MaterialTheme.typography.bodySmall)

        if (loading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return@Column
        }
        val p = product
        if (p == null) {
            Text(error ?: "No match.", color = MaterialTheme.colorScheme.error)
            OutlinedButton(onClick = onRescan, modifier = Modifier.fillMaxWidth()) { Text("Scan again") }
            return@Column
        }

        Card(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(Spacing.lg),
                verticalArrangement = Arrangement.spacedBy(Spacing.sm),
            ) {
                Text(p.name, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.titleMedium)
                Text("Category: ${p.category}")
                if (p.allergens.isNotEmpty()) {
                    HorizontalDivider()
                    Text("Allergens", fontWeight = FontWeight.SemiBold)
                    p.allergens.forEach { Text("• $it") }
                }
                p.nutrition?.let { n ->
                    HorizontalDivider()
                    Text("Nutrition (per 100g)", fontWeight = FontWeight.SemiBold)
                    n.calories?.let { Text("Calories: ${it.toInt()} kcal") }
                    n.protein?.let { Text("Protein: ${it}g") }
                    n.carbs?.let { Text("Carbs: ${it}g") }
                    n.fat?.let { Text("Fat: ${it}g") }
                    n.fiber?.let { Text("Fiber: ${it}g") }
                    n.sugar?.let { Text("Sugar: ${it}g") }
                    n.sodium?.let { Text("Sodium: ${it}g") }
                }
            }
        }

        Button(
            onClick = {
                scope.launch {
                    vm.addToPantry(p) { err ->
                        if (err != null) toast.error("Couldn't add", err)
                        else {
                            toast.success("Added ${p.name} to pantry")
                            onDone()
                        }
                    }
                }
            },
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Add to pantry") }

        OutlinedButton(onClick = onRescan, modifier = Modifier.fillMaxWidth()) { Text("Scan another") }
    }
}

@HiltViewModel
class ScannedProductViewModel @Inject constructor(
    private val barcodeService: BarcodeService,
    private val appState: AppStateStore,
) : ViewModel() {

    suspend fun lookup(barcode: String): BarcodeService.ProductResult? = barcodeService.lookup(barcode)

    /**
     * Inserts a Food row for the scanned product. Pulls user_id off the
     * active-kid list (same fallback iOS uses when no session-scoped userId
     * is known yet at the call site).
     */
    fun addToPantry(product: BarcodeService.ProductResult, onResult: (err: String?) -> Unit) {
        val userId = appState.kids.value.firstOrNull()?.userId ?: ""
        val food = Food(
            id = UUID.randomUUID().toString(),
            userId = userId,
            name = product.name,
            category = product.category,
            isSafe = true,
            isTryBite = false,
            allergens = product.allergens.takeIf { it.isNotEmpty() },
            barcode = product.barcode,
            quantity = 1.0,
            unit = "ea",
        )
        viewModelScope.launch {
            runCatching { appState.addFood(food) }
                .onSuccess { onResult(null) }
                .onFailure { onResult(it.message) }
        }
    }
}
