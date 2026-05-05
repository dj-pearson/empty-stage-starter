import Foundation

/// US-276: Predicts "is this user due to restock X?" from each
/// product's add history.
///
/// The cadence model is intentionally simple:
///   1. Take the diffs between consecutive add timestamps.
///   2. Use the **median** as the cadence estimate (robust to the
///      occasional bulk buy or one-off splurge).
///   3. `daysUntilDue = lastAdded + cadence - now`. Negative or zero
///      means "due now".
///
/// Confidence = `min(history.count / 8, 1.0)`. Two adds is enough for
/// a single diff but the prediction is shaky; eight gives the median
/// real signal. Suggestions with confidence < 0.5 are filtered out so
/// we don't spam the user with low-quality guesses on day one.
enum RestockPredictor {

    /// One predicted restock candidate, ranked by `daysUntilDue` ascending.
    struct Suggestion: Identifiable, Equatable, Hashable {
        let id: String
        let preferenceId: String
        let name: String
        let aisleSection: GroceryAisle?
        let category: FoodCategory?
        let lastAdded: Date
        let cadenceDays: Int
        /// Negative = overdue, 0 = due today, positive = future due date.
        let daysUntilDue: Int
        let confidence: Double
    }

    /// Returns `[Suggestion]` sorted by `daysUntilDue` ascending so the
    /// most overdue items come first. Suggestions for products already
    /// on the active grocery list are filtered out by the caller —
    /// don't double-suggest something the user just queued.
    ///
    /// - Parameters:
    ///   - preferences: every product preference for the user/household.
    ///   - now: injection point for tests.
    ///   - confidenceFloor: drop suggestions weaker than this.
    static func suggestions(
        from preferences: [UserProductPreference],
        now: Date = Date(),
        confidenceFloor: Double = 0.5
    ) -> [Suggestion] {
        let formatter = ISO8601DateFormatter()
        var results: [Suggestion] = []
        for pref in preferences {
            let timestamps: [Date] = (pref.addHistory ?? [])
                .compactMap(formatter.date(from:))
                .sorted()
            // Need at least two adds to compute a cadence.
            guard timestamps.count >= 2, let lastAdded = timestamps.last else { continue }

            let cadenceSeconds = medianGap(timestamps: timestamps)
            // Clamp to a sane range so a one-day-apart pair doesn't
            // suggest the user is overdue every other day.
            let cadenceDays = max(1, Int(cadenceSeconds / 86_400))

            let elapsedSeconds = now.timeIntervalSince(lastAdded)
            let elapsedDays = Int((elapsedSeconds / 86_400).rounded(.down))
            let daysUntilDue = cadenceDays - elapsedDays

            let confidence = min(Double(timestamps.count) / 8.0, 1.0)
            guard confidence >= confidenceFloor else { continue }

            results.append(
                Suggestion(
                    id: pref.id,
                    preferenceId: pref.id,
                    name: pref.name,
                    aisleSection: pref.preferredAisleSection.flatMap(GroceryAisle.init(rawValue:)),
                    category: pref.preferredCategory.flatMap(FoodCategory.init(rawValue:)),
                    lastAdded: lastAdded,
                    cadenceDays: cadenceDays,
                    daysUntilDue: daysUntilDue,
                    confidence: confidence
                )
            )
        }
        return results.sorted {
            if $0.daysUntilDue != $1.daysUntilDue {
                return $0.daysUntilDue < $1.daysUntilDue
            }
            // Tie-break by higher confidence so the user sees their
            // strongest patterns first when due dates align.
            return $0.confidence > $1.confidence
        }
    }

    /// Filter out suggestions for products already queued on the
    /// current grocery list. Match is case-insensitive on `name`.
    static func filterNotInList(
        suggestions: [Suggestion],
        groceryItems: [GroceryItem]
    ) -> [Suggestion] {
        let onListNames = Set(
            groceryItems
                .filter { !$0.checked }
                .map { $0.name.lowercased() }
        )
        return suggestions.filter { !onListNames.contains($0.name.lowercased()) }
    }

    // MARK: - Internals

    /// Median seconds between consecutive timestamps. `timestamps` must
    /// be sorted ascending and contain at least two entries (caller
    /// guarantees both invariants).
    private static func medianGap(timestamps: [Date]) -> TimeInterval {
        var gaps: [TimeInterval] = []
        for i in 1..<timestamps.count {
            gaps.append(timestamps[i].timeIntervalSince(timestamps[i - 1]))
        }
        gaps.sort()
        let mid = gaps.count / 2
        if gaps.count % 2 == 0 {
            return (gaps[mid - 1] + gaps[mid]) / 2
        }
        return gaps[mid]
    }
}
