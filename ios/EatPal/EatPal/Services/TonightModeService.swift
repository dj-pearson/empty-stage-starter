import Foundation

/// US-293: Tonight Mode service.
///
/// Calls the `tonight-mode` edge function for the top 3 cookable dinners
/// given the household's pantry, kid aversions/allergens, recent plan
/// history, and a max prep-time budget. Falls back to a pure-Swift
/// computation against the in-memory `AppState` so the UI never strands the
/// user staring at a spinner at 6pm.
///
/// All public surface is `@MainActor` because the service reads from
/// `AppState` (which is `@MainActor`-isolated). The only piece that crosses
/// the actor boundary is the network fetch — wrapped in `withTimeout` so a
/// slow Kong/Coolify deploy can't leave the UI hanging.
enum TonightModeService {

    enum ServiceError: Error, LocalizedError {
        case network(String)
        case decoding(String)
        case empty
        case timeout

        var errorDescription: String? {
            switch self {
            case .network(let s):  return "Couldn't reach Tonight Mode: \(s)"
            case .decoding(let s): return "Tonight Mode response was unreadable: \(s)"
            case .empty:           return "No dinner suggestions yet. Add a few recipes and try again."
            case .timeout:         return "Tonight Mode took too long; using local picks."
            }
        }
    }

    // MARK: - Public response types

    struct KidFit: Codable, Equatable, Hashable, Identifiable, Sendable {
        let kidId: String
        let kidName: String
        let score: Double
        let blockingAversions: [String]
        let allergenHits: [String]

        var id: String { kidId }

        var status: Status {
            if !allergenHits.isEmpty { return .allergen }
            if !blockingAversions.isEmpty { return .warn }
            return .ok
        }

        enum Status: Sendable { case ok, warn, allergen }
    }

    struct MissingIngredient: Codable, Equatable, Hashable, Identifiable, Sendable {
        let id: String
        let name: String
    }

    struct Suggestion: Codable, Equatable, Hashable, Identifiable, Sendable {
        let recipeId: String
        let name: String
        let imageUrl: String?
        let prepMinutes: Int
        let pantryCoveragePct: Double
        let missingFoodIds: [String]
        let missingIngredients: [MissingIngredient]
        let kidFit: [KidFit]
        let varietyScore: Double
        let rankScore: Double

        var id: String { recipeId }
    }

    private struct EdgeResponse: Decodable, Sendable {
        let suggestions: [Suggestion]
    }

    private struct RequestBody: Encodable, Sendable {
        let householdId: String?
        let kidIds: [String]
        let maxMinutes: Int
        let pantryOnly: Bool
        let lookbackDays: Int
        let limit: Int
    }

    // MARK: - Public API

    /// Hits the edge function with a 1.5s soft timeout. On any failure or
    /// empty response, falls back to a deterministic in-memory rank against
    /// `AppState`, so the UI always has *something* to show.
    @MainActor
    static func fetchSuggestions(
        appState: AppState,
        kidIds: [String]? = nil,
        maxMinutes: Int = 30,
        pantryOnly: Bool = true,
        lookbackDays: Int = 21,
        limit: Int = 3
    ) async -> [Suggestion] {
        let resolvedKidIds = (kidIds?.isEmpty ?? true) ? appState.kids.map(\.id) : (kidIds ?? [])

        let body = RequestBody(
            householdId: appState.kids.first?.householdId,
            kidIds: resolvedKidIds,
            maxMinutes: maxMinutes,
            pantryOnly: pantryOnly,
            lookbackDays: lookbackDays,
            limit: limit
        )

        do {
            let response = try await withTimeout(seconds: 1.5) {
                try await EdgeFunctions.invoke(
                    "tonight-mode",
                    body: body,
                    as: EdgeResponse.self
                )
            }
            if !response.suggestions.isEmpty {
                return response.suggestions
            }
        } catch {
            // Logged but swallowed — we want the fallback to still run.
            print("[TonightMode] edge fetch failed, falling back: \(error)")
        }

        return clientFallback(
            appState: appState,
            kidIds: resolvedKidIds,
            maxMinutes: maxMinutes,
            limit: limit
        )
    }

    // MARK: - Client-side fallback

    @MainActor
    static func clientFallback(
        appState: AppState,
        kidIds: [String],
        maxMinutes: Int,
        limit: Int
    ) -> [Suggestion] {
        let pantry = appState.foods
        let foodById = Dictionary(uniqueKeysWithValues: pantry.map { ($0.id, $0) })
        let pantryIds = Set(pantry.map(\.id))
        let selectedKids = appState.kids.filter { kidIds.contains($0.id) }
        let recipes = appState.recipes
        let planEntries = appState.planEntries

        let now = Date()
        let cal = Calendar(identifier: .gregorian)
        let isoFmt: ISO8601DateFormatter = {
            let f = ISO8601DateFormatter()
            f.formatOptions = [.withFullDate]
            return f
        }()

        // Recency weights: <=7d ×2, 8-14d ×1, 15-21d ×0.5
        func recencyWeight(_ daysAgo: Int) -> Double {
            if daysAgo < 0 { return 0 }
            if daysAgo <= 7 { return 2 }
            if daysAgo <= 14 { return 1 }
            return 0.5
        }
        func varietyScore(for recipeId: String) -> Double {
            var weighted = 0.0
            for entry in planEntries where entry.recipeId == recipeId {
                guard let date = isoFmt.date(from: entry.date) else { continue }
                let days = cal.dateComponents([.day], from: date, to: now).day ?? Int.max
                if days < 0 || days > 21 { continue }
                weighted += recencyWeight(days)
            }
            return min(1.0, max(0.0, (weighted / 21.0) * 3.0))
        }

        struct Scored {
            let recipe: Recipe
            let pantryCoveragePct: Double
            let missingFoodIds: [String]
            let kidFits: [KidFit]
            let variety: Double
            let prepMinutes: Int
            let rank: Double
            let excluded: Bool
        }

        let scored: [Scored] = recipes.map { recipe in
            let foodIds = recipe.foodIds
            let total = max(1, foodIds.count)
            let missing = foodIds.filter { !pantryIds.contains($0) }
            let coverage = Double(foodIds.count - missing.count) / Double(total)

            let kidFits: [KidFit] = selectedKids.map { kid in
                let kidAllergens = Set((kid.allergens ?? []).map { $0.lowercased() })
                let dislikedIds = Set(kid.dislikedFoods ?? [])
                let dislikedNames = Set((kid.dislikedFoods ?? []).map { $0.lowercased() })

                var allergenHits: [String] = []
                var blockingAversions: [String] = []
                for fid in foodIds {
                    guard let food = foodById[fid] else { continue }
                    let foodAllergens = Set((food.allergens ?? []).map { $0.lowercased() })
                    if !foodAllergens.isDisjoint(with: kidAllergens) {
                        allergenHits.append(food.name)
                        continue
                    }
                    if dislikedIds.contains(fid) || dislikedNames.contains(food.name.lowercased()) {
                        blockingAversions.append(food.name)
                    }
                }

                var score = 1.0 - 0.25 * Double(blockingAversions.count)
                if !allergenHits.isEmpty { score = 0 }
                score = min(max(score, 0), 1)
                return KidFit(
                    kidId: kid.id,
                    kidName: kid.name,
                    score: score,
                    blockingAversions: blockingAversions,
                    allergenHits: allergenHits
                )
            }

            let anyAllergen = kidFits.contains { !$0.allergenHits.isEmpty }
            let totalAversions = kidFits.reduce(0) { $0 + $1.blockingAversions.count }
            let variety = varietyScore(for: recipe.id)
            let prep = recipe.totalTimeMinutes ?? Int(parseLeadingNumber(recipe.prepTime) ?? 30)
            let prepOver = max(0, prep - maxMinutes)

            var rank = coverage * 40
                - Double(totalAversions) * 15
                - variety * 25
                - Double(prepOver) * 0.5
            if anyAllergen { rank = -.infinity }

            return Scored(
                recipe: recipe,
                pantryCoveragePct: coverage,
                missingFoodIds: missing,
                kidFits: kidFits,
                variety: variety,
                prepMinutes: prep,
                rank: rank,
                excluded: anyAllergen
            )
        }

        let ranked = scored
            .filter { !$0.excluded }
            .sorted { lhs, rhs in
                if lhs.rank != rhs.rank { return lhs.rank > rhs.rank }
                let lhsSum = lhs.kidFits.reduce(0) { $0 + $1.score }
                let rhsSum = rhs.kidFits.reduce(0) { $0 + $1.score }
                return lhsSum > rhsSum
            }
            .prefix(limit)

        return ranked.map { s in
            Suggestion(
                recipeId: s.recipe.id,
                name: s.recipe.name,
                imageUrl: s.recipe.imageUrl,
                prepMinutes: s.prepMinutes,
                pantryCoveragePct: s.pantryCoveragePct,
                missingFoodIds: s.missingFoodIds,
                missingIngredients: s.missingFoodIds.map { id in
                    MissingIngredient(id: id, name: foodById[id]?.name ?? "Missing item")
                },
                kidFit: s.kidFits,
                varietyScore: s.variety,
                rankScore: s.rank
            )
        }
    }

    /// Pulls the leading numeric run out of a free-form string like "20 min"
    /// or "PT15M". Used to rescue a usable prep-time when the recipe row
    /// lacks the structured `total_time_minutes` column.
    private static func parseLeadingNumber(_ raw: String?) -> Double? {
        guard let raw else { return nil }
        let head = raw.drop(while: { !$0.isNumber })
            .prefix { $0.isNumber || $0 == "." }
        return head.isEmpty ? nil : Double(String(head))
    }
}

// MARK: - Helpers

/// Wraps an async block in a soft timeout. The work runs to completion in
/// the background but the awaiter unblocks at the deadline so a slow edge
/// fn can't strand the user. Both branches must produce a `Sendable` value
/// because the task group needs to safely deliver across executors.
private func withTimeout<T: Sendable>(
    seconds: TimeInterval,
    operation: @escaping @Sendable () async throws -> T
) async throws -> T {
    try await withThrowingTaskGroup(of: T.self) { group in
        group.addTask { try await operation() }
        group.addTask {
            try await Task.sleep(for: .seconds(seconds))
            throw TonightModeService.ServiceError.timeout
        }
        guard let first = try await group.next() else {
            throw TonightModeService.ServiceError.network("empty task group")
        }
        group.cancelAll()
        return first
    }
}

// MARK: - Time-of-day helper

extension TonightModeService {
    /// True when local time is in the 4pm-8pm "panic window" AND no dinner
    /// is planned for today.
    static func shouldShowPanicCta(now: Date = Date(), planEntries: [PlanEntry]) -> Bool {
        let comps = Calendar.current.dateComponents([.hour], from: now)
        let hour = comps.hour ?? 0
        guard hour >= 16 && hour < 20 else { return false }
        let today = todayIso(now)
        return !planEntries.contains { entry in
            entry.date == today && entry.mealSlot.lowercased() == "dinner"
        }
    }

    static func todayIso(_ now: Date = Date()) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = .current
        return f.string(from: now)
    }
}
