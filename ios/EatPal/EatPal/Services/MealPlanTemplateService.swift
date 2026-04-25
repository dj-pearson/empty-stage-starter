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

        enum CodingKeys: String, CodingKey {
            case dayIndex = "day_index"
            case mealSlot = "meal_slot"
            case foodId = "food_id"
            case foodName = "food_name"
        }
    }

    // MARK: - Copy Week Plan

    /// Copies all plan entries from one week to another for a given kid.
    func copyWeekPlan(
        from sourceWeekStart: Date,
        to targetWeekStart: Date,
        kidId: String,
        appState: AppState
    ) async throws {
        let calendar = Calendar.current
        let sourceDates = (0..<7).map { offset in
            calendar.date(byAdding: .day, value: offset, to: sourceWeekStart)!
        }

        let sourceEntries = sourceDates.flatMap { date in
            appState.planEntriesForDate(date, kidId: kidId)
        }

        guard !sourceEntries.isEmpty else {
            toast.warning("No meals to copy", message: "The source week has no planned meals.")
            return
        }

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
                foodId: entry.foodId
            )

            try await appState.addPlanEntry(newEntry)
        }

        toast.success("Week copied", message: "Copied \(sourceEntries.count) meals to new week.")
        HapticManager.success()
    }

    // MARK: - Cross-Kid Plan Copy (US-229)

    struct CrossKidCopyResult {
        let copied: Int
        let skippedAllergens: [String] // unique allergen names that triggered skips
        let skippedCount: Int
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
            return CrossKidCopyResult(copied: 0, skippedAllergens: [], skippedCount: 0)
        }

        let targetKid = appState.kids.first { $0.id == targetKidId }
        let targetAllergens = Set((targetKid?.allergens ?? []).map { $0.lowercased() })

        var copied = 0
        var skipped = 0
        var skippedAllergenSet: Set<String> = []

        for entry in sourceEntries {
            // Allergen guard: if the entry's food declares any allergen the
            // target kid reacts to, skip it and remember which one.
            if !targetAllergens.isEmpty,
               let food = appState.foods.first(where: { $0.id == entry.foodId }) {
                let foodAllergens = Set((food.allergens ?? []).map { $0.lowercased() })
                let conflict = foodAllergens.intersection(targetAllergens)
                if !conflict.isEmpty {
                    skipped += 1
                    skippedAllergenSet.formUnion(conflict)
                    continue
                }
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
                try await appState.addPlanEntry(copy)
                copied += 1
            } catch {
                skipped += 1
            }
        }

        return CrossKidCopyResult(
            copied: copied,
            skippedAllergens: Array(skippedAllergenSet).sorted(),
            skippedCount: skipped
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

        toast.success("Week cleared", message: "Removed \(entries.count) meals.")
        HapticManager.mediumImpact()
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
                    foodName: foodName
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
                foodId: meal.foodId
            )
            try await appState.addPlanEntry(entry)
        }

        toast.success("Template applied", message: "\(template.name) applied to the week.")
        HapticManager.success()
    }
}
