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
                await validateTransactionOnServer(
                    transaction: transaction,
                    jwsRepresentation: verification.jwsRepresentation
                )
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
                await validateTransactionOnServer(
                    transaction: transaction,
                    jwsRepresentation: result.jwsRepresentation
                )
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
                    await self.validateTransactionOnServer(
                        transaction: transaction,
                        jwsRepresentation: result.jwsRepresentation
                    )
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

        // Determine highest tier from locally-verified StoreKit entitlements…
        let productEnums = purchased.compactMap { SubscriptionProduct(rawValue: $0) }
        let tiers = productEnums.map(\.tier)
        currentTier = tiers.max() ?? .free

        // …then let the server veto anything it knows was refunded/revoked
        // (see refreshServerEntitlement). Grants stay client-verified; the
        // server can only reduce access.
        await refreshServerEntitlement()
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

    /// Validates a StoreKit transaction on the server and records the
    /// entitlement in `apple_subscriptions` (keyed by originalTransactionId).
    ///
    /// The device sends the transaction's Apple-signed `jwsRepresentation` to
    /// the `validate-apple-transaction` edge function, which verifies Apple's
    /// signature and upserts the row with the service role from the VERIFIED
    /// payload. This replaces the old direct client upsert: because RLS only
    /// checked `auth.uid() = user_id`, a tampered client could have written
    /// status:"active" for a product it never bought. Now only Apple-signed
    /// transactions are honored server-side.
    ///
    /// `jwsRepresentation` is the Apple-signed JWS from the transaction's
    /// `VerificationResult` (StoreKit exposes it on the wrapper, not on the
    /// unwrapped `Transaction`); it's what the server verifies.
    private func validateTransactionOnServer(
        transaction: StoreKit.Transaction,
        jwsRepresentation: String
    ) async {
        struct ValidateRequest: Encodable { let jws: String }
        struct ValidateResponse: Decodable {
            let tier: String
            let status: String
            let expiresAt: String?
        }
        // No session -> nothing to attribute the purchase to. Skip; a later
        // restore or launch reconcile picks it up once signed in.
        guard (try? await SupabaseManager.client.auth.session) != nil else { return }
        do {
            let _: ValidateResponse = try await EdgeFunctions.invoke(
                "validate-apple-transaction",
                body: ValidateRequest(jws: jwsRepresentation)
            )
        } catch {
            // US-376: a failed validation must be observable — report to Sentry
            // with non-PII product/transaction context (no user_id/email).
            SentryService.capture(error, extras: [
                "context": "storekit_validate_transaction",
                "product_id": transaction.productID,
                "original_transaction_id": String(transaction.originalID)
            ])
        }
    }

    // MARK: - Server-authoritative reconciliation

    private struct ServerEntitlementRow: Decodable {
        let productId: String?
        let status: String

        enum CodingKeys: String, CodingKey {
            case productId = "product_id"
            case status
        }
    }

    /// Honor any revocation/expiry the backend knows about (e.g. a refund
    /// reflected by the App Store Server Notifications handler) even if
    /// StoreKit's on-device `currentEntitlements` still lists the product.
    ///
    /// The server can only REDUCE access here — grants still require an
    /// on-device StoreKit-verified entitlement — so a spoofed backend response
    /// can't unlock a tier. No-op when signed out or on network failure
    /// (the locally-derived tier stands).
    func refreshServerEntitlement() async {
        guard (try? await SupabaseManager.client.auth.session) != nil else { return }
        do {
            let rows: [ServerEntitlementRow] = try await SupabaseManager.client
                .from("apple_subscriptions")
                .select("product_id,status")
                .execute()
                .value
            let revoked = Set(rows.filter { $0.status != "active" }.compactMap(\.productId))
            currentTier = Self.entitledTier(
                localProductIDs: purchasedProductIDs,
                revokedProductIDs: revoked
            )
        } catch {
            SentryService.leaveBreadcrumb(
                category: "storekit",
                message: "refreshServerEntitlement failed: \(error)"
            )
        }
    }

    /// Pure entitlement resolution: the highest tier among locally-verified
    /// products, minus any the server marks revoked/expired. Extracted so the
    /// "server can only reduce" rule is unit-testable without StoreKit.
    nonisolated static func entitledTier(
        localProductIDs: Set<String>,
        revokedProductIDs: Set<String>
    ) -> SubscriptionTier {
        let effective = localProductIDs.subtracting(revokedProductIDs)
        let tiers = effective.compactMap { SubscriptionProduct(rawValue: $0)?.tier }
        return tiers.max() ?? .free
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
