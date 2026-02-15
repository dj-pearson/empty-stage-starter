import Foundation
import Supabase

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

        let template = MealPlanTemplate(
            id: UUID().uuidString,
            userId: "",
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
