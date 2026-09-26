import XCTest
@testable import EatPal

/// Kid profile writes, recipe allergen warnings and the logged-meal streak.
/// Each case here is a bug that shipped: a cleared field that never saved,
/// a recipe that didn't warn, a "not today" that broke a streak.
final class KidProfileSafetyTests: XCTestCase {

    // MARK: - KidUpdate clears

    private func json(_ update: KidUpdate) throws -> [String: Any] {
        let data = try JSONEncoder().encode(update)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    func testNilFieldIsOmittedSoPartialUpdatesLeaveColumnsAlone() throws {
        let body = try json(KidUpdate(pickinessLevel: "somewhat_picky"))
        XCTAssertEqual(body.keys.sorted(), ["pickiness_level"])
    }

    func testClearedFieldIsSentAsExplicitNull() throws {
        var update = KidUpdate(name: "Sam")
        update.clear(.notes, when: true)
        update.clear(.allergens, when: true)
        update.clear(.age, when: true)
        let body = try json(update)
        XCTAssertTrue(body["notes"] is NSNull)
        XCTAssertTrue(body["allergens"] is NSNull)
        XCTAssertTrue(body["age"] is NSNull)
        XCTAssertEqual(body["name"] as? String, "Sam")
    }

    func testPresentValueWinsOverClear() throws {
        var update = KidUpdate(notes: "likes crunchy")
        update.clear(.notes, when: true)
        let body = try json(update)
        XCTAssertEqual(body["notes"] as? String, "likes crunchy")
    }

    func testClearSurvivesTheOfflineQueueRoundTrip() throws {
        var update = KidUpdate(allergenSeverity: ["peanut": "severe"], crossContaminationSensitive: true)
        update.clear(.dislikedFoods, when: true)
        let data = try JSONEncoder().encode(update)
        let decoded = try JSONDecoder().decode(KidUpdate.self, from: data)
        XCTAssertTrue(decoded.clearedFields.contains(.dislikedFoods))
        XCTAssertEqual(decoded.allergenSeverity?["peanut"], "severe")
        XCTAssertEqual(decoded.crossContaminationSensitive, true)
    }

    func testApplyMirrorsClearsOnTheOptimisticCopy() {
        var kid = Kid(id: "k1", userId: "u1", name: "Sam", age: 4, allergens: ["peanut"], notes: "old")
        var update = KidUpdate()
        update.clear(.notes, when: true)
        update.clear(.allergens, when: true)
        update.clear(.age, when: true)
        kid.apply(update)
        XCTAssertNil(kid.notes)
        XCTAssertNil(kid.allergens)
        XCTAssertNil(kid.age)
        XCTAssertEqual(kid.name, "Sam")
    }

    func testMeasurementParsingAcceptsCommaDecimals() {
        XCTAssertEqual(KidProfileEditorView.parseMeasurement("12,5"), 12.5)
        XCTAssertEqual(KidProfileEditorView.parseMeasurement(" 110 "), 110)
        XCTAssertNil(KidProfileEditorView.parseMeasurement(""))
        XCTAssertNil(KidProfileEditorView.parseMeasurement("abc"))
    }

    // MARK: - Recipe allergens

    private func recipe(foodIds: [String] = [], ingredients: [String] = [], extra: String? = nil) -> Recipe {
        var r = Recipe(id: "r1", userId: "u1", name: "Test", foodIds: foodIds)
        r.ingredients = ingredients.enumerated().map { index, name in
            RecipeIngredient(
                id: "i\(index)", recipeId: "r1", foodId: nil, sortOrder: index, name: name,
                quantity: nil, unit: nil, groupLabel: nil, optionalNotes: nil, createdAt: nil
            )
        }
        r.additionalIngredients = extra
        return r
    }

    func testLinkedFoodTagHitsTheRightChild() {
        let sam = Kid(id: "k1", userId: "u1", name: "Sam", allergens: ["Peanuts"])
        let ada = Kid(id: "k2", userId: "u1", name: "Ada", allergens: ["milk"])
        let food = Food(id: "f1", userId: "u1", name: "Satay sauce", category: "protein",
                        isSafe: false, isTryBite: false, allergens: ["peanut"])
        let hits = RecipeAllergenCheck.hits(recipe: recipe(foodIds: ["f1"]), kids: [sam, ada], foods: [food])
        XCTAssertEqual(hits.map(\.kid.name), ["Sam"])
        XCTAssertEqual(hits.first?.allergens, ["peanut"])
    }

    func testUnlinkedIngredientNameAndExtraTextAreChecked() {
        let kid = Kid(id: "k1", userId: "u1", name: "Sam", allergens: ["tree nuts", "egg"])
        let keys = RecipeAllergenCheck.allergens(
            in: recipe(ingredients: ["Almond flour"], extra: "salt, 2 eggs"),
            for: kid,
            foods: []
        )
        XCTAssertEqual(Set(keys), ["tree nut", "egg"])
    }

    func testSeverityShowsInSummary() {
        var kid = Kid(id: "k1", userId: "u1", name: "Sam", allergens: ["peanut"])
        kid.allergenSeverity = ["Peanuts": "severe"]
        let hit = RecipeAllergenCheck.KidHit(kid: kid, allergens: ["peanut"])
        XCTAssertEqual(hit.summary, "Sam: peanut (severe)")
    }

    // MARK: - Streak

    private func entry(_ date: String, _ result: String?) -> PlanEntry {
        PlanEntry(id: UUID().uuidString, userId: "u1", householdId: nil, kidId: "k1", date: date,
                  mealSlot: "lunch", foodId: "f1", recipeId: nil, result: result)
    }

    private var today: Date {
        DateFormatter.isoDate.date(from: "2026-09-20") ?? Date()
    }

    func testNotTodayCountsTowardTheStreak() {
        let entries = [
            entry("2026-09-20", "refused"),
            entry("2026-09-19", "ate"),
            entry("2026-09-18", "refused"),
        ]
        XCTAssertEqual(BadgeService.currentStreak(kidId: "k1", planEntries: entries, today: today), 3)
    }

    func testBestIsNeverBelowCurrent() {
        // A skipped day keeps the current streak going; the best-ever count
        // used to require strictly consecutive days and came out smaller.
        let entries = [
            entry("2026-09-20", "ate"),
            entry("2026-09-18", "tasted"),
            entry("2026-09-17", "refused"),
        ]
        let current = BadgeService.currentStreak(kidId: "k1", planEntries: entries, today: today)
        let best = BadgeService.bestStreak(kidId: "k1", planEntries: entries, today: today)
        XCTAssertEqual(current, 3)
        XCTAssertGreaterThanOrEqual(best, current)
    }

    func testPlannedButUnloggedDaysDoNotCount() {
        let entries = [entry("2026-09-20", nil), entry("2026-09-19", nil)]
        XCTAssertEqual(BadgeService.currentStreak(kidId: "k1", planEntries: entries, today: today), 0)
    }
}
