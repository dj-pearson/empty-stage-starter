import SwiftUI

/// US-237: Today's planned meals on the wrist.
///
/// Read-only on the watch — tapping a meal will eventually fire the
/// log-result intent, but for v1 we just speak the meal name + show
/// whether a result has been logged. Anything more interactive needs
/// confirmation UX which doesn't fit on a 41mm screen.
struct TodayView: View {
    @EnvironmentObject var sessionStore: WatchSessionStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text("Today")
                    .font(.title3)
                    .fontWeight(.bold)
                    .padding(.horizontal)

                if sessionStore.snapshot.meals.isEmpty {
                    Text("Nothing planned for today.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding()
                } else {
                    ForEach(sessionStore.snapshot.meals) { meal in
                        MealRowView(meal: meal)
                    }
                }
            }
        }
        .navigationTitle("Today")
    }
}

private struct MealRowView: View {
    let meal: WatchSnapshot.Meal

    private var slotLabel: String {
        switch meal.slot {
        case "breakfast": return "Breakfast"
        case "lunch":     return "Lunch"
        case "dinner":    return "Dinner"
        case "snack1":    return "Snack 1"
        case "snack2":    return "Snack 2"
        default:          return meal.slot.capitalized
        }
    }

    var body: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(slotLabel)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text(meal.name)
                    .font(.caption)
                    .lineLimit(2)
            }
            Spacer()
            if meal.resultLogged {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                    .font(.caption)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Color.gray.opacity(0.18), in: RoundedRectangle(cornerRadius: 8))
        .padding(.horizontal, 8)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(slotLabel): \(meal.name)\(meal.resultLogged ? ". Result already logged" : "")")
    }
}
