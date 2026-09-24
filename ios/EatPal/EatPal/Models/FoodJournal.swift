import Foundation

/// The food journal: every logged meal for a child, a day at a time, with the
/// notes and amounts written about it.
///
/// Notes live in two places. The web log modal writes `plan_entries.notes`;
/// the "How was it?" sheet here writes a `plan_entry_feedback` row. A
/// caregiver who logs on the phone and a parent who reads on the laptop need
/// both, so they are folded together here.
///
/// The web copy is `buildFoodJournal` in src/lib/foodJournal.ts. Swift cannot
/// import TypeScript, so a change to the grouping belongs in both.
struct FoodJournalNote: Identifiable, Equatable {
    let id: String
    let text: String
    /// True for a `plan_entry_feedback` note, which only its author can edit.
    let isFeedback: Bool
}

struct FoodJournalItem: Identifiable, Equatable {
    var id: String { entryId }
    let entryId: String
    let kidId: String
    let date: String
    let mealSlot: String
    let name: String
    let result: MealResult?
    let amountEaten: AmountEaten?
    /// `plan_entries.notes`, the note the journal's editor changes.
    let entryNote: String?
    let notes: [FoodJournalNote]
}

struct FoodJournalDay: Identifiable, Equatable {
    var id: String { date }
    let date: String
    let items: [FoodJournalItem]

    var ateCount: Int { items.filter { $0.result == .ate }.count }
    var tastedCount: Int { items.filter { $0.result == .tasted }.count }
    var refusedCount: Int { items.filter { $0.result == .refused }.count }
}

enum FoodJournal {
    private static let slotOrder: [String: Int] = [
        "breakfast": 0, "snack1": 1, "lunch": 2, "snack2": 3, "dinner": 4, "try_bite": 5,
    ]

    /// Logged meals grouped by day, newest day first, meals in eating order.
    /// An entry with no result and no note is a plan, not a log, and is left
    /// out. `from` and `to` are inclusive "yyyy-MM-dd" bounds.
    static func build(
        entries: [PlanEntry],
        foods: [Food],
        recipes: [Recipe],
        feedback: [PlanEntryFeedback],
        kidId: String?,
        from: String?,
        to: String?,
        onlyWithNotes: Bool
    ) -> [FoodJournalDay] {
        let foodNames = Dictionary(foods.map { ($0.id, $0.name) }, uniquingKeysWith: { first, _ in first })
        let recipeNames = Dictionary(recipes.map { ($0.id, $0.name) }, uniquingKeysWith: { first, _ in first })
        let feedbackByEntry = Dictionary(grouping: feedback.filter {
            !($0.note ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }, by: { $0.planEntryId })

        var byDay: [String: [FoodJournalItem]] = [:]

        for entry in entries {
            if let kidId, entry.kidId != kidId { continue }
            let date = String(entry.date.prefix(10))
            if let from, date < from { continue }
            if let to, date > to { continue }

            var notes: [FoodJournalNote] = []
            let entryNote = entry.notes?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if !entryNote.isEmpty {
                notes.append(FoodJournalNote(id: "\(entry.id):entry", text: entryNote, isFeedback: false))
            }
            let rows = (feedbackByEntry[entry.id] ?? []).sorted { ($0.createdAt ?? "") < ($1.createdAt ?? "") }
            for row in rows {
                let text = (row.note ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                // The same words saved both ways should read once.
                if notes.contains(where: { $0.text == text }) { continue }
                notes.append(FoodJournalNote(id: row.id, text: text, isFeedback: true))
            }

            let result = entry.result.flatMap(MealResult.init(rawValue:))
            if result == nil && notes.isEmpty { continue }
            if onlyWithNotes && notes.isEmpty { continue }

            var name = foodNames[entry.foodId] ?? "Unknown food"
            if let recipeId = entry.recipeId, entry.isPrimaryDish != false, let recipeName = recipeNames[recipeId] {
                name = recipeName
            }

            byDay[date, default: []].append(FoodJournalItem(
                entryId: entry.id,
                kidId: entry.kidId,
                date: date,
                mealSlot: entry.mealSlot,
                name: name,
                result: result,
                amountEaten: entry.amountEaten.flatMap(AmountEaten.init(rawValue:)),
                entryNote: entry.notes,
                notes: notes
            ))
        }

        return byDay.keys.sorted(by: >).map { date in
            let items = (byDay[date] ?? []).sorted { a, b in
                let sa = slotOrder[a.mealSlot] ?? 99
                let sb = slotOrder[b.mealSlot] ?? 99
                return sa != sb ? sa < sb : a.name < b.name
            }
            return FoodJournalDay(date: date, items: items)
        }
    }

    /// One day as plain text, for pasting into a message to the other
    /// caregiver or a feeding therapist.
    static func plainText(for day: FoodJournalDay, heading: String) -> String {
        var lines = [heading]
        for item in day.items {
            var parts = ["\(MealSlot(rawValue: item.mealSlot)?.displayName ?? item.mealSlot): \(item.name)"]
            if let result = item.result { parts.append(result.displayName) }
            if let amount = item.amountEaten { parts.append(amount.displayName) }
            lines.append("- " + parts.joined(separator: " / "))
            for note in item.notes {
                lines.append("    \"\(note.text)\"")
            }
        }
        return lines.joined(separator: "\n")
    }
}
