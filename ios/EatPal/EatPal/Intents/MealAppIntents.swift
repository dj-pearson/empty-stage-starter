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
                return .result(dialog: IntentDialog(stringLiteral: "You don't have \(slot.rawValue) planned today in EatPal."))
            }

            let domainResult = mapResult(result)
            for entry in matches {
                try await DataService.shared.updatePlanEntry(
                    entry.id,
                    updates: PlanEntryUpdate(result: domainResult)
                )
            }

            SentryService.leaveBreadcrumb(
                category: "intent",
                message: "LogMealResultIntent: \(matches.count) entry(ies) marked \(domainResult)"
            )

            let dialogMessage = "Logged \(slot.rawValue) as \(result.rawValue) for \(matches.count) meal\(matches.count == 1 ? "" : "s") today."
            return .result(dialog: IntentDialog(stringLiteral: dialogMessage))
        } catch {
            SentryService.capture(error, extras: ["intent": "LogMealResult"])
            throw error
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
