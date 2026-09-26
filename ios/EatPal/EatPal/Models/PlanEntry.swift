import Foundation

struct PlanEntry: Identifiable, Codable, Equatable {
    let id: String
    var userId: String
    var householdId: String?
    var kidId: String
    var date: String
    var mealSlot: String
    var foodId: String
    var recipeId: String?
    var result: String?
    /// How much of it the child ate: `AmountEaten.rawValue`. Nil when nobody
    /// recorded it, which is every row written before the column existed.
    var amountEaten: String?
    var notes: String?
    var isPrimaryDish: Bool?
    var foodAttemptId: String?
    var createdAt: String?
    var updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case householdId = "household_id"
        case kidId = "kid_id"
        case date
        case mealSlot = "meal_slot"
        case foodId = "food_id"
        case recipeId = "recipe_id"
        case result, notes
        case amountEaten = "amount_eaten"
        case isPrimaryDish = "is_primary_dish"
        case foodAttemptId = "food_attempt_id"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    mutating func apply(_ updates: PlanEntryUpdate) {
        if let result = updates.result { self.result = result }
        if let notes = updates.notes { self.notes = notes }
        if let amountEaten = updates.amountEaten { self.amountEaten = amountEaten }
        if let foodId = updates.foodId { self.foodId = foodId }
        if let mealSlot = updates.mealSlot { self.mealSlot = mealSlot }
    }
}

struct PlanEntryUpdate: Codable {
    var foodId: String?
    var mealSlot: String?
    var result: String?
    var notes: String?
    /// Nil leaves the stored amount alone: the synthesized encoder omits nil
    /// keys, so an update carrying only a result never clears it.
    var amountEaten: String?

    enum CodingKeys: String, CodingKey {
        case foodId = "food_id"
        case mealSlot = "meal_slot"
        case result, notes
        case amountEaten = "amount_eaten"
    }
}

/// How much of a food the child ate. Stored in `plan_entries.amount_eaten`;
/// the web copy is `AMOUNT_EATEN_VALUES` in src/lib/foodJournal.ts, and the
/// database CHECK allows exactly these three.
enum AmountEaten: String, CaseIterable, Identifiable {
    case aLot = "a_lot"
    // Not `case some`: an `AmountEaten?` would then read `.some` as
    // Optional.some, which compiles with a warning and means something else.
    case moderate = "some"
    case nibbles

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .aLot: return "A lot"
        case .moderate: return "Some"
        case .nibbles: return "Nibbles"
        }
    }
}

enum MealSlot: String, CaseIterable {
    case breakfast
    case lunch
    case dinner
    case snack1
    case snack2
    case tryBite = "try_bite"

    var displayName: String {
        switch self {
        case .breakfast: return "Breakfast"
        case .lunch: return "Lunch"
        case .dinner: return "Dinner"
        case .snack1: return "Morning snack"
        case .snack2: return "Afternoon snack"
        case .tryBite: return "Try Bite"
        }
    }

    var icon: String {
        switch self {
        case .breakfast: return "sunrise.fill"
        case .lunch: return "sun.max.fill"
        case .dinner: return "moon.fill"
        case .snack1: return "cup.and.saucer.fill"
        case .snack2: return "cup.and.saucer.fill"
        case .tryBite: return "star.fill"
        }
    }
}

/// What happened at a meal. The raw values are the database's and never
/// change; the labels are for parents. A declined food is shown as "Not
/// today" in a neutral colour, not a red "Refused" cross: feeding therapy
/// (ARFID, sensory aversion) counts an exposure as progress whether or not
/// it was eaten, and the ladder's own quick-log already says "Not today".
enum MealResult: String, CaseIterable {
    case ate
    case tasted
    case refused

    var displayName: String {
        switch self {
        case .ate: return "Ate"
        case .tasted: return "Tasted"
        case .refused: return "Not today"
        }
    }

    var icon: String {
        switch self {
        case .ate: return "checkmark.circle.fill"
        case .tasted: return "hand.thumbsup.fill"
        case .refused: return "moon.zzz.fill"
        }
    }

    var color: String {
        switch self {
        case .ate: return "green"
        case .tasted: return "orange"
        case .refused: return "gray"
        }
    }
}
