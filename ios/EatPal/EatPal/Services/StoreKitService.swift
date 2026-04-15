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
        try? await AppStore.sync()
        await updateCustomerProductStatus()
        isLoading = false
    }

    // MARK: - Transaction Listener

    private func listenForTransactions() -> Task<Void, Never> {
        Task.detached {
            for await result in StoreKit.Transaction.updates {
                do {
                    let transaction = try await self.checkVerified(result)
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
        struct SubscriptionPayload: Encodable {
            let storeProductId: String
            let storeTransactionId: String
            let status: String
            let platform: String
            let expiresAt: String

            enum CodingKeys: String, CodingKey {
                case storeProductId = "store_product_id"
                case storeTransactionId = "store_transaction_id"
                case status, platform
                case expiresAt = "expires_at"
            }
        }
        let payload = SubscriptionPayload(
            storeProductId: transaction.productID,
            storeTransactionId: String(transaction.id),
            status: transaction.revocationDate == nil ? "active" : "revoked",
            platform: "ios",
            expiresAt: transaction.expirationDate?.ISO8601Format() ?? ""
        )
        do {
            try await SupabaseManager.client.from("user_subscriptions")
                .upsert(payload)
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
