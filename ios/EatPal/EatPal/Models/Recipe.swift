import Foundation

struct NutritionInfo: Codable, Equatable {
    var calories: Double?
    var proteinG: Double?
    var carbsG: Double?
    var fatG: Double?
    var fiberG: Double?
    var calciumMg: Double?
    var ironMg: Double?

    enum CodingKeys: String, CodingKey {
        case calories
        case proteinG = "protein_g"
        case carbsG = "carbs_g"
        case fatG = "fat_g"
        case fiberG = "fiber_g"
        case calciumMg = "calcium_mg"
        case ironMg = "iron_mg"
    }
}

struct Recipe: Identifiable, Codable, Equatable {
    let id: String
    var userId: String
    var householdId: String?
    var name: String
    var description: String?
    var instructions: String?
    var foodIds: [String]
    var category: String?
    var prepTime: String?
    var cookTime: String?
    var totalTimeMinutes: Int?
    var servings: String?
    var servingsMin: Int?
    var servingsMax: Int?
    var defaultServings: Int?
    var additionalIngredients: String?
    var tips: String?
    var imageUrl: String?
    var sourceUrl: String?
    var sourceType: String?
    var tags: [String]?
    var rating: Double?
    var timesMade: Int?
    var lastMadeDate: String?
    var difficultyLevel: String?
    var kidFriendlyScore: Double?
    var nutritionInfo: NutritionInfo?
    var createdAt: String?
    var updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case householdId = "household_id"
        case name, description, instructions, category, tags, rating, tips
        case foodIds = "food_ids"
        case prepTime = "prep_time"
        case cookTime = "cook_time"
        case totalTimeMinutes = "total_time_minutes"
        case servings
        case servingsMin = "servings_min"
        case servingsMax = "servings_max"
        case defaultServings = "default_servings"
        case additionalIngredients = "additional_ingredients"
        case imageUrl = "image_url"
        case sourceUrl = "source_url"
        case sourceType = "source_type"
        case timesMade = "times_made"
        case lastMadeDate = "last_made_date"
        case difficultyLevel = "difficulty_level"
        case kidFriendlyScore = "kid_friendly_score"
        case nutritionInfo = "nutrition_info"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    mutating func apply(_ updates: RecipeUpdate) {
        if let name = updates.name { self.name = name }
        if let description = updates.description { self.description = description }
        if let instructions = updates.instructions { self.instructions = instructions }
        if let foodIds = updates.foodIds { self.foodIds = foodIds }
        if let category = updates.category { self.category = category }
        if let prepTime = updates.prepTime { self.prepTime = prepTime }
        if let cookTime = updates.cookTime { self.cookTime = cookTime }
        if let servings = updates.servings { self.servings = servings }
        if let tags = updates.tags { self.tags = tags }
        if let rating = updates.rating { self.rating = rating }
        if let difficultyLevel = updates.difficultyLevel { self.difficultyLevel = difficultyLevel }
    }
}

struct RecipeUpdate: Codable {
    var name: String?
    var description: String?
    var instructions: String?
    var foodIds: [String]?
    var category: String?
    var prepTime: String?
    var cookTime: String?
    var servings: String?
    var tags: [String]?
    var rating: Double?
    var difficultyLevel: String?

    enum CodingKeys: String, CodingKey {
        case name, description, instructions, category, tags, rating, servings
        case foodIds = "food_ids"
        case prepTime = "prep_time"
        case cookTime = "cook_time"
        case difficultyLevel = "difficulty_level"
    }
}
