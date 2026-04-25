import Foundation

/// US-225: A single autocomplete suggestion for the grocery-add flow.
/// Carries the last-used metadata so tapping it pre-fills the whole form.
struct GrocerySuggestion: Identifiable, Hashable {
    let id: String
    let name: String
    let category: String
    let unit: String
    let priority: String
    let frequency: Int
}

/// Ranks prior grocery entries and pantry foods by how often the user has
/// added them, filtering by the current query prefix. Suggestions carry the
/// most-recent metadata (category/unit/priority) so taps pre-fill the form.
enum GrocerySuggestionEngine {

    /// - Parameters:
    ///   - query: The user's current text in the name field.
    ///   - history: All previously-added grocery items (current + historical).
    ///   - pantry: The user's foods list — a secondary source of names.
    ///   - limit: Max results. 0 when query is empty.
    static func suggestions(
        for query: String,
        history: [GroceryItem],
        pantry: [Food],
        limit: Int
    ) -> [GrocerySuggestion] {
        let trimmed = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !trimmed.isEmpty, limit > 0 else { return [] }

        var index: [String: GrocerySuggestion] = [:]

        // History gives us frequency + metadata.
        for item in history {
            let key = item.name.lowercased()
            guard !key.isEmpty else { continue }
            let existing = index[key]
            let freq = (existing?.frequency ?? 0) + 1
            index[key] = GrocerySuggestion(
                id: key,
                name: item.name,
                category: item.category,
                unit: item.unit,
                priority: item.priority ?? existing?.priority ?? "medium",
                frequency: freq
            )
        }

        // Pantry adds names the user cares about even if they've never added
        // them to grocery yet — seeded at frequency 0 so history still wins.
        for food in pantry {
            let key = food.name.lowercased()
            guard !key.isEmpty, index[key] == nil else { continue }
            index[key] = GrocerySuggestion(
                id: key,
                name: food.name,
                category: food.category,
                unit: food.unit ?? "count",
                priority: "medium",
                frequency: 0
            )
        }

        let matches = index.values.filter { suggestion in
            let normalizedName = suggestion.name.lowercased()
            // Prefix match wins; substring match is kept as a fallback.
            return normalizedName.hasPrefix(trimmed) || normalizedName.contains(trimmed)
        }

        return matches
            .sorted { lhs, rhs in
                // Prefix hits ranked above substring hits, then frequency.
                let lhsPrefix = lhs.name.lowercased().hasPrefix(trimmed)
                let rhsPrefix = rhs.name.lowercased().hasPrefix(trimmed)
                if lhsPrefix != rhsPrefix { return lhsPrefix }
                if lhs.frequency != rhs.frequency { return lhs.frequency > rhs.frequency }
                return lhs.name < rhs.name
            }
            .prefix(limit)
            .map { $0 }
    }
}
