package com.eatpal.app.data.remote

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.functions.functions
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

/**
 * Kotlin port of iOS `StoreKitService`. Wraps BillingClient to expose product
 * details + purchase flow + entitlement state. Receipts post to the
 * `verify-play-subscription` edge function (iOS uses `verify-apple-subscription`
 * — same table, different verifier).
 *
 * Product ids mirror the iOS tiers; swap to your actual Play Console SKUs.
 */
@Singleton
class PlayBillingService @Inject constructor(
    @ApplicationContext private val context: Context,
    private val supabase: SupabaseClientProvider,
) {

    enum class Tier(val productId: String, val displayName: String) {
        BASIC_MONTHLY("eatpal_basic_monthly", "Basic — monthly"),
        FAMILY_MONTHLY("eatpal_family_monthly", "Family — monthly"),
        PREMIUM_MONTHLY("eatpal_premium_monthly", "Premium — monthly"),
    }

    data class Product(val tier: Tier, val details: ProductDetails)

    private val _products = MutableStateFlow<List<Product>>(emptyList())
    val products: StateFlow<List<Product>> = _products.asStateFlow()

    private val _activePurchases = MutableStateFlow<List<Purchase>>(emptyList())
    val activePurchases: StateFlow<List<Purchase>> = _activePurchases.asStateFlow()

    private val purchasesListener = PurchasesUpdatedListener { result, purchases ->
        if (result.responseCode == BillingClient.BillingResponseCode.OK && purchases != null) {
            _activePurchases.value = purchases
            // Ack + server-verify each purchase so Play doesn't auto-refund after 3 days.
            purchases.forEach { handlePurchase(it) }
        }
    }

    private val client: BillingClient = BillingClient.newBuilder(context)
        .setListener(purchasesListener)
        .enablePendingPurchases(
            PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()
        )
        .build()

    /** Awaits BillingClient connection. Safe to call repeatedly. */
    suspend fun connect(): BillingResult = suspendCancellableCoroutine { cont ->
        if (client.isReady) {
            cont.resume(
                BillingResult.newBuilder()
                    .setResponseCode(BillingClient.BillingResponseCode.OK)
                    .build()
            )
            return@suspendCancellableCoroutine
        }
        client.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                if (!cont.isCompleted) cont.resume(result)
            }

            override fun onBillingServiceDisconnected() {
                // Leave reconnect to the next call of connect().
            }
        })
    }

    suspend fun loadProducts(): List<Product> {
        connect()
        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(
                Tier.entries.map { tier ->
                    QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(tier.productId)
                        .setProductType(BillingClient.ProductType.SUBS)
                        .build()
                }
            )
            .build()

        val details = suspendCancellableCoroutine<List<ProductDetails>> { cont ->
            client.queryProductDetailsAsync(params) { _, list ->
                if (!cont.isCompleted) cont.resume(list)
            }
        }

        val mapped = details.mapNotNull { pd ->
            Tier.entries.firstOrNull { it.productId == pd.productId }?.let { Product(it, pd) }
        }
        _products.value = mapped
        return mapped
    }

    /**
     * Kicks the Play purchase UI for [product]. The result comes back via the
     * [purchasesListener] above; callers observe [activePurchases].
     */
    fun launchPurchaseFlow(activity: Activity, product: Product) {
        val offerToken = product.details.subscriptionOfferDetails?.firstOrNull()?.offerToken
            ?: return
        val params = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(
                listOf(
                    BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(product.details)
                        .setOfferToken(offerToken)
                        .build()
                )
            )
            .build()
        client.launchBillingFlow(activity, params)
    }

    suspend fun restorePurchases(): List<Purchase> {
        connect()
        val params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.SUBS)
            .build()
        return suspendCancellableCoroutine { cont ->
            client.queryPurchasesAsync(params) { _, purchases ->
                _activePurchases.value = purchases
                if (!cont.isCompleted) cont.resume(purchases)
            }
        }
    }

    private fun handlePurchase(purchase: Purchase) {
        if (purchase.purchaseState != Purchase.PurchaseState.PURCHASED) return
        if (!purchase.isAcknowledged) {
            val ack = AcknowledgePurchaseParams.newBuilder()
                .setPurchaseToken(purchase.purchaseToken)
                .build()
            client.acknowledgePurchase(ack) { /* best-effort */ }
        }
        // Post the token to the edge function so the server activates the
        // user's entitlement. Same contract as iOS verify-apple-subscription.
        kotlinx.coroutines.GlobalScope.let { /* keep launch self-contained */ }
        postReceiptVerification(purchase)
    }

    private fun postReceiptVerification(purchase: Purchase) {
        val payload = buildJsonObject {
            put("purchaseToken", purchase.purchaseToken)
            put("productId", purchase.products.firstOrNull().orEmpty())
            put("orderId", purchase.orderId.orEmpty())
        }
        // Fire-and-forget from this application-scoped singleton. Failure
        // recovery (retry if connectivity drops) is best handled later by
        // WorkManager, tracked in prd.json US-214 follow-up.
        @OptIn(kotlinx.coroutines.DelicateCoroutinesApi::class)
        kotlinx.coroutines.GlobalScope.launch(kotlinx.coroutines.Dispatchers.IO) {
            runCatching {
                supabase.client.functions.invoke("verify-play-subscription") {
                    contentType(ContentType.Application.Json)
                    setBody(payload)
                }.bodyAsText()
            }
        }
    }
}
