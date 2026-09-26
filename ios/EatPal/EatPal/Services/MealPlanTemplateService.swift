import Foundation
@preconcurrency import Supabase

/// Handles meal plan copying and template operations.
@MainActor
final class MealPlanTemplateService {
    static let shared = MealPlanTemplateService()
    private let client = SupabaseManager.client
    private let toast = ToastManager.shared

    private init() {}

    // MARK: - Types

    struct MealPlanTemplate: Identifiable, Codable {
        let id: String
        var userId: String
        var name: String
        var meals: [TemplateMeal]
        var createdAt: String?

        enum CodingKeys: String, CodingKey {
            case id
            case userId = "user_id"
            case name, meals
            case createdAt = "created_at"
        }
    }

    struct TemplateMeal: Codable {
        let dayIndex: Int // 0-6 (Mon-Sun)
        let mealSlot: String
        let foodId: String
        let foodName: String
        /// The recipe the meal came from. Optional and omitted when nil, so
        /// templates saved before it existed still decode, and a recipe meal
        /// no longer comes back as its first ingredient.
        var recipeId: String? = nil

        enum CodingKeys: String, CodingKey {
            case dayIndex = "day_index"
            case mealSlot = "meal_slot"
            case foodId = "food_id"
            case foodName = "food_name"
            case recipeId = "recipe_id"
        }
    }

    // MARK: - Copy Week Plan

    /// Copies all plan entries from one week to another for a given kid and
    /// returns how many were copied (0 when the source week is empty). The
    /// caller says what happened: the service used to toast "No meals to
    /// copy" while the view toasted "Week copied" over it, and on a real copy
    /// both toasted success.
    @discardableResult
    func copyWeekPlan(
        from sourceWeekStart: Date,
        to targetWeekStart: Date,
        kidId: String,
        appState: AppState
    ) async throws -> Int {
        let calendar = Calendar.current
        let sourceDates = (0..<7).map { offset in
            calendar.date(byAdding: .day, value: offset, to: sourceWeekStart)!
        }

        let sourceEntries = sourceDates.flatMap { date in
            appState.planEntriesForDate(date, kidId: kidId)
        }

        guard !sourceEntries.isEmpty else { return 0 }

        for entry in sourceEntries {
            guard let entryDate = DateFormatter.isoDate.date(from: entry.date) else { continue }
            let dayOffset = calendar.dateComponents([.day], from: sourceWeekStart, to: entryDate).day ?? 0
            let newDate = calendar.date(byAdding: .day, value: dayOffset, to: targetWeekStart)!

            let newEntry = PlanEntry(
                id: UUID().uuidString,
                userId: entry.userId,
                kidId: kidId,
                date: DateFormatter.isoDate.string(from: newDate),
                mealSlot: entry.mealSlot,
                foodId: entry.foodId,
                // Without this a copied recipe meal became its first ingredient.
                recipeId: entry.recipeId
            )

            try await appState.addPlanEntry(newEntry, silent: true)
        }

        return sourceEntries.count
    }

    // MARK: - Cross-Kid Plan Copy (US-229)

    struct CrossKidCopyResult {
        let copied: Int
        let skippedAllergens: [String] // unique allergen names that triggered skips
        let skippedCount: Int
        /// US-353: recipe ids of the recipe-backed entries actually copied, so
        /// the caller can fire the missing-ingredient prompt.
        let copiedRecipeIds: [String]
    }

    /// Copies plan entries for a given week from `sourceKidId` to `targetKidId`.
    /// Skips meals whose food triggers any of the target kid's allergens.
    func copyWeekToOtherKid(
        weekStart: Date,
        sourceKidId: String,
        targetKidId: String,
        appState: AppState
    ) async throws -> CrossKidCopyResult {
        let calendar = Calendar.current
        let dates = (0..<7).map { offset in
            calendar.date(byAdding: .day, value: offset, to: weekStart)!
        }

        let sourceEntries = dates.flatMap { date in
            appState.planEntriesForDate(date, kidId: sourceKidId)
        }

        guard !sourceEntries.isEmpty else {
            toast.warning("Nothing to copy", message: "The source kid has no meals planned this week.")
            return CrossKidCopyResult(copied: 0, skippedAllergens: [], skippedCount: 0, copiedRecipeIds: [])
        }

        let targetKid = appState.kids.first { $0.id == targetKidId }

        var copied = 0
        var skipped = 0
        var skippedAllergenSet: Set<String> = []
        var copiedRecipeIds: [String] = []

        for entry in sourceEntries {
            // Allergen guard: if any food in the meal (the entry's food and,
            // for a recipe, every linked ingredient) carries an allergen the
            // target kid reacts to, skip it and remember which one. Canonical
            // match, so "Peanuts" hits "peanut" and "almonds" hits tree nuts.
            if let targetKid,
               let hit = Self.allergenHit(entry: entry, kid: targetKid, appState: appState) {
                skipped += 1
                skippedAllergenSet.insert(hit)
                continue
            }

            let copy = PlanEntry(
                id: UUID().uuidString,
                userId: entry.userId,
                kidId: targetKidId,
                date: entry.date,
                mealSlot: entry.mealSlot,
                foodId: entry.foodId,
                recipeId: entry.recipeId
            )
            do {
                try await appState.addPlanEntry(copy, silent: true)
                copied += 1
                if let rid = copy.recipeId, !rid.isEmpty {
                    copiedRecipeIds.append(rid)
                }
            } catch {
                skipped += 1
            }
        }

        return CrossKidCopyResult(
            copied: copied,
            skippedAllergens: Array(skippedAllergenSet).sorted(),
            skippedCount: skipped,
            copiedRecipeIds: copiedRecipeIds
        )
    }

    // MARK: - Delete Week Plan

    /// Deletes all plan entries for a given week and kid.
    func deleteWeekPlan(weekStart: Date, kidId: String, appState: AppState) async throws {
        let calendar = Calendar.current
        let dates = (0..<7).map { offset in
            calendar.date(byAdding: .day, value: offset, to: weekStart)!
        }

        let entries = dates.flatMap { date in
            appState.planEntriesForDate(date, kidId: kidId)
        }

        for entry in entries {
            try await appState.deletePlanEntry(entry.id)
        }
        // No toast here: the caller shows one "Week cleared" with Undo, which
        // a second toast from here used to queue behind.
    }

    /// The first allergen `kid` reacts to in any food of the entry: its own
    /// food plus, for a recipe, the recipe's linked foods. Nil when clear.
    static func allergenHit(entry: PlanEntry, kid: Kid, appState: AppState) -> String? {
        var ids = [entry.foodId]
        if let rid = entry.recipeId, let recipe = appState.recipes.first(where: { $0.id == rid }) {
            ids += recipe.foodIds + recipe.ingredients.compactMap(\.foodId)
        }
        for id in ids {
            guard let food = appState.foods.first(where: { $0.id == id }) else { continue }
            if let hit = AllergenMatcher.hit(for: kid, food: food) { return hit }
        }
        return nil
    }

    // MARK: - Templates

    /// Saves the current week as a reusable template.
    func saveAsTemplate(
        name: String,
        weekStart: Date,
        kidId: String,
        appState: AppState
    ) async throws {
        let calendar = Calendar.current
        let dates = (0..<7).map { offset in
            calendar.date(byAdding: .day, value: offset, to: weekStart)!
        }

        var meals: [TemplateMeal] = []
        for (dayIndex, date) in dates.enumerated() {
            let entries = appState.planEntriesForDate(date, kidId: kidId)
            for entry in entries {
                let foodName = appState.foods.first { $0.id == entry.foodId }?.name ?? "Unknown"
                meals.append(TemplateMeal(
                    dayIndex: dayIndex,
                    mealSlot: entry.mealSlot,
                    foodId: entry.foodId,
                    foodName: foodName,
                    recipeId: entry.recipeId
                ))
            }
        }

        // meal_plan_templates.user_id is NOT NULL UUID. Pull it from the
        // current auth session rather than sending "" which Postgres
        // rejects as `invalid input syntax for type uuid`.
        let session = try await client.auth.session
        let template = MealPlanTemplate(
            id: UUID().uuidString,
            userId: session.user.id.uuidString.lowercased(),
            name: name,
            meals: meals
        )

        try await client.from("meal_plan_templates")
            .insert(template)
            .execute()

        toast.success("Template saved", message: "\(name) saved with \(meals.count) meals.")
        HapticManager.success()
    }

    /// Fetches all saved templates.
    func fetchTemplates() async throws -> [MealPlanTemplate] {
        try await client.from("meal_plan_templates")
            .select()
            .order("created_at", ascending: false)
            .execute()
            .value
    }

    /// Applies a template to a target week.
    func applyTemplate(
        _ template: MealPlanTemplate,
        to weekStart: Date,
        kidId: String,
        appState: AppState
    ) async throws {
        let calendar = Calendar.current

        for meal in template.meals {
            let date = calendar.date(byAdding: .day, value: meal.dayIndex, to: weekStart)!
            let entry = PlanEntry(
                id: UUID().uuidString,
                userId: "",
                kidId: kidId,
                date: DateFormatter.isoDate.string(from: date),
                mealSlot: meal.mealSlot,
                foodId: meal.foodId,
                recipeId: meal.recipeId
            )
            try await appState.addPlanEntry(entry, silent: true)
        }

        toast.success("Template applied", message: "\(template.name) applied to the week.")
        HapticManager.success()
    }
}
