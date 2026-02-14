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
        case isPrimaryDish = "is_primary_dish"
        case foodAttemptId = "food_attempt_id"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    mutating func apply(_ updates: PlanEntryUpdate) {
        if let result = updates.result { self.result = result }
        if let notes = updates.notes { self.notes = notes }
        if let foodId = updates.foodId { self.foodId = foodId }
        if let mealSlot = updates.mealSlot { self.mealSlot = mealSlot }
    }
}

struct PlanEntryUpdate: Codable {
    var foodId: String?
    var mealSlot: String?
    var result: String?
    var notes: String?

    enum CodingKeys: String, CodingKey {
        case foodId = "food_id"
        case mealSlot = "meal_slot"
        case result, notes
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
        case .snack1: return "Snack 1"
        case .snack2: return "Snack 2"
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

enum MealResult: String, CaseIterable {
    case ate
    case tasted
    case refused

    var displayName: String {
        rawValue.capitalized
    }

    var icon: String {
        switch self {
        case .ate: return "checkmark.circle.fill"
        case .tasted: return "hand.thumbsup.fill"
        case .refused: return "xmark.circle.fill"
        }
    }

    var color: String {
        switch self {
        case .ate: return "green"
        case .tasted: return "orange"
        case .refused: return "red"
        }
    }
}
