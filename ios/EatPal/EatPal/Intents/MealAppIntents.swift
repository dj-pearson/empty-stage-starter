import AppIntents
import Foundation

/// US-142: Siri / Shortcuts meal-logging intent. Logs whether today's meal for
/// the active kid was eaten, tasted, or refused. Runs in the background via
/// `DataService.shared`.

// MARK: - Meal slot enum

/// Siri-facing slot names. Maps onto the domain `MealSlot` via `domainSlot`.
/// Keeping the Siri-facing vocabulary compact ("snack" instead of "snack 1" /
/// "snack 2") since spoken phrases work best with fewer options.
enum MealSlotAppEnum: String, AppEnum {
    case breakfast
    case lunch
    case dinner
    case snack

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Meal Slot"
    static var caseDisplayRepresentations: [MealSlotAppEnum: DisplayRepresentation] = [
        .breakfast: "Breakfast",
        .lunch: "Lunch",
        .dinner: "Dinner",
        .snack: "Snack"
    ]

    /// Which domain `MealSlot` raw values this Siri slot should target.
    /// `.snack` covers both snack1 and snack2 so the user doesn't have to pick.
    var domainSlotRawValues: [String] {
        switch self {
        case .breakfast: return [MealSlot.breakfast.rawValue]
        case .lunch: return [MealSlot.lunch.rawValue]
        case .dinner: return [MealSlot.dinner.rawValue]
        case .snack: return [MealSlot.snack1.rawValue, MealSlot.snack2.rawValue]
        }
    }

    /// US-445: natural-language label for spoken dialog (instead of the raw
    /// enum value).
    var displayName: String {
        switch self {
        case .breakfast: return "breakfast"
        case .lunch: return "lunch"
        case .dinner: return "dinner"
        case .snack: return "snack"
        }
    }
}

enum MealResultAppEnum: String, AppEnum {
    case ate
    case tasted
    case refused

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Meal Result"
    static var caseDisplayRepresentations: [MealResultAppEnum: DisplayRepresentation] = [
        .ate: "Ate",
        .tasted: "Tasted",
        .refused: "Refused"
    ]

    /// US-445: past-tense label for spoken dialog (instead of the raw value).
    var spokenLabel: String {
        switch self {
        case .ate: return "eaten"
        case .tasted: return "tasted"
        case .refused: return "refused"
        }
    }
}

/// US-853: the entries a badge evaluation should see after a Siri log.
///
/// The intent fetches the day's entries, writes the new result to the ones it
/// matched, then has to evaluate badges against the result of that write. It
/// already holds the rows, so re-fetching them would be a second round trip
/// for data in hand -- but evaluating against the PRE-update copies would
/// award nothing, because every criterion reads `result`.
///
/// Pure, so the projection can be tested without a Supabase client. This is
/// the part where being wrong is silent: badges simply never advance, and the
/// log itself still succeeds.
enum MealResultProjection {
    static func applying(
        _ result: String,
        to entries: [PlanEntry],
        matching updated: [PlanEntry]
    ) -> [PlanEntry] {
        let updatedIds = Set(updated.map(\.id))
        return entries.map { entry in
            guard updatedIds.contains(entry.id) else { return entry }
            var copy = entry
            copy.result = result
            return copy
        }
    }
}

// MARK: - Log meal result intent

struct LogMealResultIntent: AppIntent {
    static var title: LocalizedStringResource = "Log Meal Result"
    static var description = IntentDescription(
        "Records whether today's meal was eaten, tasted, or refused in EatPal.",
        categoryName: "Meal Plan"
    )
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Meal")
    var slot: MealSlotAppEnum

    @Parameter(title: "Result")
    var result: MealResultAppEnum

    static var parameterSummary: some ParameterSummary {
        Summary("Log that \(\.$slot) was \(\.$result) in EatPal")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        // US-445: guard for an active session so a Shortcut run while signed
        // out gives clear guidance instead of resolving to an empty result.
        guard (try? await SupabaseManager.client.auth.session) != nil else {
            return .result(dialog: "Open EatPal and sign in first to log meals.")
        }

        let todayString = DateFormatter.isoDate.string(from: Date())

        do {
            let entries = try await DataService.shared.fetchPlanEntries()
            let targetSlotValues = Set(slot.domainSlotRawValues)
            let matches = entries.filter {
                $0.date == todayString && targetSlotValues.contains($0.mealSlot)
            }

            guard !matches.isEmpty else {
                SentryService.leaveBreadcrumb(
                    category: "intent",
                    message: "LogMealResultIntent: no entry for \(slot.rawValue)"
                )
                return .result(dialog: IntentDialog(stringLiteral: "You don't have \(slot.displayName) planned today in EatPal."))
            }

            let domainResult = mapResult(result)
            for entry in matches {
                try await DataService.shared.updatePlanEntry(
                    entry.id,
                    updates: PlanEntryUpdate(result: domainResult)
                )
            }

            // US-144: keep Health in step with the in-app path. This intent
            // writes straight through DataService, so without this a meal
            // logged by voice updated the row and put nothing in Health, and
            // the user's nutrition log was complete or not depending on which
            // surface they used. Best effort -- a Health failure must not turn
            // a successful log into a Siri error.
            await syncHealth(matches: matches, isEaten: domainResult == MealResult.ate.rawValue)

            // US-853: advance streaks and badges, the way
            // AppState.updatePlanEntry does. Without this, whether a meal
            // counted towards a child's progress depended on which surface
            // the parent happened to use -- a week logged by voice earned
            // nothing.
            await evaluateBadges(matches: matches, entries: entries, result: domainResult)

            // US-853: and report it, with the surface distinguishable. This
            // event fired from the in-app path only, so "nobody logs by
            // voice" and "voice logs are invisible" looked the same.
            for kidId in Set(matches.map(\.kidId)) {
                AnalyticsService.track(
                    .mealResultLogged(result: domainResult, kidId: kidId, via: .voice)
                )
            }

            // US-412: refresh the tonight/meals snapshot the widget reads.
            await WidgetSnapshot.rebuildFromServer()

            SentryService.leaveBreadcrumb(
                category: "intent",
                message: "LogMealResultIntent: \(matches.count) entry(ies) marked \(domainResult)"
            )

            let dialogMessage = "Logged \(slot.displayName) as \(result.spokenLabel) for \(matches.count) meal\(matches.count == 1 ? "" : "s") today."
            return .result(dialog: IntentDialog(stringLiteral: dialogMessage))
        } catch {
            SentryService.capture(error, extras: ["intent": "LogMealResult"])
            throw error
        }
    }

    /// US-853: re-evaluate badges for every child whose meal was just logged.
    ///
    /// `BadgeService.evaluate` already took its inputs as arguments rather
    /// than reaching into AppState (AC2), which is what makes this callable
    /// from an intent at all. What it needed was somewhere to source them:
    /// the entries are the ones already fetched above with the new result
    /// applied locally, so this costs one recipes fetch rather than a second
    /// round trip for data we are holding.
    ///
    /// Re-running for a meal already logged awards nothing: `evaluate` skips
    /// any badge in the earned set, so logging the same dinner twice is the
    /// same as logging it once.
    @MainActor
    private func evaluateBadges(
        matches: [PlanEntry],
        entries: [PlanEntry],
        result: String
    ) async {
        let updated = MealResultProjection.applying(result, to: entries, matching: matches)

        // Criteria span foods and recipes as well as entries, so a badge like
        // "tried five vegetables" needs the catalog to know what a food is.
        async let fetchedFoods = try? DataService.shared.fetchFoods()
        async let fetchedRecipes = try? DataService.shared.fetchRecipes()
        let (maybeFoods, maybeRecipes) = await (fetchedFoods, fetchedRecipes)
        let foods = maybeFoods ?? []
        let recipes = maybeRecipes ?? []

        for kidId in Set(matches.map(\.kidId)) {
            BadgeService.shared.evaluate(
                kidId: kidId,
                foods: foods,
                recipes: recipes,
                planEntries: updated
            )
        }
    }

    /// Mirrors the meal's result into Health for every entry just updated.
    /// Recipes are fetched here because the intent runs without AppState, and
    /// only when there is something that could carry nutrition.
    @MainActor
    private func syncHealth(matches: [PlanEntry], isEaten: Bool) async {
        let service = HealthKitService.shared
        guard service.isEnabled, service.isAvailable else { return }

        let recipes: [Recipe]
        if isEaten, matches.contains(where: { $0.recipeId != nil }) {
            recipes = (try? await DataService.shared.fetchRecipes()) ?? []
        } else {
            // Removal does not need them, and neither does an entry with no
            // linked recipe.
            recipes = []
        }

        for entry in matches {
            do {
                try await service.applyMealResult(
                    entry: entry,
                    recipes: recipes,
                    isEaten: isEaten
                )
            } catch {
                SentryService.capture(error, extras: [
                    "intent": "LogMealResult",
                    "context": "healthkit_applyMealResult"
                ])
            }
        }
    }

    private func mapResult(_ result: MealResultAppEnum) -> String {
        switch result {
        case .ate: return MealResult.ate.rawValue
        case .tasted: return MealResult.tasted.rawValue
        case .refused: return MealResult.refused.rawValue
        }
    }
}
