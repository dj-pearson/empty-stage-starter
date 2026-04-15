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
