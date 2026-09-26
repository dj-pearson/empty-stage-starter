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
        if let allergenSeverity = updates.allergenSeverity { self.allergenSeverity = allergenSeverity }
        if let cross = updates.crossContaminationSensitive { self.crossContaminationSensitive = cross }
        if let dietaryRestrictions = updates.dietaryRestrictions { self.dietaryRestrictions = dietaryRestrictions }
        if let pickinessLevel = updates.pickinessLevel { self.pickinessLevel = pickinessLevel }
        if let notes = updates.notes { self.notes = notes }
        if let heightCm = updates.heightCm { self.heightCm = heightCm }
        if let weightKg = updates.weightKg { self.weightKg = weightKg }
        if let profilePictureUrl = updates.profilePictureUrl { self.profilePictureUrl = profilePictureUrl }
        if let texturePreferences = updates.texturePreferences { self.texturePreferences = texturePreferences }
        if let textureDislikes = updates.textureDislikes { self.textureDislikes = textureDislikes }
        if let flavorPreferences = updates.flavorPreferences { self.flavorPreferences = flavorPreferences }
        if let favoriteFoods = updates.favoriteFoods { self.favoriteFoods = favoriteFoods }
        if let dislikedFoods = updates.dislikedFoods { self.dislikedFoods = dislikedFoods }
        if let alwaysEatsFoods = updates.alwaysEatsFoods { self.alwaysEatsFoods = alwaysEatsFoods }
        if let behavioralNotes = updates.behavioralNotes { self.behavioralNotes = behavioralNotes }
        if let healthGoals = updates.healthGoals { self.healthGoals = healthGoals }
        if let nutritionConcerns = updates.nutritionConcerns { self.nutritionConcerns = nutritionConcerns }
        if let helpfulStrategies = updates.helpfulStrategies { self.helpfulStrategies = helpfulStrategies }
        // Mirror the explicit nulls the update sends, so the optimistic copy
        // matches the row the server will hold.
        for key in updates.clearedFields {
            switch key {
            case .age: age = nil
            case .gender: gender = nil
            case .allergens: allergens = nil
            case .allergenSeverity: allergenSeverity = nil
            case .dietaryRestrictions: dietaryRestrictions = nil
            case .notes: notes = nil
            case .heightCm: heightCm = nil
            case .weightKg: weightKg = nil
            case .texturePreferences: texturePreferences = nil
            case .textureDislikes: textureDislikes = nil
            case .flavorPreferences: flavorPreferences = nil
            case .favoriteFoods: favoriteFoods = nil
            case .dislikedFoods: dislikedFoods = nil
            case .alwaysEatsFoods: alwaysEatsFoods = nil
            case .behavioralNotes: behavioralNotes = nil
            case .healthGoals: healthGoals = nil
            case .nutritionConcerns: nutritionConcerns = nil
            case .helpfulStrategies: helpfulStrategies = nil
            default: break
            }
        }
    }
}

/// A partial write to `kids`. A nil field is omitted so it leaves the column
/// alone; a field named in `clearedFields` (and left nil) is sent as an
/// explicit null. Without that, emptying the notes or deleting the last
/// allergen in the editor looked saved and changed nothing.
struct KidUpdate: Codable {
    var name: String?
    var age: Int?
    var gender: String?
    var allergens: [String]?
    var allergenSeverity: [String: String]?
    var crossContaminationSensitive: Bool?
    var dietaryRestrictions: [String]?
    var pickinessLevel: String?
    var notes: String?
    var heightCm: Double?
    var weightKg: Double?
    var profilePictureUrl: String?
    var texturePreferences: [String]?
    var textureDislikes: [String]?
    var flavorPreferences: [String]?
    var favoriteFoods: [String]?
    var dislikedFoods: [String]?
    var alwaysEatsFoods: [String]?
    var behavioralNotes: String?
    var healthGoals: [String]?
    var nutritionConcerns: [String]?
    var helpfulStrategies: [String]?
    /// Columns to null out. Not a column itself.
    var clearedFields: Set<CodingKeys> = []

    enum CodingKeys: String, CodingKey {
        case name, age, gender, allergens, notes
        case allergenSeverity = "allergen_severity"
        case crossContaminationSensitive = "cross_contamination_sensitive"
        case dietaryRestrictions = "dietary_restrictions"
        case pickinessLevel = "pickiness_level"
        case heightCm = "height_cm"
        case weightKg = "weight_kg"
        case profilePictureUrl = "profile_picture_url"
        case texturePreferences = "texture_preferences"
        case textureDislikes = "texture_dislikes"
        case flavorPreferences = "flavor_preferences"
        case favoriteFoods = "favorite_foods"
        case dislikedFoods = "disliked_foods"
        case alwaysEatsFoods = "always_eats_foods"
        case behavioralNotes = "behavioral_notes"
        case healthGoals = "health_goals"
        case nutritionConcerns = "nutrition_concerns"
        case helpfulStrategies = "helpful_strategies"
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try put(name, .name, &c)
        try put(age, .age, &c)
        try put(gender, .gender, &c)
        try put(allergens, .allergens, &c)
        try put(allergenSeverity, .allergenSeverity, &c)
        try put(crossContaminationSensitive, .crossContaminationSensitive, &c)
        try put(dietaryRestrictions, .dietaryRestrictions, &c)
        try put(pickinessLevel, .pickinessLevel, &c)
        try put(notes, .notes, &c)
        try put(heightCm, .heightCm, &c)
        try put(weightKg, .weightKg, &c)
        try put(profilePictureUrl, .profilePictureUrl, &c)
        try put(texturePreferences, .texturePreferences, &c)
        try put(textureDislikes, .textureDislikes, &c)
        try put(flavorPreferences, .flavorPreferences, &c)
        try put(favoriteFoods, .favoriteFoods, &c)
        try put(dislikedFoods, .dislikedFoods, &c)
        try put(alwaysEatsFoods, .alwaysEatsFoods, &c)
        try put(behavioralNotes, .behavioralNotes, &c)
        try put(healthGoals, .healthGoals, &c)
        try put(nutritionConcerns, .nutritionConcerns, &c)
        try put(helpfulStrategies, .helpfulStrategies, &c)
    }

    private func put<T: Encodable>(
        _ value: T?,
        _ key: CodingKeys,
        _ c: inout KeyedEncodingContainer<CodingKeys>
    ) throws {
        if let value {
            try c.encode(value, forKey: key)
        } else if clearedFields.contains(key) {
            try c.encodeNil(forKey: key)
        }
    }

    /// Marks `key` cleared when `isEmpty`. Call sites set the value to nil
    /// in the same breath; a value that is present always wins on encode.
    mutating func clear(_ key: CodingKeys, when isEmpty: Bool) {
        if isEmpty { clearedFields.insert(key) }
    }
}

extension KidUpdate {
    /// Decoded by hand so an explicit null (a queued clear replayed from
    /// OfflineStore) comes back as a clear, not as "no change".
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = try c.decodeIfPresent(String.self, forKey: .name)
        age = try c.decodeIfPresent(Int.self, forKey: .age)
        gender = try c.decodeIfPresent(String.self, forKey: .gender)
        allergens = try c.decodeIfPresent([String].self, forKey: .allergens)
        allergenSeverity = try c.decodeIfPresent([String: String].self, forKey: .allergenSeverity)
        crossContaminationSensitive = try c.decodeIfPresent(Bool.self, forKey: .crossContaminationSensitive)
        dietaryRestrictions = try c.decodeIfPresent([String].self, forKey: .dietaryRestrictions)
        pickinessLevel = try c.decodeIfPresent(String.self, forKey: .pickinessLevel)
        notes = try c.decodeIfPresent(String.self, forKey: .notes)
        heightCm = try c.decodeIfPresent(Double.self, forKey: .heightCm)
        weightKg = try c.decodeIfPresent(Double.self, forKey: .weightKg)
        profilePictureUrl = try c.decodeIfPresent(String.self, forKey: .profilePictureUrl)
        texturePreferences = try c.decodeIfPresent([String].self, forKey: .texturePreferences)
        textureDislikes = try c.decodeIfPresent([String].self, forKey: .textureDislikes)
        flavorPreferences = try c.decodeIfPresent([String].self, forKey: .flavorPreferences)
        favoriteFoods = try c.decodeIfPresent([String].self, forKey: .favoriteFoods)
        dislikedFoods = try c.decodeIfPresent([String].self, forKey: .dislikedFoods)
        alwaysEatsFoods = try c.decodeIfPresent([String].self, forKey: .alwaysEatsFoods)
        behavioralNotes = try c.decodeIfPresent(String.self, forKey: .behavioralNotes)
        healthGoals = try c.decodeIfPresent([String].self, forKey: .healthGoals)
        nutritionConcerns = try c.decodeIfPresent([String].self, forKey: .nutritionConcerns)
        helpfulStrategies = try c.decodeIfPresent([String].self, forKey: .helpfulStrategies)
        var cleared: Set<CodingKeys> = []
        for key in c.allKeys {
            if try c.decodeNil(forKey: key) { cleared.insert(key) }
        }
        clearedFields = cleared
    }
}
