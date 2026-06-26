import StoreKit
import Foundation

/// Product identifiers that match App Store Connect configuration.
/// See documents/APP_STORE_CONNECT_SETUP.md for the full tier breakdown.
enum SubscriptionProduct: String, CaseIterable {
    case monthlyPro          = "com.eatpal.app.pro.monthly"
    case yearlyPro           = "com.eatpal.app.pro.yearly"
    case monthlyFamilyPlus   = "com.eatpal.app.familyplus.monthly"
    case yearlyFamilyPlus    = "com.eatpal.app.familyplus.yearly"
    case monthlyProfessional = "com.eatpal.app.professional.monthly"
    case yearlyProfessional  = "com.eatpal.app.professional.yearly"

    var tier: SubscriptionTier {
        switch self {
        case .monthlyPro, .yearlyPro: return .pro
        case .monthlyFamilyPlus, .yearlyFamilyPlus: return .familyPlus
        case .monthlyProfessional, .yearlyProfessional: return .professional
        }
    }

    var isYearly: Bool {
        switch self {
        case .yearlyPro, .yearlyFamilyPlus, .yearlyProfessional: return true
        default: return false
        }
    }
}

enum SubscriptionTier: String, Comparable, CaseIterable {
    case free
    case pro
    case familyPlus
    case professional

    static func < (lhs: SubscriptionTier, rhs: SubscriptionTier) -> Bool {
        let order: [SubscriptionTier] = [.free, .pro, .familyPlus, .professional]
        return order.firstIndex(of: lhs)! < order.firstIndex(of: rhs)!
    }

    var displayName: String {
        switch self {
        case .free: return "Free"
        case .pro: return "Pro"
        case .familyPlus: return "Family Plus"
        case .professional: return "Professional"
        }
    }

    var tagline: String {
        switch self {
        case .free: return "Start planning with one kid"
        case .pro: return "For the everyday picky-eater parent"
        case .familyPlus: return "Unlimited kids, shared household"
        case .professional: return "Feeding therapists & dietitians"
        }
    }

    var features: [String] {
        switch self {
        case .free:
            return [
                "Track 1 child",
                "Manual meal planning",
                "Basic grocery list",
            ]
        case .pro:
            return [
                "Up to 3 kids",
                "AI meal coach",
                "Barcode scanner",
                "Smart grocery lists (aisle-grouped)",
                "Food-chaining tools (basic)",
            ]
        case .familyPlus:
            return [
                "Unlimited kids",
                "Shared household (2 parents)",
                "Grocery delivery (Instacart)",
                "Meal voting",
                "Weekly nutrition email reports",
                "Food-chaining tools (full)",
            ]
        case .professional:
            return [
                "Multi-family client management",
                "Exportable PDF nutrition reports",
                "Case-template library",
                "Bulk client onboarding",
                "Priority support (<4hr reply)",
            ]
        }
    }
}

/// Manages StoreKit 2 subscriptions, product loading, purchases, and entitlement checking.
@MainActor
final class StoreKitService: ObservableObject {
    static let shared = StoreKitService()

    @Published var products: [Product] = []
    @Published var purchasedProductIDs: Set<String> = []
    @Published var currentTier: SubscriptionTier = .free
    @Published var isLoading = false
    @Published var errorMessage: String?

    private var updateListenerTask: Task<Void, Never>?

    private init() {
        updateListenerTask = listenForTransactions()
        Task { await loadProducts() }
    }

    deinit {
        updateListenerTask?.cancel()
    }

    // MARK: - Product Loading

    func loadProducts() async {
        isLoading = true
        do {
            let ids = SubscriptionProduct.allCases.map(\.rawValue)
            products = try await Product.products(for: Set(ids))
                .sorted { $0.price < $1.price }
        } catch {
            errorMessage = "Failed to load products: \(error.localizedDescription)"
        }
        isLoading = false
    }

    // MARK: - Purchase

    func purchase(_ product: Product) async throws -> StoreKit.Transaction? {
        isLoading = true
        errorMessage = nil

        do {
            let result = try await product.purchase()

            switch result {
            case .success(let verification):
                let transaction = try checkVerified(verification)
                await updateCustomerProductStatus()
                await syncSubscriptionToSupabase(transaction: transaction)
                await transaction.finish()
                isLoading = false
                return transaction

            case .userCancelled:
                isLoading = false
                return nil

            case .pending:
                isLoading = false
                return nil

            @unknown default:
                isLoading = false
                return nil
            }
        } catch {
            errorMessage = error.localizedDescription
            isLoading = false
            throw error
        }
    }

    // MARK: - Restore

    func restorePurchases() async {
        isLoading = true
        errorMessage = nil
        // US-460: surface AppStore.sync() failures so "nothing to restore" is
        // distinguishable from "restore failed", and record it for telemetry,
        // instead of swallowing the error with try?.
        do {
            try await AppStore.sync()
        } catch {
            SentryService.leaveBreadcrumb(
                category: "storekit",
                message: "AppStore.sync failed during restore: \(error)"
            )
            errorMessage = "Couldn't reach the App Store to restore purchases. Check your connection and try again."
        }
        await updateCustomerProductStatus()
        // US-375: AppStore.sync() + updateCustomerProductStatus only refresh
        // local entitlements; the server apple_subscriptions row was never
        // written on a restore (e.g. fresh install). Walk currentEntitlements
        // and sync each verified transaction so the backend has a row keyed by
        // original_transaction_id.
        for await result in StoreKit.Transaction.currentEntitlements {
            if let transaction = try? checkVerified(result) {
                await syncSubscriptionToSupabase(transaction: transaction)
            }
        }
        isLoading = false
    }

    // MARK: - Transaction Listener

    private func listenForTransactions() -> Task<Void, Never> {
        Task.detached { [weak self] in
            for await result in StoreKit.Transaction.updates {
                guard let self else { continue }
                do {
                    let transaction = try await self.checkVerified(result)
                    await self.updateCustomerProductStatus()
                    await self.syncSubscriptionToSupabase(transaction: transaction)
                    await transaction.finish()
                } catch {
                    // US-376: surface verification failures in Sentry instead
                    // of swallowing them in a print().
                    SentryService.capture(error, extras: [
                        "context": "storekit_transaction_update"
                    ])
                }
            }
        }
    }

    // MARK: - Entitlement Check

    func updateCustomerProductStatus() async {
        var purchased: Set<String> = []

        for await result in StoreKit.Transaction.currentEntitlements {
            if let transaction = try? checkVerified(result) {
                purchased.insert(transaction.productID)
            }
        }

        purchasedProductIDs = purchased

        // Determine highest tier
        let productEnums = purchased.compactMap { SubscriptionProduct(rawValue: $0) }
        let tiers = productEnums.map(\.tier)
        currentTier = tiers.max() ?? .free
    }

    // MARK: - Helpers

    func product(for subscriptionProduct: SubscriptionProduct) -> Product? {
        products.first { $0.id == subscriptionProduct.rawValue }
    }

    func isSubscribed(to tier: SubscriptionTier) -> Bool {
        currentTier >= tier
    }

    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified:
            throw StoreError.failedVerification
        case .verified(let safe):
            return safe
        }
    }

    /// Syncs the StoreKit subscription to Supabase (`apple_subscriptions`),
    /// keyed by originalTransactionId so App Store Server Notifications can map
    /// a refund/revocation back to this user. iOS entitlement gating itself
    /// stays client-side (StoreKit currentEntitlements); this is the durable
    /// server-side record + the lookup the refund handler uses.
    ///
    /// Previously this upserted into `user_subscriptions` with no `user_id`
    /// (a NOT NULL column) and against columns that don't exist — so it
    /// silently failed and never recorded anything.
    private func syncSubscriptionToSupabase(transaction: StoreKit.Transaction) async {
        struct SubscriptionPayload: Encodable {
            let userId: String
            let originalTransactionId: String
            let storeTransactionId: String
            let productId: String
            let status: String
            let expiresAt: String?

            enum CodingKeys: String, CodingKey {
                case userId = "user_id"
                case originalTransactionId = "original_transaction_id"
                case storeTransactionId = "store_transaction_id"
                case productId = "product_id"
                case status
                case expiresAt = "expires_at"
            }
        }
        do {
            let session = try await SupabaseManager.client.auth.session
            let payload = SubscriptionPayload(
                userId: session.user.id.uuidString.lowercased(),
                originalTransactionId: String(transaction.originalID),
                storeTransactionId: String(transaction.id),
                productId: transaction.productID,
                status: transaction.revocationDate == nil ? "active" : "revoked",
                expiresAt: transaction.expirationDate?.ISO8601Format()
            )
            try await SupabaseManager.client.from("apple_subscriptions")
                .upsert(payload, onConflict: "original_transaction_id")
                .execute()
        } catch {
            // US-376: a failed upsert must be observable — report to Sentry
            // with non-PII product/transaction context (no user_id/email).
            SentryService.capture(error, extras: [
                "context": "storekit_subscription_sync",
                "product_id": transaction.productID,
                "original_transaction_id": String(transaction.originalID)
            ])
        }
    }
}

enum StoreError: LocalizedError {
    case failedVerification

    var errorDescription: String? {
        switch self {
        case .failedVerification:
            return "Transaction verification failed."
        }
    }
}
