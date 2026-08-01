import SwiftUI

/// US-608: one-tap exposure logging, inline on a plan entry.
///
/// The existing detailed sheet asks for stage, outcome, bites, amount, mood
/// before, mood after, prep and notes. That is the right tool for a calm
/// Sunday review and the wrong one for 6pm on a Tuesday, which is when the
/// exposure actually happens. Because the plan entry already knows the rung,
/// the whole log collapses to three buttons.
///
/// Deliberately no "try again" affordance: the ladder decides when a food
/// comes back, and the answer after a refusal is never "right now".
struct LadderQuickLogControls: View {
    @EnvironmentObject var appState: AppState

    let row: KidFoodLadder
    let planEntryId: String?
    let mealSlot: String?

    @State private var isLogging = false

    private var foodName: String {
        appState.foods.first { $0.id == row.foodId }?.name ?? "this food"
    }

    var body: some View {
        HStack(spacing: 6) {
            ForEach(QuickLogResult.allCases, id: \.self) { result in
                Button {
                    Task { await log(result) }
                } label: {
                    Text(label(for: result))
                        .font(.caption)
                }
                .buttonStyle(.bordered)
                .tint(tint(for: result))
                .disabled(isLogging)
                .accessibilityLabel(accessibilityLabel(for: result))
                .accessibilityHint(
                    "Logs \(foodName) at the \(row.rung.displayName) step"
                )
            }
        }
    }

    private func log(_ result: QuickLogResult) async {
        isLogging = true
        defer { isLogging = false }
        await appState.quickLogExposure(
            row: row,
            result: result,
            planEntryId: planEntryId,
            mealSlot: mealSlot
        )
    }

    private func label(for result: QuickLogResult) -> String {
        switch result {
        case .accepted: return "Went well"
        case .held: return "Partway"
        case .refused: return "Not today"
        }
    }

    private func accessibilityLabel(for result: QuickLogResult) -> String {
        switch result {
        case .accepted: return "Went well with \(foodName)"
        case .held: return "Partway with \(foodName)"
        case .refused: return "Not today for \(foodName)"
        }
    }

    /// "Not today" is deliberately neutral rather than red. A child declining
    /// a food is information, not an error state, and colouring it like a
    /// failure is exactly the pressure this feature exists to remove.
    private func tint(for result: QuickLogResult) -> Color {
        switch result {
        case .accepted: return .green
        case .held, .refused: return .gray
        }
    }
}
