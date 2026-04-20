import Foundation
import HealthKit

/// US-144: Writes logged meals (plan_entries with result == .ate) into the
/// iPhone Health app as dietary samples — calories, protein, carbs, fat —
/// bundled into a single `HKCorrelation` per meal so they read as one entry
/// in Health, not four orphan samples.
///
/// Opt-in. Disabled by default. Users flip the switch in Settings after
/// granting HealthKit permission on first use.
@MainActor
final class HealthKitService {
    static let shared = HealthKitService()

    /// UserDefaults key for the user's opt-in preference (distinct from the
    /// HealthKit authorization status, which Apple owns).
    static let enabledDefaultsKey = "eatpal_health_sync_enabled"

    private let store = HKHealthStore()

    /// Whether HealthKit is available on the current device. iPads without
    /// the Health app and some Mac Catalyst variants return false.
    var isAvailable: Bool {
        HKHealthStore.isHealthDataAvailable()
    }

    /// The user's opt-in preference. Defaults to false; only the setter
    /// persists to UserDefaults.
    var isEnabled: Bool {
        get { UserDefaults.standard.bool(forKey: Self.enabledDefaultsKey) }
        set { UserDefaults.standard.set(newValue, forKey: Self.enabledDefaultsKey) }
    }

    // Types we write. Built without force-unwraps so a missing system
    // identifier can never crash the app during authorization.
    private var writeTypes: Set<HKSampleType> {
        var types: Set<HKSampleType> = [
            HKQuantityType(.dietaryEnergyConsumed),
            HKQuantityType(.dietaryProtein),
            HKQuantityType(.dietaryCarbohydrates),
            HKQuantityType(.dietaryFatTotal)
        ]
        if let correlation = HKObjectType.correlationType(forIdentifier: .food) {
            types.insert(correlation)
        }
        return types
    }

    private init() {}

    // MARK: - Authorization

    /// Requests write permission for the dietary types we care about.
    /// Returns true when HealthKit is available and at least one of the
    /// requested types ended up authorized. Any HealthKit error surfaces
    /// as a thrown Swift error rather than an uncaught NSException.
    func requestAuthorization() async throws -> Bool {
        guard isAvailable else { return false }

        let types = writeTypes
        guard !types.isEmpty else { return false }

        // HealthKit APIs can raise Objective-C exceptions for configuration
        // issues (missing usage strings, missing entitlement). Wrap the call
        // so we convert those into Swift errors instead of hard crashes —
        // users get an actionable message and we keep the app alive.
        do {
            try await store.requestAuthorization(toShare: types, read: [])
        } catch {
            SentryService.capture(error, extras: [
                "context": "healthkit_requestAuthorization",
                "typesCount": "\(types.count)"
            ])
            throw error
        }

        // HealthKit doesn't disclose whether the user tapped Allow or Deny
        // for privacy reasons. The per-type authorizationStatus at least
        // distinguishes .notDetermined from .sharingAuthorized / .sharingDenied.
        return types.contains { type in
            store.authorizationStatus(for: type) == .sharingAuthorized
        }
    }

    // MARK: - Writing a meal

    /// Writes a meal's macros as a single `HKCorrelation` of type `.food`.
    /// No-op if the user hasn't opted in, HealthKit is unavailable, or the
    /// nutrition payload is entirely empty.
    func writeMeal(
        calories: Double?,
        proteinGrams: Double?,
        carbsGrams: Double?,
        fatGrams: Double?,
        mealDate: Date,
        mealName: String?
    ) async throws {
        guard isEnabled, isAvailable else { return }

        var samples: Set<HKSample> = []

        if let calories, calories > 0 {
            let type = HKQuantityType(.dietaryEnergyConsumed)
            let quantity = HKQuantity(unit: .kilocalorie(), doubleValue: calories)
            samples.insert(HKQuantitySample(type: type, quantity: quantity, start: mealDate, end: mealDate))
        }
        if let proteinGrams, proteinGrams > 0 {
            let type = HKQuantityType(.dietaryProtein)
            let quantity = HKQuantity(unit: .gram(), doubleValue: proteinGrams)
            samples.insert(HKQuantitySample(type: type, quantity: quantity, start: mealDate, end: mealDate))
        }
        if let carbsGrams, carbsGrams > 0 {
            let type = HKQuantityType(.dietaryCarbohydrates)
            let quantity = HKQuantity(unit: .gram(), doubleValue: carbsGrams)
            samples.insert(HKQuantitySample(type: type, quantity: quantity, start: mealDate, end: mealDate))
        }
        if let fatGrams, fatGrams > 0 {
            let type = HKQuantityType(.dietaryFatTotal)
            let quantity = HKQuantity(unit: .gram(), doubleValue: fatGrams)
            samples.insert(HKQuantitySample(type: type, quantity: quantity, start: mealDate, end: mealDate))
        }

        guard !samples.isEmpty else { return }

        guard let correlationType = HKObjectType.correlationType(forIdentifier: .food) else { return }

        // Metadata: use the dish name as HKMetadataKeyFoodType so the
        // sample shows up with context in Health. We deliberately avoid
        // storing kid names or EatPal IDs — HealthKit data is not the
        // place for our internal PII.
        var metadata: [String: Any] = [:]
        if let mealName {
            metadata[HKMetadataKeyFoodType] = mealName
        }

        let correlation = HKCorrelation(
            type: correlationType,
            start: mealDate,
            end: mealDate,
            objects: samples,
            metadata: metadata.isEmpty ? nil : metadata
        )

        try await store.save(correlation)
    }
}
