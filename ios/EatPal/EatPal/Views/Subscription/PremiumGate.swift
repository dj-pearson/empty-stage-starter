import SwiftUI

/// A premium capability and the minimum tier that unlocks it.
///
/// Central, declarative list so the required tier for a feature lives in exactly
/// one place. The tiers mirror `SubscriptionTier.features` (the human-readable
/// marketing copy) — keep them aligned when a feature changes tiers.
enum PremiumFeature {
    case aiCoach
    case aiMealPlan
    case budget
    case sharedHousehold

    var requiredTier: SubscriptionTier {
        switch self {
        case .aiCoach, .aiMealPlan: return .pro
        case .budget, .sharedHousehold: return .familyPlus
        }
    }

    var title: String {
        switch self {
        case .aiCoach: return "AI Meal Coach"
        case .aiMealPlan: return "AI Meal Planning"
        case .budget: return "Budget & Spend Forecast"
        case .sharedHousehold: return "Shared Household"
        }
    }

    var blurb: String {
        switch self {
        case .aiCoach:
            return "Get personalized, kid-specific coaching for picky eating. Included with EatPal Pro."
        case .aiMealPlan:
            return "Generate tailored meal plans in seconds. Included with EatPal Pro."
        case .budget:
            return "Forecast weekly spend and track pantry value. Included with Family Plus."
        case .sharedHousehold:
            return "Share planning with a second parent. Included with Family Plus."
        }
    }

    var systemImage: String {
        switch self {
        case .aiCoach: return "bubble.left.and.sparkles"
        case .aiMealPlan: return "wand.and.stars"
        case .budget: return "dollarsign.circle"
        case .sharedHousehold: return "person.2"
        }
    }
}

/// Per-tier feature limits that aren't a simple on/off gate.
enum SubscriptionLimits {
    /// Maximum number of tracked children for a tier; `nil` means unlimited.
    /// Mirrors the "Track 1 child" / "Up to 3 kids" / "Unlimited kids" copy in
    /// `SubscriptionTier.features`.
    static func kidLimit(for tier: SubscriptionTier) -> Int? {
        switch tier {
        case .free: return 1
        case .pro: return 3
        case .familyPlus, .professional: return nil
        }
    }

    /// Whether a new child can be added given how many already exist. Existing
    /// children over the limit are never hidden or removed — only *adding*
    /// beyond the limit is blocked — so a user who downgrades keeps their data.
    static func canAddKid(currentCount: Int, tier: SubscriptionTier) -> Bool {
        guard let limit = kidLimit(for: tier) else { return true }
        return currentCount < limit
    }
}

// MARK: - Gating modifier

extension View {
    /// Replace this view with an upgrade prompt unless the user's tier unlocks
    /// `feature`. Reads `StoreKitService` from the environment (injected in
    /// `EatPalApp`), so entitlement changes re-render the gate live.
    func premiumGate(_ feature: PremiumFeature) -> some View {
        modifier(PremiumGateModifier(feature: feature))
    }
}

private struct PremiumGateModifier: ViewModifier {
    let feature: PremiumFeature
    @EnvironmentObject private var store: StoreKitService
    @State private var showingPaywall = false

    func body(content: Content) -> some View {
        Group {
            if store.isSubscribed(to: feature.requiredTier) {
                content
            } else {
                PremiumLockedView(feature: feature) { showingPaywall = true }
            }
        }
        .sheet(isPresented: $showingPaywall) {
            PaywallView()
        }
    }
}

/// Friendly locked state shown in place of a gated feature, with an upgrade CTA.
struct PremiumLockedView: View {
    let feature: PremiumFeature
    var onUpgrade: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: feature.systemImage)
                .font(.system(size: 52))
                .foregroundStyle(.secondary)
                .padding(.bottom, 4)
                .accessibilityHidden(true)

            Text(feature.title)
                .font(.title2.bold())
                .multilineTextAlignment(.center)

            Text(feature.blurb)
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            Button(action: onUpgrade) {
                Label("Upgrade to unlock", systemImage: "lock.open")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding(.horizontal, 32)
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
}
