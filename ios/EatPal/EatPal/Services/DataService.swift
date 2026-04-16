import Foundation
@preconcurrency import Supabase

/// Handles all CRUD operations against Supabase tables.
///
/// RLS on every core table checks
/// `household_id = get_user_household_id(auth.uid())`.
/// Every insert therefore needs both a valid `user_id` and `household_id`,
/// which this service resolves automatically from the auth session.
@MainActor
final class DataService {
    static let shared = DataService()
    private let client = SupabaseManager.client
    private var cachedHouseholdId: String?

    private init() {}

    // MARK: - Auth / Household helpers

    private func currentUserId() async throws -> String {
        let session = try await client.auth.session
        return session.user.id.uuidString.lowercased()
    }

    private func ensureUserId(_ existing: String) async throws -> String {
        let trimmed = existing.trimmingCharacters(in: .whitespacesAndNewlines)
        if UUID(uuidString: trimmed) != nil { return trimmed }
        return try await currentUserId()
    }

    private func currentHouseholdId() async throws -> String {
        if let cached = cachedHouseholdId { return cached }
        let uid = try await currentUserId()
        struct P: Encodable { let _user_id: String }
        let value: String? = try await client
            .rpc("get_user_household_id", params: P(_user_id: uid))
            .execute()
            .value
        guard let hhId = value, UUID(uuidString: hhId) != nil else {
            throw DataServiceError.missingHousehold
        }
        cachedHouseholdId = hhId
        return hhId
    }

    private func ensureHouseholdId(_ existing: String?) async throws -> String {
        if let existing, UUID(uuidString: existing) != nil { return existing }
        return try await currentHouseholdId()
    }

    func resetCache() { cachedHouseholdId = nil }

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
        payload.householdId = try await ensureHouseholdId(payload.householdId)
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
        payload.householdId = try await ensureHouseholdId(payload.householdId)
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
        payload.householdId = try await ensureHouseholdId(payload.householdId)
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
        payload.householdId = try await ensureHouseholdId(payload.householdId)

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
        payload.householdId = try await ensureHouseholdId(payload.householdId)
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
    case missingHousehold

    var errorDescription: String? {
        switch self {
        case .missingFood:
            return "Pick a food before adding it to the plan."
        case .missingKid:
            return "Select a child profile first."
        case .missingHousehold:
            return "Couldn't find your household. Please sign out and back in."
        }
    }
}
