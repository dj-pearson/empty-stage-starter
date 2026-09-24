import XCTest
@testable import EatPal

/// The food journal is where a caregiver reads back what they logged. Notes
/// come from two tables, and before it existed nothing on either platform
/// showed the one this app writes (`plan_entry_feedback`). Mirrors
/// src/lib/foodJournal.test.ts.
final class FoodJournalTests: XCTestCase {
    private func entry(
        id: String = "e1",
        kidId: String = "k1",
        date: String = "2026-09-20",
        mealSlot: String = "lunch",
        result: String? = "ate",
        amountEaten: String? = nil,
        notes: String? = nil
    ) -> PlanEntry {
        PlanEntry(
            id: id,
            userId: "parent",
            householdId: "h1",
            kidId: kidId,
            date: date,
            mealSlot: mealSlot,
            foodId: "f1",
            recipeId: nil,
            result: result,
            amountEaten: amountEaten,
            notes: notes
        )
    }

    private func feedback(note: String?, entryId: String = "e1") -> PlanEntryFeedback {
        PlanEntryFeedback(
            id: "fb-\(note ?? "none")",
            planEntryId: entryId,
            userId: "nanny",
            rating: 3,
            note: note,
            createdAt: "2026-09-20T12:30:00Z"
        )
    }

    private func build(
        _ entries: [PlanEntry],
        feedback: [PlanEntryFeedback] = [],
        kidId: String? = nil,
        from: String? = nil,
        onlyWithNotes: Bool = false
    ) -> [FoodJournalDay] {
        FoodJournal.build(
            entries: entries,
            foods: [],
            recipes: [],
            feedback: feedback,
            kidId: kidId,
            from: from,
            to: nil,
            onlyWithNotes: onlyWithNotes
        )
    }

    func testShowsNotesFromBothPlacesOnTheSameMeal() {
        let days = build([entry(notes: "Asked for more")], feedback: [feedback(note: "Only the corners")])
        XCTAssertEqual(days.first?.items.first?.notes.map(\.text), ["Asked for more", "Only the corners"])
    }

    func testTheSameWordsSavedTwiceReadOnce() {
        let days = build([entry(notes: "Only the corners")], feedback: [feedback(note: "Only the corners")])
        XCTAssertEqual(days.first?.items.first?.notes.count, 1)
    }

    func testLeavesOutPlannedMealsNobodyLogged() {
        XCTAssertTrue(build([entry(result: nil)]).isEmpty)
    }

    func testReadsTheStoredAmount() {
        let days = build([entry(amountEaten: "some")])
        XCTAssertEqual(days.first?.items.first?.amountEaten, .moderate)
    }

    func testNewestDayFirstAndMealsInEatingOrder() {
        let days = build([
            entry(id: "a", date: "2026-09-19", mealSlot: "dinner"),
            entry(id: "b", date: "2026-09-20", mealSlot: "dinner"),
            entry(id: "c", date: "2026-09-20", mealSlot: "breakfast"),
        ])
        XCTAssertEqual(days.map(\.date), ["2026-09-20", "2026-09-19"])
        XCTAssertEqual(days.first?.items.map(\.entryId), ["c", "b"])
    }

    func testFiltersByChildDateAndNotes() {
        let entries = [
            entry(id: "a", kidId: "k1", notes: "Gagged on texture"),
            entry(id: "b", kidId: "k2"),
            entry(id: "c", kidId: "k1", date: "2026-09-01"),
        ]
        XCTAssertEqual(build(entries, kidId: "k1", from: "2026-09-10").flatMap(\.items).map(\.entryId), ["a"])
        XCTAssertEqual(build(entries, onlyWithNotes: true).flatMap(\.items).map(\.entryId), ["a"])
    }

    func testAmountRawValuesMatchTheDatabaseCheck() {
        XCTAssertEqual(AmountEaten.allCases.map(\.rawValue), ["a_lot", "some", "nibbles"])
    }
}
