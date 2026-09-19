import XCTest
@testable import EatPal

/// US-708: `onboarding_completed` must mean the same thing on both clients.
///
/// It did not. Completion lived in `@AppStorage("hasCompletedOnboarding")`,
/// device-local and written nowhere else, so the column read false for 174 of
/// 200 accounts -- including every Apple user who had finished the slides. Web
/// reads that column for its re-engagement nudges (US-770), so those people
/// were being told to finish a setup they had done months earlier, and a new
/// phone put them through it again.
///
/// Tested against the pure statics and a scratch `UserDefaults`, because
/// `refresh()` and `markCompleted()` both need a live Supabase client. The
/// decisions worth pinning are all expressible without one: what the cache says
/// at launch, what an upgrade inherits, and how a server answer -- including one
/// that never arrived -- folds into the gate.
@MainActor
final class OnboardingServiceTests: XCTestCase {

    private var defaults: UserDefaults!
    private var suiteName: String!

    override func setUp() {
        super.setUp()
        // A scratch suite per test: UserDefaults.standard is shared with the
        // running app and with every other suite.
        suiteName = "OnboardingServiceTests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        suiteName = nil
        super.tearDown()
    }

    // MARK: - Seeding from the server (AC9)

    func testServerSaysCompleted() {
        XCTAssertFalse(
            OnboardingService.resolveNeedsOnboarding(server: .completed, cached: nil)
        )
        // A stale cache saying otherwise does not win over a real answer.
        XCTAssertFalse(
            OnboardingService.resolveNeedsOnboarding(server: .completed, cached: false)
        )
    }

    func testServerSaysNotCompleted() {
        XCTAssertTrue(
            OnboardingService.resolveNeedsOnboarding(server: .notCompleted, cached: nil)
        )
        XCTAssertTrue(
            OnboardingService.resolveNeedsOnboarding(server: .notCompleted, cached: true)
        )
    }

    func testAThrowingReadDoesNotPutAnOnboardedUserBackThroughSetup() {
        // AC5, and the case that matters most in the field: a network blip on a
        // phone belonging to someone who onboarded a year ago.
        XCTAssertFalse(
            OnboardingService.resolveNeedsOnboarding(server: .unresolved, cached: true)
        )
    }

    func testAThrowingReadKeepsSomeoneMidSetupInSetup() {
        XCTAssertTrue(
            OnboardingService.resolveNeedsOnboarding(server: .unresolved, cached: false)
        )
    }

    func testAThrowingReadWithNothingCachedFailsOpenToTheApp() {
        // Deliberate: a first launch with no signal shows the app rather than a
        // first-run flow that cannot be finished. The next refresh corrects it.
        XCTAssertFalse(
            OnboardingService.resolveNeedsOnboarding(server: .unresolved, cached: nil)
        )
    }

    // MARK: - The upgrade seed (AC6)

    func testUpgradeInheritsTheLegacyFlag() {
        // The 174 accounts. They finished setup on a build that only ever wrote
        // the AppStorage key, and must not be asked again.
        XCTAssertTrue(OnboardingService.seedFromCaches(cached: nil, legacy: true))
    }

    func testUpgradeFromAnUnfinishedSetupStaysUnfinished() {
        XCTAssertFalse(OnboardingService.seedFromCaches(cached: nil, legacy: false))
    }

    func testFreshInstallIsNotTreatedAsCompleted() {
        // Neither key set: nobody has told us anything, and a new account has
        // not onboarded.
        XCTAssertFalse(
            OnboardingService.seedFromCaches(cached: nil, legacy: nil),
            "a fresh install must not start life marked as completed"
        )
    }

    func testTheNewCacheWinsOnceItExists() {
        // Otherwise a legacy key left behind on disk would keep overriding the
        // answer the server gave us.
        XCTAssertTrue(OnboardingService.seedFromCaches(cached: true, legacy: false))
        XCTAssertFalse(OnboardingService.seedFromCaches(cached: false, legacy: true))
    }

    func testStoredFlagTellsUnsetApartFromFalse() {
        // The whole upgrade path rests on this distinction, which
        // UserDefaults.bool(forKey:) cannot make.
        XCTAssertNil(OnboardingService.storedFlag(in: defaults, key: "absent"))
        defaults.set(false, forKey: "present")
        XCTAssertEqual(OnboardingService.storedFlag(in: defaults, key: "present"), false)
    }

    // MARK: - Launch reads the cache synchronously (AC4)

    func testInitSeedsFromTheCacheWithoutWaitingOnAnything() {
        defaults.set(true, forKey: OnboardingService.cacheKey)
        let service = OnboardingService(defaults: defaults)
        XCTAssertFalse(service.needsOnboarding)
    }

    func testInitSeedsFromTheLegacyKeyOnUpgrade() {
        defaults.set(true, forKey: OnboardingService.legacyKey)
        let service = OnboardingService(defaults: defaults)

        XCTAssertFalse(service.needsOnboarding, "an upgrade must not re-onboard")
        // Migrated through, so the legacy key is consulted once and the answer
        // survives even if that key is later cleared.
        XCTAssertEqual(
            OnboardingService.storedFlag(in: defaults, key: OnboardingService.cacheKey),
            true
        )
    }

    func testAFreshInstallStartsInOnboarding() {
        let service = OnboardingService(defaults: defaults)
        XCTAssertTrue(service.needsOnboarding)
    }

    // MARK: - The write (AC3)

    func testTheUpdateSetsOnlyTheOnboardingColumn() throws {
        // markCompleted sends this. Encoding it here is what proves the write
        // cannot blank full_name -- optionals encode with encodeIfPresent, so
        // an unset field is absent rather than null.
        let json = try JSONEncoder().encode(ProfileUpdate(onboardingCompleted: true))
        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: json) as? [String: Any]
        )

        XCTAssertEqual(object["onboarding_completed"] as? Bool, true)
        XCTAssertNil(object["full_name"], "an unset column must not be written as null")
        XCTAssertEqual(object.keys.count, 1)
    }

    func testTheQueuedWriteIsTheSameShapeTheReplayDecodes() throws {
        // markCompleted falls back to OfflineStore when the write fails, and
        // US-809 routes profiles updates through decodeUpdate. If these two
        // disagreed the queued write would quarantine on every drain.
        let json = try JSONEncoder().encode(ProfileUpdate(onboardingCompleted: true))
        let decoded = try OfflineStore.decodeUpdate(
            table: OfflineStore.Table.profiles.rawValue,
            data: json,
            decoder: JSONDecoder()
        )

        guard case .profile(let update) = decoded else {
            return XCTFail("a profiles update routed to \(decoded)")
        }
        XCTAssertEqual(update.onboardingCompleted, true)
    }
}
