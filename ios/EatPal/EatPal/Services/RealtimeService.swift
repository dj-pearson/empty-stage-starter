import Foundation
@preconcurrency import Supabase
@preconcurrency import Realtime

/// Manages Supabase real-time subscriptions so changes from web or other devices
/// are reflected in the iOS app without manual refresh.
@MainActor
final class RealtimeService {
    static let shared = RealtimeService()
    private let client = SupabaseManager.client
    private var channels: [RealtimeChannelV2] = []
    private var listenerTasks: [Task<Void, Never>] = []

    private init() {}

    /// Subscribes to all relevant table changes for the current user's data.
    /// Call this after authentication succeeds.
    func subscribe(appState: AppState) async {
        await unsubscribeAll()

        // Foods channel
        let foodsChannel = client.realtimeV2.channel("foods-changes")
        let foodsChanges = foodsChannel.postgresChange(
            AnyAction.self,
            schema: "public",
            table: "foods"
        )
        channels.append(foodsChannel)
        await subscribeChannel(foodsChannel, name: "foods")

        listenerTasks.append(Task { [weak appState] in
            guard let appState else { return }
            for await change in foodsChanges {
                await self.handleFoodsChange(change, appState: appState)
            }
        })

        // Kids channel
        let kidsChannel = client.realtimeV2.channel("kids-changes")
        let kidsChanges = kidsChannel.postgresChange(
            AnyAction.self,
            schema: "public",
            table: "kids"
        )
        channels.append(kidsChannel)
        await subscribeChannel(kidsChannel, name: "kids")

        listenerTasks.append(Task { [weak appState] in
            guard let appState else { return }
            for await change in kidsChanges {
                await self.handleKidsChange(change, appState: appState)
            }
        })

        // Grocery items channel
        let groceryChannel = client.realtimeV2.channel("grocery-changes")
        let groceryChanges = groceryChannel.postgresChange(
            AnyAction.self,
            schema: "public",
            table: "grocery_items"
        )
        channels.append(groceryChannel)
        await subscribeChannel(groceryChannel, name: "grocery_items")

        listenerTasks.append(Task { [weak appState] in
            guard let appState else { return }
            for await change in groceryChanges {
                await self.handleGroceryChange(change, appState: appState)
            }
        })

        // Plan entries channel
        let planChannel = client.realtimeV2.channel("plan-changes")
        let planChanges = planChannel.postgresChange(
            AnyAction.self,
            schema: "public",
            table: "plan_entries"
        )
        channels.append(planChannel)
        await subscribeChannel(planChannel, name: "plan_entries")

        listenerTasks.append(Task { [weak appState] in
            guard let appState else { return }
            for await change in planChanges {
                await self.handlePlanChange(change, appState: appState)
            }
        })

        // Recipes channel
        let recipesChannel = client.realtimeV2.channel("recipes-changes")
        let recipesChanges = recipesChannel.postgresChange(
            AnyAction.self,
            schema: "public",
            table: "recipes"
        )
        channels.append(recipesChannel)
        await subscribeChannel(recipesChannel, name: "recipes")

        listenerTasks.append(Task { [weak appState] in
            guard let appState else { return }
            for await change in recipesChanges {
                await self.handleRecipesChange(change, appState: appState)
            }
        })
    }

    /// Subscribe to a channel and surface errors instead of swallowing them silently.
    private func subscribeChannel(_ channel: RealtimeChannelV2, name: String) async {
        do {
            try await channel.subscribeWithError()
        } catch {
            #if DEBUG
            print("Realtime subscribe failed for \(name): \(error)")
            #endif
        }
    }

    /// Unsubscribes from all active channels and cancels listener tasks.
    func unsubscribeAll() async {
        for task in listenerTasks {
            task.cancel()
        }
        listenerTasks.removeAll()

        for channel in channels {
            await channel.unsubscribe()
        }
        channels.removeAll()
    }

    // MARK: - Change Handlers

    private func handleFoodsChange(_ change: AnyAction, appState: AppState) async {
        switch change {
        case .insert(let action):
            if let food: Food = try? action.decodeRecord(decoder: JSONDecoder.supabase) {
                if !appState.foods.contains(where: { $0.id == food.id }) {
                    appState.foods.append(food)
                }
            }
        case .update(let action):
            if let food: Food = try? action.decodeRecord(decoder: JSONDecoder.supabase) {
                if let index = appState.foods.firstIndex(where: { $0.id == food.id }) {
                    appState.foods[index] = food
                }
            }
        case .delete(let action):
            if let id = action.oldRecord["id"]?.stringValue {
                appState.foods.removeAll { $0.id == id }
            }
        }
    }

    private func handleKidsChange(_ change: AnyAction, appState: AppState) async {
        switch change {
        case .insert(let action):
            if let kid: Kid = try? action.decodeRecord(decoder: JSONDecoder.supabase) {
                if !appState.kids.contains(where: { $0.id == kid.id }) {
                    appState.kids.append(kid)
                }
            }
        case .update(let action):
            if let kid: Kid = try? action.decodeRecord(decoder: JSONDecoder.supabase) {
                if let index = appState.kids.firstIndex(where: { $0.id == kid.id }) {
                    appState.kids[index] = kid
                }
            }
        case .delete(let action):
            if let id = action.oldRecord["id"]?.stringValue {
                appState.kids.removeAll { $0.id == id }
            }
        }
    }

    private func handleGroceryChange(_ change: AnyAction, appState: AppState) async {
        switch change {
        case .insert(let action):
            if let item: GroceryItem = try? action.decodeRecord(decoder: JSONDecoder.supabase) {
                if !appState.groceryItems.contains(where: { $0.id == item.id }) {
                    appState.groceryItems.append(item)
                }
            }
        case .update(let action):
            if let item: GroceryItem = try? action.decodeRecord(decoder: JSONDecoder.supabase) {
                if let index = appState.groceryItems.firstIndex(where: { $0.id == item.id }) {
                    appState.groceryItems[index] = item
                }
            }
        case .delete(let action):
            if let id = action.oldRecord["id"]?.stringValue {
                appState.groceryItems.removeAll { $0.id == id }
            }
        }
    }

    private func handlePlanChange(_ change: AnyAction, appState: AppState) async {
        switch change {
        case .insert(let action):
            if let entry: PlanEntry = try? action.decodeRecord(decoder: JSONDecoder.supabase) {
                if !appState.planEntries.contains(where: { $0.id == entry.id }) {
                    appState.planEntries.append(entry)
                }
            }
        case .update(let action):
            if let entry: PlanEntry = try? action.decodeRecord(decoder: JSONDecoder.supabase) {
                if let index = appState.planEntries.firstIndex(where: { $0.id == entry.id }) {
                    appState.planEntries[index] = entry
                }
            }
        case .delete(let action):
            if let id = action.oldRecord["id"]?.stringValue {
                appState.planEntries.removeAll { $0.id == id }
            }
        }
    }

    private func handleRecipesChange(_ change: AnyAction, appState: AppState) async {
        switch change {
        case .insert(let action):
            if let recipe: Recipe = try? action.decodeRecord(decoder: JSONDecoder.supabase) {
                if !appState.recipes.contains(where: { $0.id == recipe.id }) {
                    appState.recipes.append(recipe)
                }
            }
        case .update(let action):
            if let recipe: Recipe = try? action.decodeRecord(decoder: JSONDecoder.supabase) {
                if let index = appState.recipes.firstIndex(where: { $0.id == recipe.id }) {
                    appState.recipes[index] = recipe
                }
            }
        case .delete(let action):
            if let id = action.oldRecord["id"]?.stringValue {
                appState.recipes.removeAll { $0.id == id }
            }
        }
    }
}

// MARK: - JSON Decoder for Supabase snake_case

extension JSONDecoder {
    static let supabase: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }()
}
