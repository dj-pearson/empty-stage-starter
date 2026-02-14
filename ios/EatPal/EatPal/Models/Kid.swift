import Foundation

struct Kid: Identifiable, Codable, Equatable {
    let id: String
    var userId: String
    var householdId: String?
    var name: String
    var age: Int?
    var dateOfBirth: String?
    var gender: String?
    var profilePictureUrl: String?
    var allergens: [String]?
    var allergenSeverity: [String: String]?
    var crossContaminationSensitive: Bool?
    var dietaryRestrictions: [String]?
    var favoriteFoods: [String]?
    var dislikedFoods: [String]?
    var alwaysEatsFoods: [String]?
    var notes: String?
    var behavioralNotes: String?
    var pickinessLevel: String?
    var newFoodWillingness: String?
    var eatingBehavior: String?
    var texturePreferences: [String]?
    var textureDislikes: [String]?
    var textureSensitivityLevel: String?
    var flavorPreferences: [String]?
    var healthGoals: [String]?
    var nutritionConcerns: [String]?
    var helpfulStrategies: [String]?
    var preferredPreparations: [String]?
    var dietaryVarietyScore: Double?
    var profileCompleted: Bool?
    var heightCm: Double?
    var weightKg: Double?
    var createdAt: String?
    var updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case householdId = "household_id"
        case name, age, gender, allergens, notes
        case dateOfBirth = "date_of_birth"
        case profilePictureUrl = "profile_picture_url"
        case allergenSeverity = "allergen_severity"
        case crossContaminationSensitive = "cross_contamination_sensitive"
        case dietaryRestrictions = "dietary_restrictions"
        case favoriteFoods = "favorite_foods"
        case dislikedFoods = "disliked_foods"
        case alwaysEatsFoods = "always_eats_foods"
        case behavioralNotes = "behavioral_notes"
        case pickinessLevel = "pickiness_level"
        case newFoodWillingness = "new_food_willingness"
        case eatingBehavior = "eating_behavior"
        case texturePreferences = "texture_preferences"
        case textureDislikes = "texture_dislikes"
        case textureSensitivityLevel = "texture_sensitivity_level"
        case flavorPreferences = "flavor_preferences"
        case healthGoals = "health_goals"
        case nutritionConcerns = "nutrition_concerns"
        case helpfulStrategies = "helpful_strategies"
        case preferredPreparations = "preferred_preparations"
        case dietaryVarietyScore = "dietary_variety_score"
        case profileCompleted = "profile_completed"
        case heightCm = "height_cm"
        case weightKg = "weight_kg"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    mutating func apply(_ updates: KidUpdate) {
        if let name = updates.name { self.name = name }
        if let age = updates.age { self.age = age }
        if let gender = updates.gender { self.gender = gender }
        if let allergens = updates.allergens { self.allergens = allergens }
        if let dietaryRestrictions = updates.dietaryRestrictions { self.dietaryRestrictions = dietaryRestrictions }
        if let pickinessLevel = updates.pickinessLevel { self.pickinessLevel = pickinessLevel }
        if let notes = updates.notes { self.notes = notes }
        if let heightCm = updates.heightCm { self.heightCm = heightCm }
        if let weightKg = updates.weightKg { self.weightKg = weightKg }
    }
}

struct KidUpdate: Codable {
    var name: String?
    var age: Int?
    var gender: String?
    var allergens: [String]?
    var dietaryRestrictions: [String]?
    var pickinessLevel: String?
    var notes: String?
    var heightCm: Double?
    var weightKg: Double?
    var profilePictureUrl: String?

    enum CodingKeys: String, CodingKey {
        case name, age, gender, allergens, notes
        case dietaryRestrictions = "dietary_restrictions"
        case pickinessLevel = "pickiness_level"
        case heightCm = "height_cm"
        case weightKg = "weight_kg"
        case profilePictureUrl = "profile_picture_url"
    }
}
