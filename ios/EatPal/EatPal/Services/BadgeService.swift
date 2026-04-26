import Foundation
import SwiftUI

/// US-241: Per-kid badge catalog + streak tracker.
///
/// Persistence is local-first (UserDefaults keyed `badges.<kidId>`) so this
/// ships without a DB migration. When the eventual `kid_badges` Supabase
/// table lands, this class is the only place that needs to learn about it
/// — the Badge enum, criteria, and UI all stay put.
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

    /// Current consecutive-day try-bite streak for a kid.
    ///
    /// A "try-bite" is any day with at least one `ate` or `tasted` result on a
    /// PlanEntry. A `refused` result on the most recent day breaks the streak
    /// (per AC), but a missing day does NOT — the family might just have
    /// forgotten to log, and we don't want to punish that. Walks back from
    /// today and counts consecutive try-bite days separated by ≤ 1 missing day.
    func currentStreak(kidId: String, planEntries: [PlanEntry]) -> Int {
        let calendar = Calendar.current
        let formatter = DateFormatter.isoDate

        // Index entries by yyyy-MM-dd day key for O(1) lookups while walking.
        var byDay: [String: [String]] = [:]  // day → [result strings]
        for entry in planEntries where entry.kidId == kidId {
            guard let result = entry.result else { continue }
            byDay[entry.date, default: []].append(result)
        }

        // Walk back from today. A day with `refused` (and no `ate`/`tasted`
        // alongside it) breaks the streak. A day with no entries is treated
        // as a "skip" — allowed up to one in a row before the streak ends.
        var streak = 0
        var skipsAllowed = 1
        var cursor = Date()
        // Cap the walk at 365 days to avoid pathological O(N) on very old
        // accounts; 365 is also the longest streak we ever care to display.
        for _ in 0..<365 {
            let key = formatter.string(from: cursor)
            let results = byDay[key] ?? []

            if results.isEmpty {
                if skipsAllowed > 0 {
                    skipsAllowed -= 1
                } else {
                    break
                }
            } else {
                let hasTryBite = results.contains { $0 == MealResult.ate.rawValue || $0 == MealResult.tasted.rawValue }
                let hasRefusal = results.contains { $0 == MealResult.refused.rawValue }
                if hasTryBite {
                    streak += 1
                    skipsAllowed = 1  // reset skip budget on a productive day
                } else if hasRefusal {
                    // Pure-refusal day breaks the streak.
                    break
                } else {
                    if skipsAllowed > 0 {
                        skipsAllowed -= 1
                    } else {
                        break
                    }
                }
            }

            guard let prev = calendar.date(byAdding: .day, value: -1, to: cursor) else { break }
            cursor = prev
        }
        return streak
    }

    /// Best-ever streak the kid achieved, computed from the same entries.
    /// Recomputed on demand — cheap enough at hundreds of entries; if this
    /// becomes a perf hot spot later, cache against the planEntries hash.
    func bestStreak(kidId: String, planEntries: [PlanEntry]) -> Int {
        let formatter = DateFormatter.isoDate
        let calendar = Calendar.current

        // Distinct days that had a try-bite result, sorted ascending.
        let tryBiteDays: [Date] = planEntries
            .filter { $0.kidId == kidId }
            .compactMap { entry -> Date? in
                guard let result = entry.result,
                      result == MealResult.ate.rawValue || result == MealResult.tasted.rawValue,
                      let date = formatter.date(from: entry.date) else { return nil }
                return calendar.startOfDay(for: date)
            }

        let uniqueSorted = Array(Set(tryBiteDays)).sorted()
        guard !uniqueSorted.isEmpty else { return 0 }

        var best = 1
        var current = 1
        for i in 1..<uniqueSorted.count {
            if let diff = calendar.dateComponents([.day], from: uniqueSorted[i - 1], to: uniqueSorted[i]).day,
               diff == 1 {
                current += 1
                best = max(best, current)
            } else {
                current = 1
            }
        }
        return best
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

        revisionCounter &+= 1

        // Queue the highest-tier badge for celebration; lesser ones still get
        // persisted but quietly to avoid stacking five sheets in a row.
        if let best = newlyEarned.max(by: { $0.tier.rawValue < $1.tier.rawValue }) {
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
    case perfectWeek            // 5+ ate results in current calendar week, 0 refused

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
        case .perfectWeek:       return "Perfect Week"
        }
    }

    /// Single-line description shown on the badge tile.
    var description: String {
        switch self {
        case .firstTryBite:      return "Tried a new food"
        case .fiveDayStreak:     return "5 days of try-bites in a row"
        case .tenDayStreak:      return "10 days of try-bites in a row"
        case .categoryExplorer:  return "Tried foods from 5 categories"
        case .vegetableExplorer: return "10 different vegetables 🥦"
        case .fruitExplorer:     return "10 different fruits 🍎"
        case .proteinPro:        return "10 different proteins 🥩"
        case .weekWarrior:       return "Logged 7 meal results"
        case .consistentTracker: return "Logged 30 meal results"
        case .recipeChef:        return "Created 5 recipes"
        case .loggedThirtyMeals: return "Planned 30 meals"
        case .perfectWeek:       return "5+ wins, 0 refusals this week"
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
            let thisWeek = ctx.kidEntries.filter { weekDates.contains($0.date) }
            let ate = thisWeek.filter { $0.result == MealResult.ate.rawValue }.count
            let refused = thisWeek.filter { $0.result == MealResult.refused.rawValue }.count
            return ate >= 5 && refused == 0
        }
    }
}
