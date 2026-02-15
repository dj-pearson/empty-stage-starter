import StoreKit
import Foundation

/// Product identifiers that match App Store Connect configuration.
enum SubscriptionProduct: String, CaseIterable {
    case monthlyBasic = "com.eatpal.app.basic.monthly"
    case yearlyBasic = "com.eatpal.app.basic.yearly"
    case monthlyPremium = "com.eatpal.app.premium.monthly"
    case yearlyPremium = "com.eatpal.app.premium.yearly"

    var tier: SubscriptionTier {
        switch self {
        case .monthlyBasic, .yearlyBasic: return .basic
        case .monthlyPremium, .yearlyPremium: return .premium
        }
    }
}

enum SubscriptionTier: String, Comparable {
    case free
    case basic
    case premium

    static func < (lhs: SubscriptionTier, rhs: SubscriptionTier) -> Bool {
        let order: [SubscriptionTier] = [.free, .basic, .premium]
        return order.firstIndex(of: lhs)! < order.firstIndex(of: rhs)!
    }

    var displayName: String {
        switch self {
        case .free: return "Free"
        case .basic: return "Basic"
        case .premium: return "Premium"
        }
    }

    var features: [String] {
        switch self {
        case .free:
            return [
                "Track up to 1 child",
                "Basic meal planning",
                "Manual food entry",
            ]
        case .basic:
            return [
                "Track up to 3 children",
                "Full meal planning",
                "Barcode scanning",
                "Grocery list generation",
                "Weekly nutrition reports",
            ]
        case .premium:
            return [
                "Unlimited children",
                "AI meal suggestions",
                "AI nutrition coaching",
                "Food chaining therapy tools",
                "Grocery delivery integration",
                "Priority support",
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
        try? await AppStore.sync()
        await updateCustomerProductStatus()
        isLoading = false
    }

    // MARK: - Transaction Listener

    private func listenForTransactions() -> Task<Void, Never> {
        Task.detached {
            for await result in StoreKit.Transaction.updates {
                do {
                    let transaction = try self.checkVerified(result)
                    await self.updateCustomerProductStatus()
                    await self.syncSubscriptionToSupabase(transaction: transaction)
                    await transaction.finish()
                } catch {
                    print("Transaction verification failed: \(error)")
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

    /// Syncs the active subscription status to Supabase for server-side entitlement checks.
    private func syncSubscriptionToSupabase(transaction: StoreKit.Transaction) async {
        do {
            try await SupabaseManager.client.from("user_subscriptions")
                .upsert([
                    "store_product_id": transaction.productID,
                    "store_transaction_id": String(transaction.id),
                    "status": transaction.revocationDate == nil ? "active" : "revoked",
                    "platform": "ios",
                    "expires_at": transaction.expirationDate?.ISO8601Format() ?? "",
                ] as [String: Any])
                .execute()
        } catch {
            print("Failed to sync subscription to Supabase: \(error)")
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
