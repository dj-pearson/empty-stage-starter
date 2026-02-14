import SwiftUI
import Combine

/// Central application state that mirrors the web AppContext.
/// Manages foods, kids, recipes, plan entries, and grocery items
/// with optimistic local updates and Supabase sync.
@MainActor
final class AppState: ObservableObject {
    // MARK: - Published State

    @Published var foods: [Food] = []
    @Published var kids: [Kid] = []
    @Published var recipes: [Recipe] = []
    @Published var planEntries: [PlanEntry] = []
    @Published var groceryItems: [GroceryItem] = []
    @Published var groceryLists: [GroceryList] = []

    @Published var activeKidId: String?
    @Published var isLoading = false
    @Published var errorMessage: String?

    // MARK: - Services

    private let dataService = DataService.shared

    // MARK: - Computed Properties

    var activeKid: Kid? {
        kids.first { $0.id == activeKidId }
    }

    var safeFoods: [Food] {
        foods.filter { $0.isSafe }
    }

    var tryBiteFoods: [Food] {
        foods.filter { $0.isTryBite }
    }

    var foodsByCategory: [String: [Food]] {
        Dictionary(grouping: foods, by: { $0.category })
    }

    // MARK: - Data Loading

    func loadAllData() async {
        isLoading = true
        errorMessage = nil

        do {
            async let fetchedFoods = dataService.fetchFoods()
            async let fetchedKids = dataService.fetchKids()
            async let fetchedRecipes = dataService.fetchRecipes()
            async let fetchedPlanEntries = dataService.fetchPlanEntries()
            async let fetchedGroceryItems = dataService.fetchGroceryItems()
            async let fetchedGroceryLists = dataService.fetchGroceryLists()

            let (f, k, r, p, g, gl) = try await (
                fetchedFoods, fetchedKids, fetchedRecipes,
                fetchedPlanEntries, fetchedGroceryItems, fetchedGroceryLists
            )

            foods = f
            kids = k
            recipes = r
            planEntries = p
            groceryItems = g
            groceryLists = gl

            if activeKidId == nil, let firstKid = kids.first {
                activeKidId = firstKid.id
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    func clearData() {
        foods = []
        kids = []
        recipes = []
        planEntries = []
        groceryItems = []
        groceryLists = []
        activeKidId = nil
    }

    // MARK: - Food Operations

    func addFood(_ food: Food) async throws {
        foods.append(food)
        try await dataService.insertFood(food)
    }

    func updateFood(_ id: String, updates: FoodUpdate) async throws {
        if let index = foods.firstIndex(where: { $0.id == id }) {
            foods[index].apply(updates)
            try await dataService.updateFood(id, updates: updates)
        }
    }

    func deleteFood(_ id: String) async throws {
        foods.removeAll { $0.id == id }
        try await dataService.deleteFood(id)
    }

    // MARK: - Kid Operations

    func addKid(_ kid: Kid) async throws {
        kids.append(kid)
        try await dataService.insertKid(kid)
        if activeKidId == nil {
            activeKidId = kid.id
        }
    }

    func updateKid(_ id: String, updates: KidUpdate) async throws {
        if let index = kids.firstIndex(where: { $0.id == id }) {
            kids[index].apply(updates)
            try await dataService.updateKid(id, updates: updates)
        }
    }

    func deleteKid(_ id: String) async throws {
        kids.removeAll { $0.id == id }
        if activeKidId == id {
            activeKidId = kids.first?.id
        }
        try await dataService.deleteKid(id)
    }

    // MARK: - Recipe Operations

    func addRecipe(_ recipe: Recipe) async throws {
        recipes.append(recipe)
        try await dataService.insertRecipe(recipe)
    }

    func updateRecipe(_ id: String, updates: RecipeUpdate) async throws {
        if let index = recipes.firstIndex(where: { $0.id == id }) {
            recipes[index].apply(updates)
            try await dataService.updateRecipe(id, updates: updates)
        }
    }

    func deleteRecipe(_ id: String) async throws {
        recipes.removeAll { $0.id == id }
        try await dataService.deleteRecipe(id)
    }

    // MARK: - Plan Entry Operations

    func addPlanEntry(_ entry: PlanEntry) async throws {
        planEntries.append(entry)
        try await dataService.insertPlanEntry(entry)
    }

    func updatePlanEntry(_ id: String, updates: PlanEntryUpdate) async throws {
        if let index = planEntries.firstIndex(where: { $0.id == id }) {
            planEntries[index].apply(updates)
            try await dataService.updatePlanEntry(id, updates: updates)
        }
    }

    func deletePlanEntry(_ id: String) async throws {
        planEntries.removeAll { $0.id == id }
        try await dataService.deletePlanEntry(id)
    }

    func planEntriesForDate(_ date: Date, kidId: String) -> [PlanEntry] {
        let dateString = DateFormatter.isoDate.string(from: date)
        return planEntries.filter { $0.kidId == kidId && $0.date == dateString }
    }

    // MARK: - Grocery Operations

    func addGroceryItem(_ item: GroceryItem) async throws {
        groceryItems.append(item)
        try await dataService.insertGroceryItem(item)
    }

    func updateGroceryItem(_ id: String, updates: GroceryItemUpdate) async throws {
        if let index = groceryItems.firstIndex(where: { $0.id == id }) {
            groceryItems[index].apply(updates)
            try await dataService.updateGroceryItem(id, updates: updates)
        }
    }

    func deleteGroceryItem(_ id: String) async throws {
        groceryItems.removeAll { $0.id == id }
        try await dataService.deleteGroceryItem(id)
    }

    func toggleGroceryItem(_ id: String) async throws {
        if let index = groceryItems.firstIndex(where: { $0.id == id }) {
            groceryItems[index].checked.toggle()
            try await dataService.updateGroceryItem(
                id,
                updates: GroceryItemUpdate(checked: groceryItems[index].checked)
            )
        }
    }

    func clearCheckedGroceryItems() async throws {
        let checkedIds = groceryItems.filter(\.checked).map(\.id)
        groceryItems.removeAll { $0.checked }
        for id in checkedIds {
            try await dataService.deleteGroceryItem(id)
        }
    }
}
