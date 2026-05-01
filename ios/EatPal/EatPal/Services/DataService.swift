import Foundation
@preconcurrency import Supabase

/// Handles all CRUD operations against Supabase tables.
/// Each method maps to the corresponding web AppContext operation.
@MainActor
final class DataService {
    static let shared = DataService()
    private let client = SupabaseManager.client

    private init() {}

    // MARK: - Auth helpers

    /// Returns the current authenticated user's UUID as a lowercase string.
    /// Throws if no session is present so inserts never send an empty
    /// `user_id` (which Postgres rejects as `invalid input syntax for type uuid`).
    private func currentUserId() async throws -> String {
        let session = try await client.auth.session
        return session.user.id.uuidString.lowercased()
    }

    /// Ensures a candidate value is a valid UUID. When the caller passes
    /// an empty string we fall back to the current authenticated user.
    private func ensureUserId(_ existing: String) async throws -> String {
        let trimmed = existing.trimmingCharacters(in: .whitespacesAndNewlines)
        if UUID(uuidString: trimmed) != nil { return trimmed }
        return try await currentUserId()
    }

    // MARK: - Foods

    func fetchFoods() async throws -> [Food] {
        try await client.from("foods")
            .select()
            .order("name")
            .execute()
            .value
    }

    func insertFood(_ food: Food) async throws {
        var payload = food
        payload.userId = try await ensureUserId(payload.userId)
        try await client.from("foods")
            .insert(payload)
            .execute()
    }

    func updateFood(_ id: String, updates: FoodUpdate) async throws {
        try await client.from("foods")
            .update(updates)
            .eq("id", value: id)
            .execute()
    }

    func deleteFood(_ id: String) async throws {
        try await client.from("foods")
            .delete()
            .eq("id", value: id)
            .execute()
    }

    // MARK: - Bulk operations (US-269)

    /// Bulk delete foods. Single round-trip via `.in('id', ids)` so the
    /// user doesn't pay for N HTTP requests when clearing 30 items.
    func bulkDeleteFoods(_ ids: [String]) async throws {
        guard !ids.isEmpty else { return }
        try await client.from("foods")
            .delete()
            .in("id", values: ids)
            .execute()
    }

    /// Apply the same partial update to a batch of foods. The single
    /// FoodUpdate payload is sent once; the `.in` filter scopes the rows.
    func bulkUpdateFoods(_ ids: [String], updates: FoodUpdate) async throws {
        guard !ids.isEmpty else { return }
        try await client.from("foods")
            .update(updates)
            .in("id", values: ids)
            .execute()
    }

    func bulkInsertFoods(_ foods: [Food]) async throws {
        guard !foods.isEmpty else { return }
        var payload = foods
        let userId = try await ensureUserId(payload.first?.userId ?? "")
        for i in payload.indices { payload[i].userId = userId }
        try await client.from("foods")
            .insert(payload)
            .execute()
    }

    // MARK: - Kids

    func fetchKids() async throws -> [Kid] {
        try await client.from("kids")
            .select()
            .order("name")
            .execute()
            .value
    }

    func insertKid(_ kid: Kid) async throws {
        var payload = kid
        payload.userId = try await ensureUserId(payload.userId)
        try await client.from("kids")
            .insert(payload)
            .execute()
    }

    func updateKid(_ id: String, updates: KidUpdate) async throws {
        try await client.from("kids")
            .update(updates)
            .eq("id", value: id)
            .execute()
    }

    func deleteKid(_ id: String) async throws {
        try await client.from("kids")
            .delete()
            .eq("id", value: id)
            .execute()
    }

    // MARK: - Recipes

    func fetchRecipes() async throws -> [Recipe] {
        try await client.from("recipes")
            .select()
            .order("name")
            .execute()
            .value
    }

    func insertRecipe(_ recipe: Recipe) async throws {
        var payload = recipe
        payload.userId = try await ensureUserId(payload.userId)
        try await client.from("recipes")
            .insert(payload)
            .execute()
    }

    func updateRecipe(_ id: String, updates: RecipeUpdate) async throws {
        try await client.from("recipes")
            .update(updates)
            .eq("id", value: id)
            .execute()
    }

    func deleteRecipe(_ id: String) async throws {
        try await client.from("recipes")
            .delete()
            .eq("id", value: id)
            .execute()
    }

    // MARK: - Recipe Ingredients (US-265)

    /// Fetch all structured ingredient rows for the signed-in user. RLS
    /// scopes through recipe ownership so we can pull the whole set in
    /// one query and group client-side. Returned sorted by recipe + sort_order
    /// so callers can splat into `Recipe.ingredients` without re-sorting.
    func fetchRecipeIngredients() async throws -> [RecipeIngredient] {
        try await client.from("recipe_ingredients")
            .select()
            .order("recipe_id")
            .order("sort_order")
            .execute()
            .value
    }

    /// Bulk-insert ingredient rows for a single recipe. Caller is
    /// responsible for setting `sortOrder` and `recipeId` correctly.
    func insertRecipeIngredients(_ rows: [RecipeIngredient]) async throws {
        guard !rows.isEmpty else { return }
        try await client.from("recipe_ingredients")
            .insert(rows)
            .execute()
    }

    /// Replace the full ingredient set for a recipe in one transaction:
    /// delete existing rows, insert the new set. Used by the structured
    /// editor on save (simpler than diffing inserts/updates/deletes).
    func replaceRecipeIngredients(
        recipeId: String,
        with rows: [RecipeIngredient]
    ) async throws {
        try await client.from("recipe_ingredients")
            .delete()
            .eq("recipe_id", value: recipeId)
            .execute()
        if !rows.isEmpty {
            try await client.from("recipe_ingredients")
                .insert(rows)
                .execute()
        }
    }

    func updateRecipeIngredient(_ id: String, updates: RecipeIngredientUpdate) async throws {
        try await client.from("recipe_ingredients")
            .update(updates)
            .eq("id", value: id)
            .execute()
    }

    func deleteRecipeIngredient(_ id: String) async throws {
        try await client.from("recipe_ingredients")
            .delete()
            .eq("id", value: id)
            .execute()
    }

    // MARK: - Grocery Item Sources (US-264)

    /// Fetch all source-link rows visible to the signed-in user. RLS
    /// scopes through grocery_items ownership, so this returns only the
    /// rows that belong to the user's own grocery items.
    func fetchGroceryItemSources() async throws -> [GroceryItemSource] {
        try await client.from("grocery_item_sources")
            .select()
            .execute()
            .value
    }

    /// Bulk-insert source rows for one or more grocery items. The
    /// generator builds the full set client-side and inserts in a
    /// single round-trip per generation pass.
    func insertGroceryItemSources(_ rows: [GroceryItemSource]) async throws {
        guard !rows.isEmpty else { return }
        try await client.from("grocery_item_sources")
            .insert(rows)
            .execute()
    }

    /// Drop every source row pointing at a grocery item. Used by the
    /// generator before re-running so we don't accumulate stale links
    /// across generations. (DB-side ON DELETE CASCADE handles deletion
    /// when the grocery item itself is removed.)
    func deleteGroceryItemSourcesForItem(_ groceryItemId: String) async throws {
        try await client.from("grocery_item_sources")
            .delete()
            .eq("grocery_item_id", value: groceryItemId)
            .execute()
    }

    // MARK: - Mark Meal Made (US-262)

    /// Calls the `rpc_mark_meal_made` Postgres function. Server-side it
    /// debits pantry foods linked to the recipe's structured ingredients
    /// and auto-checks grocery items sourced from this plan entry — all
    /// in one transaction.
    func markMealMade(planEntryId: String) async throws -> MarkMealMadeResult {
        struct Args: Encodable {
            let planEntryId: String
            enum CodingKeys: String, CodingKey { case planEntryId = "p_plan_entry_id" }
        }
        return try await client.rpc(
            "rpc_mark_meal_made",
            params: Args(planEntryId: planEntryId)
        ).execute().value
    }

    // MARK: - Plan Entries

    func fetchPlanEntries() async throws -> [PlanEntry] {
        let calendar = Calendar.current
        let now = Date()
        let past = calendar.date(byAdding: .day, value: -30, to: now)!
        let future = calendar.date(byAdding: .day, value: 90, to: now)!
        let pastStr = DateFormatter.isoDate.string(from: past)
        let futureStr = DateFormatter.isoDate.string(from: future)

        return try await client.from("plan_entries")
            .select()
            .gte("date", value: pastStr)
            .lte("date", value: futureStr)
            .order("date")
            .execute()
            .value
    }

    func insertPlanEntry(_ entry: PlanEntry) async throws {
        var payload = entry
        payload.userId = try await ensureUserId(payload.userId)

        // plan_entries.kid_id and food_id are NOT NULL UUIDs in Postgres.
        // Surface a friendly error instead of letting the database reject
        // the insert with `invalid input syntax for type uuid: ""`.
        if UUID(uuidString: payload.kidId) == nil {
            throw DataServiceError.missingKid
        }
        if UUID(uuidString: payload.foodId) == nil {
            throw DataServiceError.missingFood
        }

        try await client.from("plan_entries")
            .insert(payload)
            .execute()
    }

    func updatePlanEntry(_ id: String, updates: PlanEntryUpdate) async throws {
        try await client.from("plan_entries")
            .update(updates)
            .eq("id", value: id)
            .execute()
    }

    func deletePlanEntry(_ id: String) async throws {
        try await client.from("plan_entries")
            .delete()
            .eq("id", value: id)
            .execute()
    }

    // MARK: - Plan Entry Feedback (US-231)

    func fetchPlanEntryFeedback() async throws -> [PlanEntryFeedback] {
        try await client.from("plan_entry_feedback")
            .select()
            .order("created_at", ascending: false)
            .execute()
            .value
    }

    func insertPlanEntryFeedback(_ feedback: PlanEntryFeedbackInsert) async throws {
        var payload = feedback
        payload.userId = try await ensureUserId(payload.userId)
        try await client.from("plan_entry_feedback")
            .insert(payload)
            .execute()
    }

    // MARK: - Grocery Items

    func fetchGroceryItems() async throws -> [GroceryItem] {
        try await client.from("grocery_items")
            .select()
            .order("created_at", ascending: false)
            .execute()
            .value
    }

    func insertGroceryItem(_ item: GroceryItem) async throws {
        var payload = item
        payload.userId = try await ensureUserId(payload.userId)
        try await client.from("grocery_items")
            .insert(payload)
            .execute()
    }

    func updateGroceryItem(_ id: String, updates: GroceryItemUpdate) async throws {
        try await client.from("grocery_items")
            .update(updates)
            .eq("id", value: id)
            .execute()
    }

    func deleteGroceryItem(_ id: String) async throws {
        try await client.from("grocery_items")
            .delete()
            .eq("id", value: id)
            .execute()
    }

    // MARK: - Bulk operations: grocery (US-269)

    func bulkDeleteGroceryItems(_ ids: [String]) async throws {
        guard !ids.isEmpty else { return }
        try await client.from("grocery_items")
            .delete()
            .in("id", values: ids)
            .execute()
    }

    func bulkUpdateGroceryItems(_ ids: [String], updates: GroceryItemUpdate) async throws {
        guard !ids.isEmpty else { return }
        try await client.from("grocery_items")
            .update(updates)
            .in("id", values: ids)
            .execute()
    }

    func bulkInsertGroceryItems(_ items: [GroceryItem]) async throws {
        guard !items.isEmpty else { return }
        var payload = items
        let userId = try await ensureUserId(payload.first?.userId ?? "")
        for i in payload.indices { payload[i].userId = userId }
        try await client.from("grocery_items")
            .insert(payload)
            .execute()
    }

    // MARK: - Bulk operations: recipes (US-269)

    func bulkDeleteRecipes(_ ids: [String]) async throws {
        guard !ids.isEmpty else { return }
        try await client.from("recipes")
            .delete()
            .in("id", values: ids)
            .execute()
    }

    // MARK: - Grocery Lists

    func fetchGroceryLists() async throws -> [GroceryList] {
        try await client.from("grocery_lists")
            .select()
            .order("created_at", ascending: false)
            .execute()
            .value
    }
}

// MARK: - Errors

enum DataServiceError: LocalizedError {
    case missingFood
    case missingKid

    var errorDescription: String? {
        switch self {
        case .missingFood:
            return "Pick a food before adding it to the plan."
        case .missingKid:
            return "Select a child profile first."
        }
    }
}
