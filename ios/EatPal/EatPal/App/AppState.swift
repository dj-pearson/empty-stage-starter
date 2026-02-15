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
    private let realtimeService = RealtimeService.shared
    private let toast = ToastManager.shared

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

            // Start real-time subscriptions after initial load
            await realtimeService.subscribe(appState: self)
        } catch {
            errorMessage = error.localizedDescription
            toast.error("Failed to load data", message: error.localizedDescription)
            HapticManager.error()
        }

        isLoading = false
    }

    func clearData() {
        Task { await realtimeService.unsubscribeAll() }
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
        do {
            try await dataService.insertFood(food)
            toast.success("Food added", message: "\(food.name) added to pantry")
            HapticManager.success()
        } catch {
            foods.removeAll { $0.id == food.id }
            toast.error("Failed to add food", message: error.localizedDescription)
            HapticManager.error()
            throw error
        }
    }

    func updateFood(_ id: String, updates: FoodUpdate) async throws {
        guard let index = foods.firstIndex(where: { $0.id == id }) else { return }
        let original = foods[index]
        foods[index].apply(updates)
        do {
            try await dataService.updateFood(id, updates: updates)
            toast.success("Food updated")
            HapticManager.lightImpact()
        } catch {
            foods[index] = original
            toast.error("Failed to update food", message: error.localizedDescription)
            HapticManager.error()
            throw error
        }
    }

    func deleteFood(_ id: String) async throws {
        let removed = foods.filter { $0.id == id }
        foods.removeAll { $0.id == id }
        do {
            try await dataService.deleteFood(id)
            toast.success("Food deleted")
            HapticManager.mediumImpact()
        } catch {
            foods.append(contentsOf: removed)
            toast.error("Failed to delete food", message: error.localizedDescription)
            HapticManager.error()
            throw error
        }
    }

    // MARK: - Kid Operations

    func addKid(_ kid: Kid) async throws {
        kids.append(kid)
        do {
            try await dataService.insertKid(kid)
            if activeKidId == nil { activeKidId = kid.id }
            toast.success("Child added", message: "\(kid.name) added to family")
            HapticManager.success()
        } catch {
            kids.removeAll { $0.id == kid.id }
            toast.error("Failed to add child", message: error.localizedDescription)
            HapticManager.error()
            throw error
        }
    }

    func updateKid(_ id: String, updates: KidUpdate) async throws {
        guard let index = kids.firstIndex(where: { $0.id == id }) else { return }
        let original = kids[index]
        kids[index].apply(updates)
        do {
            try await dataService.updateKid(id, updates: updates)
            toast.success("Profile updated")
            HapticManager.lightImpact()
        } catch {
            kids[index] = original
            toast.error("Failed to update profile", message: error.localizedDescription)
            HapticManager.error()
            throw error
        }
    }

    func deleteKid(_ id: String) async throws {
        let removed = kids.filter { $0.id == id }
        kids.removeAll { $0.id == id }
        if activeKidId == id { activeKidId = kids.first?.id }
        do {
            try await dataService.deleteKid(id)
            toast.success("Child removed")
            HapticManager.mediumImpact()
        } catch {
            kids.append(contentsOf: removed)
            toast.error("Failed to remove child", message: error.localizedDescription)
            HapticManager.error()
            throw error
        }
    }

    // MARK: - Recipe Operations

    func addRecipe(_ recipe: Recipe) async throws {
        recipes.append(recipe)
        do {
            try await dataService.insertRecipe(recipe)
            toast.success("Recipe created", message: "\(recipe.name) saved")
            HapticManager.success()
        } catch {
            recipes.removeAll { $0.id == recipe.id }
            toast.error("Failed to create recipe", message: error.localizedDescription)
            HapticManager.error()
            throw error
        }
    }

    func updateRecipe(_ id: String, updates: RecipeUpdate) async throws {
        guard let index = recipes.firstIndex(where: { $0.id == id }) else { return }
        let original = recipes[index]
        recipes[index].apply(updates)
        do {
            try await dataService.updateRecipe(id, updates: updates)
            toast.success("Recipe updated")
            HapticManager.lightImpact()
        } catch {
            recipes[index] = original
            toast.error("Failed to update recipe", message: error.localizedDescription)
            HapticManager.error()
            throw error
        }
    }

    func deleteRecipe(_ id: String) async throws {
        let removed = recipes.filter { $0.id == id }
        recipes.removeAll { $0.id == id }
        do {
            try await dataService.deleteRecipe(id)
            toast.success("Recipe deleted")
            HapticManager.mediumImpact()
        } catch {
            recipes.append(contentsOf: removed)
            toast.error("Failed to delete recipe", message: error.localizedDescription)
            HapticManager.error()
            throw error
        }
    }

    // MARK: - Plan Entry Operations

    func addPlanEntry(_ entry: PlanEntry) async throws {
        planEntries.append(entry)
        do {
            try await dataService.insertPlanEntry(entry)
            toast.success("Meal added to plan")
            HapticManager.success()
        } catch {
            planEntries.removeAll { $0.id == entry.id }
            toast.error("Failed to add meal", message: error.localizedDescription)
            HapticManager.error()
            throw error
        }
    }

    func updatePlanEntry(_ id: String, updates: PlanEntryUpdate) async throws {
        guard let index = planEntries.firstIndex(where: { $0.id == id }) else { return }
        let original = planEntries[index]
        planEntries[index].apply(updates)
        do {
            try await dataService.updatePlanEntry(id, updates: updates)
            if let result = updates.result {
                toast.success("Result logged", message: "Marked as \(result)")
            }
            HapticManager.lightImpact()
        } catch {
            planEntries[index] = original
            toast.error("Failed to update meal", message: error.localizedDescription)
            HapticManager.error()
            throw error
        }
    }

    func deletePlanEntry(_ id: String) async throws {
        let removed = planEntries.filter { $0.id == id }
        planEntries.removeAll { $0.id == id }
        do {
            try await dataService.deletePlanEntry(id)
            HapticManager.mediumImpact()
        } catch {
            planEntries.append(contentsOf: removed)
            toast.error("Failed to remove meal", message: error.localizedDescription)
            HapticManager.error()
            throw error
        }
    }

    func planEntriesForDate(_ date: Date, kidId: String) -> [PlanEntry] {
        let dateString = DateFormatter.isoDate.string(from: date)
        return planEntries.filter { $0.kidId == kidId && $0.date == dateString }
    }

    // MARK: - Grocery Operations

    func addGroceryItem(_ item: GroceryItem) async throws {
        groceryItems.append(item)
        do {
            try await dataService.insertGroceryItem(item)
            toast.success("Item added", message: "\(item.name) added to list")
            HapticManager.success()
        } catch {
            groceryItems.removeAll { $0.id == item.id }
            toast.error("Failed to add item", message: error.localizedDescription)
            HapticManager.error()
            throw error
        }
    }

    func updateGroceryItem(_ id: String, updates: GroceryItemUpdate) async throws {
        guard let index = groceryItems.firstIndex(where: { $0.id == id }) else { return }
        let original = groceryItems[index]
        groceryItems[index].apply(updates)
        do {
            try await dataService.updateGroceryItem(id, updates: updates)
            HapticManager.lightImpact()
        } catch {
            groceryItems[index] = original
            toast.error("Failed to update item", message: error.localizedDescription)
            HapticManager.error()
            throw error
        }
    }

    func deleteGroceryItem(_ id: String) async throws {
        let removed = groceryItems.filter { $0.id == id }
        groceryItems.removeAll { $0.id == id }
        do {
            try await dataService.deleteGroceryItem(id)
            HapticManager.mediumImpact()
        } catch {
            groceryItems.append(contentsOf: removed)
            toast.error("Failed to delete item", message: error.localizedDescription)
            HapticManager.error()
            throw error
        }
    }

    func toggleGroceryItem(_ id: String) async throws {
        guard let index = groceryItems.firstIndex(where: { $0.id == id }) else { return }
        groceryItems[index].checked.toggle()
        let checked = groceryItems[index].checked
        do {
            try await dataService.updateGroceryItem(
                id,
                updates: GroceryItemUpdate(checked: checked)
            )
            HapticManager.lightImpact()
        } catch {
            groceryItems[index].checked.toggle()
            toast.error("Failed to update item")
            HapticManager.error()
            throw error
        }
    }

    func clearCheckedGroceryItems() async throws {
        let checked = groceryItems.filter(\.checked)
        let checkedIds = checked.map(\.id)
        groceryItems.removeAll { $0.checked }
        do {
            for id in checkedIds {
                try await dataService.deleteGroceryItem(id)
            }
            toast.success("Cleared \(checkedIds.count) items")
            HapticManager.success()
        } catch {
            groceryItems.append(contentsOf: checked)
            toast.error("Failed to clear items", message: error.localizedDescription)
            HapticManager.error()
            throw error
        }
    }
}
