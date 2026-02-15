import SwiftUI
import StoreKit

/// Paywall screen that shows subscription tiers and handles purchases.
struct PaywallView: View {
    @Environment(\.dismiss) var dismiss
    @StateObject private var store = StoreKitService.shared
    @State private var selectedProduct: Product?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Header
                    VStack(spacing: 8) {
                        Image(systemName: "crown.fill")
                            .font(.system(size: 48))
                            .foregroundStyle(.yellow)

                        Text("Upgrade EatPal")
                            .font(.title)
                            .fontWeight(.bold)

                        Text("Unlock all features for your family")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 20)

                    // Current Plan
                    if store.currentTier != .free {
                        currentPlanBadge
                    }

                    // Feature Comparison
                    featureComparison

                    // Products
                    if store.isLoading && store.products.isEmpty {
                        ProgressView()
                            .padding()
                    } else if store.products.isEmpty {
                        Text("No products available")
                            .foregroundStyle(.secondary)
                            .padding()
                    } else {
                        VStack(spacing: 12) {
                            Text("Choose a Plan")
                                .font(.headline)

                            ForEach(store.products, id: \.id) { product in
                                ProductCard(
                                    product: product,
                                    isSelected: selectedProduct?.id == product.id,
                                    isPurchased: store.purchasedProductIDs.contains(product.id)
                                ) {
                                    selectedProduct = product
                                }
                            }
                        }
                    }

                    // Purchase Button
                    if let product = selectedProduct,
                       !store.purchasedProductIDs.contains(product.id) {
                        Button {
                            Task {
                                _ = try? await store.purchase(product)
                            }
                        } label: {
                            HStack {
                                if store.isLoading {
                                    ProgressView()
                                        .tint(.white)
                                }
                                Text("Subscribe for \(product.displayPrice)")
                                    .fontWeight(.semibold)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.green)
                        .disabled(store.isLoading)
                        .padding(.horizontal)
                    }

                    // Error
                    if let error = store.errorMessage {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                            .padding(.horizontal)
                    }

                    // Restore & Terms
                    VStack(spacing: 8) {
                        Button("Restore Purchases") {
                            Task { await store.restorePurchases() }
                        }
                        .font(.callout)

                        HStack(spacing: 16) {
                            Link("Privacy Policy", destination: URL(string: "https://tryeatpal.com/privacy")!)
                            Link("Terms of Service", destination: URL(string: "https://tryeatpal.com/terms")!)
                        }
                        .font(.caption)
                        .foregroundStyle(.secondary)

                        Text("Payment will be charged to your Apple ID account at confirmation of purchase. Subscription automatically renews unless it is canceled at least 24 hours before the end of the current period.")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 24)
                    }
                    .padding(.bottom, 24)
                }
            }
            .navigationTitle("Subscription")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }

    // MARK: - Current Plan Badge

    private var currentPlanBadge: some View {
        HStack {
            Image(systemName: "checkmark.seal.fill")
                .foregroundStyle(.green)
            Text("Current Plan: \(store.currentTier.displayName)")
                .fontWeight(.medium)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.green.opacity(0.1), in: Capsule())
    }

    // MARK: - Feature Comparison

    private var featureComparison: some View {
        VStack(alignment: .leading, spacing: 16) {
            ForEach([SubscriptionTier.free, .basic, .premium], id: \.self) { tier in
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text(tier.displayName)
                            .font(.subheadline)
                            .fontWeight(.bold)

                        if tier == store.currentTier {
                            Text("Current")
                                .font(.caption2)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(.green.opacity(0.2), in: Capsule())
                        }
                    }

                    ForEach(tier.features, id: \.self) { feature in
                        Label(feature, systemImage: "checkmark")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
    }
}

// MARK: - Product Card

struct ProductCard: View {
    let product: Product
    let isSelected: Bool
    let isPurchased: Bool
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(product.displayName)
                        .font(.body)
                        .fontWeight(.medium)
                        .foregroundStyle(.primary)

                    Text(product.description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 2) {
                    if isPurchased {
                        Label("Active", systemImage: "checkmark.circle.fill")
                            .font(.caption)
                            .foregroundStyle(.green)
                    } else {
                        Text(product.displayPrice)
                            .font(.body)
                            .fontWeight(.bold)
                            .foregroundStyle(.primary)

                        if let sub = product.subscription {
                            Text(periodLabel(sub.subscriptionPeriod))
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .padding()
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? Color.green : Color(.separator), lineWidth: isSelected ? 2 : 1)
            )
            .background(
                isSelected ? Color.green.opacity(0.05) : Color.clear,
                in: RoundedRectangle(cornerRadius: 12)
            )
        }
        .buttonStyle(.plain)
        .padding(.horizontal)
    }

    private func periodLabel(_ period: Product.SubscriptionPeriod) -> String {
        switch period.unit {
        case .month: return period.value == 1 ? "per month" : "every \(period.value) months"
        case .year: return period.value == 1 ? "per year" : "every \(period.value) years"
        case .week: return period.value == 1 ? "per week" : "every \(period.value) weeks"
        case .day: return period.value == 1 ? "per day" : "every \(period.value) days"
        @unknown default: return ""
        }
    }
}

#Preview {
    PaywallView()
}
