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

    // Types we write. Only the individual dietary sample types —
    // HKCorrelationType(.food) is deliberately omitted because HealthKit
    // raises an Objective-C NSException ("Invalid type") when you include
    // a correlation type in `toShare`; the correlation is just a container
    // and HKHealthStore.save accepts it as long as the component sample
    // types are authorized.
    private var writeTypes: Set<HKSampleType> {
        [
            HKQuantityType(.dietaryEnergyConsumed),
            HKQuantityType(.dietaryProtein),
            HKQuantityType(.dietaryCarbohydrates),
            HKQuantityType(.dietaryFatTotal)
        ]
    }

    // US-228: Types we READ to pre-fill kid profile growth fields.
    // Includes a characteristic (date of birth — one-shot, never changes) and
    // two quantity types (height, body mass) we sample most-recent only.
    private var readTypes: Set<HKObjectType> {
        var types: Set<HKObjectType> = [
            HKQuantityType(.height),
            HKQuantityType(.bodyMass)
        ]
        if let dob = HKObjectType.characteristicType(forIdentifier: .dateOfBirth) {
            types.insert(dob)
        }
        return types
    }

    private init() {}

    // MARK: - Authorization

    /// Requests write permission for the dietary types we care about.
    /// Returns true when HealthKit is available and at least one of the
    /// requested types ended up authorized. Both Objective-C NSExceptions
    /// and Swift errors surface as thrown Swift errors rather than a
    /// SIGABRT.
    func requestAuthorization() async throws -> Bool {
        guard isAvailable else { return false }

        let types = writeTypes
        guard !types.isEmpty else { return false }

        // HealthKit's internal validation can raise Objective-C exceptions
        // (e.g. invalid type passed to `toShare`, missing entitlement,
        // provisioning-profile capability mismatch). Swift try/catch
        // doesn't catch those — they propagate as SIGABRT. The
        // NSExceptionCatcher bridge converts them into Swift errors.
        //
        // The async `requestAuthorization` validates synchronously before
        // it schedules its completion, so the raise happens on the caller
        // thread. Using the callback form inside the catcher is the only
        // way to keep the raise in the @try scope.
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            var didResume = false
            do {
                try NSExceptionCatcher.try {
                    self.store.requestAuthorization(toShare: types, read: []) { _, error in
                        guard !didResume else { return }
                        didResume = true
                        if let error {
                            continuation.resume(throwing: error)
                        } else {
                            continuation.resume()
                        }
                    }
                }
            } catch {
                guard !didResume else { return }
                didResume = true
                SentryService.capture(error, extras: [
                    "context": "healthkit_requestAuthorization_nsexception"
                ])
                continuation.resume(throwing: error)
            }
        }

        // HealthKit doesn't disclose whether the user tapped Allow or Deny
        // for privacy reasons. The per-type authorizationStatus at least
        // distinguishes .notDetermined from .sharingAuthorized / .sharingDenied.
        return types.contains { type in
            store.authorizationStatus(for: type) == .sharingAuthorized
        }
    }

    // MARK: - Reading growth data (US-228)

    struct KidGrowthSnapshot: Equatable {
        let dateOfBirth: Date?
        let heightCm: Double?
        let weightKg: Double?
        let lastSyncedAt: Date

        var derivedAge: Int? {
            guard let dob = dateOfBirth else { return nil }
            let comps = Calendar.current.dateComponents([.year], from: dob, to: Date())
            guard let years = comps.year, years >= 0 else { return nil }
            return years
        }
    }

    /// Requests read permission for date of birth, height, and body mass.
    /// Returns true if HealthKit is available and permission was at least
    /// presented. Read auth status is opaque to the app per Apple privacy
    /// rules — callers should attempt the read and treat absence as "no data".
    func requestReadAuthorization() async throws -> Bool {
        guard isAvailable else { return false }

        let types = readTypes
        guard !types.isEmpty else { return false }

        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            var didResume = false
            do {
                try NSExceptionCatcher.try {
                    self.store.requestAuthorization(toShare: [], read: types) { _, error in
                        guard !didResume else { return }
                        didResume = true
                        if let error {
                            continuation.resume(throwing: error)
                        } else {
                            continuation.resume()
                        }
                    }
                }
            } catch {
                guard !didResume else { return }
                didResume = true
                SentryService.capture(error, extras: [
                    "context": "healthkit_read_request_nsexception"
                ])
                continuation.resume(throwing: error)
            }
        }
        return true
    }

    /// Reads the most recent height + weight samples and the user's date of
    /// birth (if available). Any individual field returns nil when unset or
    /// access was denied — the caller decides whether to surface a message.
    func readKidGrowthSnapshot() async -> KidGrowthSnapshot {
        guard isAvailable else {
            return KidGrowthSnapshot(dateOfBirth: nil, heightCm: nil, weightKg: nil, lastSyncedAt: Date())
        }

        let dob = readDateOfBirth()
        async let height = readMostRecentQuantity(
            HKQuantityType(.height),
            unit: HKUnit.meterUnit(with: .centi)
        )
        async let weight = readMostRecentQuantity(
            HKQuantityType(.bodyMass),
            unit: HKUnit.gramUnit(with: .kilo)
        )

        return KidGrowthSnapshot(
            dateOfBirth: dob,
            heightCm: await height,
            weightKg: await weight,
            lastSyncedAt: Date()
        )
    }

    private func readDateOfBirth() -> Date? {
        do {
            let components = try store.dateOfBirthComponents()
            return Calendar(identifier: components.calendar?.identifier ?? .gregorian)
                .date(from: components)
        } catch {
            return nil
        }
    }

    private func readMostRecentQuantity(
        _ type: HKQuantityType,
        unit: HKUnit
    ) async -> Double? {
        await withCheckedContinuation { continuation in
            let sortByEnd = NSSortDescriptor(
                key: HKSampleSortIdentifierEndDate,
                ascending: false
            )
            let query = HKSampleQuery(
                sampleType: type,
                predicate: nil,
                limit: 1,
                sortDescriptors: [sortByEnd]
            ) { _, samples, _ in
                let sample = (samples?.first as? HKQuantitySample)?.quantity.doubleValue(for: unit)
                continuation.resume(returning: sample)
            }
            store.execute(query)
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
