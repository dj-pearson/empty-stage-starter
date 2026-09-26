import Foundation
import SwiftUI

/// US-241: Per-kid badge catalog + streak tracker.
///
/// US-871: `kid_badges` is that eventual Supabase table, and this is the only
/// place that had to learn about it — the Badge enum, the criteria and the UI
/// all stayed put, as the original note predicted.
///
/// UserDefaults keyed `badges.<kidId>` is still written, and still read on
/// launch, but it is now a CACHE rather than the only home. On its own it did
/// not survive a reinstall, did not move to a new phone, and was invisible to
/// the second parent, who opened the grid and saw nothing for a child who had
/// earned eight badges. A year of progress is not a device detail.
///
/// The read order is the load-precedence contract in CLAUDE.md, in miniature:
/// the cache paints instantly and works offline, a successful server fetch
/// then wins — except that here it is a UNION rather than a replace. Badges
/// are append-only and the cache may hold earns this account made before the
/// table existed, so dropping local-only ids would delete a child's history
/// on first launch of the new build. `seedFromServer` uploads them instead.
@MainActor
final class BadgeService: ObservableObject {
    static let shared = BadgeService()

    /// Last badge earned across the whole session — drives the celebration
    /// sheet. UI clears this back to nil once the sheet dismisses so the
    /// next earn re-triggers the animation.
    @Published var pendingCelebration: Earned?

    /// Force-bumped after an earn so SwiftUI views observing the service
    /// re-render their grids without us shipping per-kid @Published sets.
    @Published private(set) var revisionCounter: Int = 0

    struct Earned: Identifiable, Equatable {
        let id = UUID()
        let badge: Badge
        let kidId: String
        let earnedAt: Date
    }

    private init() {}

    // MARK: - Public read API

    /// All earned badge IDs for a kid. Read-only snapshot.
    func earnedIds(forKid kidId: String) -> Set<String> {
        let raw = UserDefaults.standard.stringArray(forKey: Self.earnedKey(kidId)) ?? []
        return Set(raw)
    }

    /// True iff the badge has been earned by this kid before. Used by the
    /// grid to render earned vs locked styling.
    func hasEarned(_ badge: Badge, kidId: String) -> Bool {
        earnedIds(forKid: kidId).contains(badge.id)
    }

    /// Date the badge was first earned, or nil if not yet.
    func earnedAt(_ badge: Badge, kidId: String) -> Date? {
        let key = Self.earnedAtKey(kidId: kidId, badgeId: badge.id)
        let value = UserDefaults.standard.double(forKey: key)
        return value > 0 ? Date(timeIntervalSince1970: value) : nil
    }

    // MARK: - Streak

    /// Current streak of days with a logged meal result for a kid.
    ///
    /// M12: any logged result counts, "not today" included. Offering a food
    /// and writing down how it went is the exposure; a streak that a hard
    /// day could break taught parents to stop logging hard days, and those
    /// are the days a feeding therapist most wants to see. A missing day
    /// does not break it either (the family may just have forgotten to log),
    /// up to one skipped day in a row.
    func currentStreak(kidId: String, planEntries: [PlanEntry]) -> Int {
        Self.currentStreak(kidId: kidId, planEntries: planEntries, today: Date())
    }

    /// Best-ever streak, by the same rule as `currentStreak`, so the card can
    /// never show a current streak longer than the best one.
    func bestStreak(kidId: String, planEntries: [PlanEntry]) -> Int {
        Self.bestStreak(kidId: kidId, planEntries: planEntries, today: Date())
    }

    /// Distinct yyyy-MM-dd days with at least one logged result.
    nonisolated static func loggedDays(kidId: String, planEntries: [PlanEntry]) -> Set<String> {
        var days: Set<String> = []
        for entry in planEntries where entry.kidId == kidId && entry.result != nil {
            days.insert(entry.date)
        }
        return days
    }

    nonisolated static func currentStreak(kidId: String, planEntries: [PlanEntry], today: Date) -> Int {
        let calendar = Calendar.current
        let formatter = DateFormatter.isoDate
        let days = loggedDays(kidId: kidId, planEntries: planEntries)

        var streak = 0
        var skipsAllowed = 1
        var cursor = today
        // Cap the walk at 365 days to avoid pathological O(N) on very old
        // accounts; 365 is also the longest streak we ever care to display.
        for _ in 0..<365 {
            if days.contains(formatter.string(from: cursor)) {
                streak += 1
                skipsAllowed = 1
            } else if skipsAllowed > 0 {
                skipsAllowed -= 1
            } else {
                break
            }
            guard let prev = calendar.date(byAdding: .day, value: -1, to: cursor) else { break }
            cursor = prev
        }
        return streak
    }

    nonisolated static func bestStreak(kidId: String, planEntries: [PlanEntry], today: Date) -> Int {
        let calendar = Calendar.current
        let formatter = DateFormatter.isoDate
        let dates: [Date] = loggedDays(kidId: kidId, planEntries: planEntries)
            .compactMap { formatter.date(from: $0) }
            .map { calendar.startOfDay(for: $0) }
            .sorted()
        let current = currentStreak(kidId: kidId, planEntries: planEntries, today: today)
        guard !dates.isEmpty else { return current }

        var best = 1
        var run = 1
        for i in 1..<dates.count {
            let gap = calendar.dateComponents([.day], from: dates[i - 1], to: dates[i]).day ?? 99
            // One missing day between logged days keeps the run going, as
            // in currentStreak.
            if gap >= 1 && gap <= 2 {
                run += 1
            } else {
                run = 1
            }
            best = max(best, run)
        }
        return max(best, current)
    }

    // MARK: - Evaluation

    /// Walk the catalog, find any badges newly earned for this kid, persist
    /// them, and queue a celebration for the most prestigious one.
    ///
    /// Designed to be called from `AppState.updatePlanEntry` after a result
    /// is logged. Cheap — `Badge.allCases` is small and each criterion is
    /// O(N) over planEntries at worst, plus we only re-evaluate the kid that
    /// just had an entry change.
    func evaluate(
        kidId: String,
        foods: [Food],
        recipes: [Recipe],
        planEntries: [PlanEntry]
    ) {
        guard !kidId.isEmpty else { return }
        let already = earnedIds(forKid: kidId)
        var newlyEarned: [Badge] = []

        let context = BadgeContext(
            kidId: kidId,
            foods: foods,
            recipes: recipes,
            planEntries: planEntries,
            currentStreak: currentStreak(kidId: kidId, planEntries: planEntries)
        )

        for badge in Badge.allCases where !already.contains(badge.id) {
            if badge.criteria(context) {
                newlyEarned.append(badge)
            }
        }
        guard !newlyEarned.isEmpty else { return }

        let now = Date()
        for badge in newlyEarned {
            persist(badgeId: badge.id, kidId: kidId, earnedAt: now)
        }

        // US-871: and to the server, so the badge survives this phone. Local
        // first, deliberately: the celebration below fires either way, and a
        // parent whose signal dropped at the dinner table should still see
        // their child's badge.
        let earnedIds = newlyEarned.map(\.id)
        Task { await self.upload(badgeIds: earnedIds, kidId: kidId, earnedAt: now) }

        revisionCounter &+= 1

        // Queue the highest-tier badge for celebration; lesser ones still get
        // persisted but quietly to avoid stacking five sheets in a row.
        if let best = newlyEarned.max(by: { $0.tier.rawValue < $1.tier.rawValue }) {
            // US-853: parked on disk as well as in memory. An earn can happen
            // with no UI on screen at all -- LogMealResultIntent runs this
            // from a Siri phrase, in the app's process but often with the app
            // in the background, and the @Published value dies with that
            // process. A child earning their first badge and nobody ever
            // seeing it is the failure worth avoiding; the sheet is the whole
            // point of a badge.
            parkCelebration(badgeId: best.id, kidId: kidId, earnedAt: now)
            pendingCelebration = Earned(badge: best, kidId: kidId, earnedAt: now)
            // Lightweight toast for users who aren't currently on the Progress
            // screen — the celebration sheet only fires there. The toast is
            // fire-and-forget; tapping it doesn't deep-link yet (nav-stack
            // refactor needed), but the visual confirmation is the key win.
            ToastManager.shared.success(
                "New badge: \(best.title)",
                message: best.description
            )
        }
    }

    /// Clear the celebration after the sheet dismisses so a future earn can
    /// re-trigger the animation.
    func dismissCelebration() {
        pendingCelebration = nil
        // US-853: and from disk, or it comes back on the next launch. Seeing
        // the same badge celebrated twice reads as a bug and devalues the
        // next real one.
        UserDefaults.standard.removeObject(forKey: Self.parkedCelebrationKey)
    }

    // MARK: - Celebration that outlives the process (US-853)

    static let parkedCelebrationKey = "badges.pendingCelebration"

    struct ParkedCelebration: Codable, Equatable {
        let badgeId: String
        let kidId: String
        let earnedAt: Date
    }

    func parkCelebration(badgeId: String, kidId: String, earnedAt: Date) {
        guard let data = try? JSONEncoder().encode(
            ParkedCelebration(badgeId: badgeId, kidId: kidId, earnedAt: earnedAt)
        ) else { return }
        UserDefaults.standard.set(data, forKey: Self.parkedCelebrationKey)
    }

    /// Promote a badge earned while nothing was on screen into the live
    /// celebration, so it surfaces the next time the app opens (AC3).
    ///
    /// Does nothing when a celebration is already showing: an earn that just
    /// happened in-app is the more recent one, and replacing it mid-animation
    /// would swap the badge under the user.
    func restoreParkedCelebration() {
        guard pendingCelebration == nil,
              let data = UserDefaults.standard.data(forKey: Self.parkedCelebrationKey),
              let parked = try? JSONDecoder().decode(ParkedCelebration.self, from: data),
              let badge = Badge(rawValue: parked.badgeId) else { return }

        // A badge id this build does not know about is dropped rather than
        // kept forever: it can only come from a newer build on the same
        // device, and there is nothing to draw for it.
        pendingCelebration = Earned(badge: badge, kidId: parked.kidId, earnedAt: parked.earnedAt)
    }

    // MARK: - Server durability (US-871)

    /// Kids whose badges have already been seeded this launch, so a second
    /// load does not re-upload the same local-only rows.
    private var seededKidIds: Set<String> = []

    /// Fold the server's badges into the local cache, and push up anything
    /// only this device knows about.
    ///
    /// A union, not a replace. Every account that used the app before
    /// `kid_badges` existed holds its badges solely in UserDefaults, so
    /// letting the server's (empty) answer win would erase a child's history
    /// on the first launch of the build that added the table. The upload is
    /// what closes that gap permanently: once those ids are rows, the next
    /// phone reads them.
    ///
    /// Safe to call repeatedly — the upsert is keyed on (kid_id, badge_id).
    func seedFromServer(kidIds: [String]) async {
        guard !kidIds.isEmpty else { return }

        let remote: [KidBadge]
        do {
            remote = try await DataService.shared.fetchKidBadges()
        } catch {
            // Offline or refused: the cache is still there and the grid still
            // renders. Nothing is lost, and the next launch tries again.
            SentryService.capture(error, extras: ["context": "badge_seed_from_server"])
            return
        }

        var changed = false
        for kidId in kidIds where !seededKidIds.contains(kidId) {
            let plan = BadgeSync.plan(
                local: earnedIds(forKid: kidId),
                server: Set(remote.filter { $0.kidId == kidId }.map(\.badgeId))
            )

            // Down: badges earned on another device or another phone. The
            // server's date is kept, so a badge earned in March reads as March
            // on the new phone too.
            for badgeId in plan.download {
                let earnedAt = remote.first { $0.kidId == kidId && $0.badgeId == badgeId }
                    .flatMap { ISO8601DateFormatter().date(from: $0.earnedAt) } ?? Date()
                persist(badgeId: badgeId, kidId: kidId, earnedAt: earnedAt)
                changed = true
            }

            // Up: badges this device earned before the table existed. Their
            // dates come from the cache for the same reason.
            if !plan.upload.isEmpty {
                await upload(badgeIds: plan.upload, kidId: kidId, earnedAt: nil)
            }
            seededKidIds.insert(kidId)
        }

        if changed { revisionCounter &+= 1 }
    }

    /// Write badges to `kid_badges`, queueing on a lost connection.
    ///
    /// `earnedAt` nil means "look the date up in the cache", which is what the
    /// seed's upload wants: a badge earned in March must not arrive stamped
    /// with today.
    private func upload(badgeIds: [String], kidId: String, earnedAt: Date?) async {
        let formatter = ISO8601DateFormatter()

        // US-853: with no session there is nobody to attribute the row to, and
        // a queued insert tagged with an empty user id is adopted by whoever
        // signs in next. The badge is already in the cache either way, and
        // seedFromServer pushes it up on the next authenticated launch -- the
        // same path that carries every badge earned before this table existed.
        guard !Self.currentUserIdForQueue().isEmpty else { return }

        for badgeId in badgeIds {
            let when = earnedAt
                ?? Badge(rawValue: badgeId).flatMap { self.earnedAt($0, kidId: kidId) }
                ?? Date()
            let row = KidBadgeInsert(
                kidId: kidId,
                badgeId: badgeId,
                earnedAt: formatter.string(from: when)
            )

            do {
                try await DataService.shared.insertKidBadge(row)
            } catch {
                // The badge is already in UserDefaults and on screen. Queue the
                // row so it reaches the next phone, and say nothing: a parent
                // celebrating their child's badge does not need a sync notice.
                OfflineStore.shared.enqueueInsert(
                    row,
                    table: .kidBadges,
                    entityId: row.id,
                    userId: Self.currentUserIdForQueue()
                )
            }
        }
    }

    /// The signed-in user id the offline queue tags mutations with (US-489).
    ///
    /// Read from the client rather than threaded in, because `evaluate` is
    /// called from three places that do not have it. An empty string is
    /// adopted by whoever is signed in at drain time, which is the legacy
    /// behaviour the queue already handles.
    private static func currentUserIdForQueue() -> String {
        SupabaseManager.client.auth.currentSession?.user.id.uuidString.lowercased() ?? ""
    }

    // MARK: - Persistence

    private func persist(badgeId: String, kidId: String, earnedAt: Date) {
        let listKey = Self.earnedKey(kidId)
        var current = UserDefaults.standard.stringArray(forKey: listKey) ?? []
        if !current.contains(badgeId) {
            current.append(badgeId)
            UserDefaults.standard.set(current, forKey: listKey)
        }
        UserDefaults.standard.set(
            earnedAt.timeIntervalSince1970,
            forKey: Self.earnedAtKey(kidId: kidId, badgeId: badgeId)
        )
    }

    private static func earnedKey(_ kidId: String) -> String {
        "badges.\(kidId).earned"
    }

    private static func earnedAtKey(kidId: String, badgeId: String) -> String {
        "badges.\(kidId).earnedAt.\(badgeId)"
    }
}

// MARK: - Badge catalog

/// Per-evaluation snapshot passed to each badge's criterion. Keeps criteria
/// pure functions so they're easy to reason about and unit-test later.
struct BadgeContext {
    let kidId: String
    let foods: [Food]
    let recipes: [Recipe]
    let planEntries: [PlanEntry]
    let currentStreak: Int

    /// Plan entries scoped to this kid only — most criteria want this, not
    /// the cross-household pool.
    var kidEntries: [PlanEntry] {
        planEntries.filter { $0.kidId == kidId }
    }

    /// Distinct food IDs the kid has logged a `tasted`-or-better result for.
    var triedFoodIds: Set<String> {
        Set(kidEntries.compactMap { entry -> String? in
            guard let result = entry.result,
                  result == MealResult.ate.rawValue || result == MealResult.tasted.rawValue
            else { return nil }
            return entry.foodId
        })
    }

    /// Distinct categories among foods the kid has tried.
    var triedCategories: Set<String> {
        let tried = triedFoodIds
        return Set(foods.filter { tried.contains($0.id) }.map(\.category))
    }

    func triedCount(in category: FoodCategory) -> Int {
        let tried = triedFoodIds
        return foods.filter { tried.contains($0.id) && $0.category == category.rawValue }.count
    }
}

enum BadgeTier: Int {
    case bronze = 1
    case silver = 2
    case gold = 3
    case platinum = 4
}

/// Stable badge catalog. Adding a case is the only way to introduce a new
/// badge — keeps badge IDs stable across releases for analytics + persistence.
enum Badge: String, CaseIterable, Identifiable {
    case firstTryBite
    case fiveDayStreak
    case tenDayStreak
    case categoryExplorer       // foods tried in 5+ categories
    case vegetableExplorer      // 10 distinct veg
    case fruitExplorer          // 10 distinct fruit
    case proteinPro             // 10 distinct protein
    case weekWarrior            // 7+ result entries
    case consistentTracker      // 30+ result entries
    case recipeChef             // 5+ recipes
    case loggedThirtyMeals      // 30+ planned meals
    // Id kept so earned badges stay earned; it now means "5 meals logged this
    // week", whatever the results. "0 refusals" rewarded hiding hard meals.
    case perfectWeek

    var id: String { rawValue }

    var title: String {
        switch self {
        case .firstTryBite:      return "First Try-Bite"
        case .fiveDayStreak:     return "5-Day Streak"
        case .tenDayStreak:      return "10-Day Streak"
        case .categoryExplorer:  return "Category Explorer"
        case .vegetableExplorer: return "Vegetable Explorer"
        case .fruitExplorer:     return "Fruit Explorer"
        case .proteinPro:        return "Protein Pro"
        case .weekWarrior:       return "Week Warrior"
        case .consistentTracker: return "Consistent Tracker"
        case .recipeChef:        return "Recipe Chef"
        case .loggedThirtyMeals: return "Meal Master"
        case .perfectWeek:       return "Steady Week"
        }
    }

    /// Single-line description shown on the badge tile.
    var description: String {
        switch self {
        case .firstTryBite:      return "Tried a new food"
        case .fiveDayStreak:     return "5 days of logged meals in a row"
        case .tenDayStreak:      return "10 days of logged meals in a row"
        case .categoryExplorer:  return "Tried foods from 5 categories"
        case .vegetableExplorer: return "10 different vegetables 🥦"
        case .fruitExplorer:     return "10 different fruits 🍎"
        case .proteinPro:        return "10 different proteins 🥩"
        case .weekWarrior:       return "Logged 7 meal results"
        case .consistentTracker: return "Logged 30 meal results"
        case .recipeChef:        return "Created 5 recipes"
        case .loggedThirtyMeals: return "Planned 30 meals"
        case .perfectWeek:       return "Logged 5 meals this week"
        }
    }

    var icon: String {
        switch self {
        case .firstTryBite:      return "star.fill"
        case .fiveDayStreak:     return "flame.fill"
        case .tenDayStreak:      return "flame.circle.fill"
        case .categoryExplorer:  return "square.grid.3x3.fill"
        case .vegetableExplorer: return "leaf.fill"
        // `apple.logo` is reserved for Apple-platform branding indicators —
        // pick a generic juicy/colorful symbol instead.
        case .fruitExplorer:     return "drop.circle.fill"
        case .proteinPro:        return "fish.fill"
        case .weekWarrior:       return "calendar.badge.checkmark"
        case .consistentTracker: return "checkmark.seal.fill"
        case .recipeChef:        return "book.closed.fill"
        case .loggedThirtyMeals: return "fork.knife"
        case .perfectWeek:       return "crown.fill"
        }
    }

    var color: Color {
        switch tier {
        case .bronze:   return Color(red: 0.80, green: 0.50, blue: 0.20)
        case .silver:   return .gray
        case .gold:     return .yellow
        case .platinum: return .purple
        }
    }

    var tier: BadgeTier {
        switch self {
        case .firstTryBite, .weekWarrior, .recipeChef:                 return .bronze
        case .fiveDayStreak, .categoryExplorer, .loggedThirtyMeals:    return .silver
        case .tenDayStreak, .vegetableExplorer, .fruitExplorer,
             .proteinPro, .consistentTracker:                          return .gold
        // Tier stays in step with src/lib/badgeCatalog.ts (the web draws it
        // from there; badgeCatalog.parity.test.ts checks both).
        case .perfectWeek:                                             return .platinum
        }
    }

    /// Pure criterion — given a snapshot, returns true iff the badge should
    /// now be earned. Criteria run on every plan-entry update; keep them
    /// fast and side-effect-free.
    func criteria(_ ctx: BadgeContext) -> Bool {
        switch self {
        case .firstTryBite:
            return !ctx.triedFoodIds.isEmpty
        case .fiveDayStreak:
            return ctx.currentStreak >= 5
        case .tenDayStreak:
            return ctx.currentStreak >= 10
        case .categoryExplorer:
            return ctx.triedCategories.count >= 5
        case .vegetableExplorer:
            return ctx.triedCount(in: .vegetable) >= 10
        case .fruitExplorer:
            return ctx.triedCount(in: .fruit) >= 10
        case .proteinPro:
            return ctx.triedCount(in: .protein) >= 10
        case .weekWarrior:
            return ctx.kidEntries.filter { $0.result != nil }.count >= 7
        case .consistentTracker:
            return ctx.kidEntries.filter { $0.result != nil }.count >= 30
        case .recipeChef:
            // Recipes aren't kid-scoped in the model; counts the household total.
            return ctx.recipes.count >= 5
        case .loggedThirtyMeals:
            return ctx.kidEntries.count >= 30
        case .perfectWeek:
            let formatter = DateFormatter.isoDate
            let weekDates = Set(Date().weekDates.map(formatter.string(from:)))
            let logged = ctx.kidEntries.filter { weekDates.contains($0.date) && $0.result != nil }.count
            return logged >= 5
        }
    }
}
