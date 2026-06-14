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

    // MARK: - Decode helper

    /// US-381: decode a realtime record, reporting failures to Sentry
    /// instead of swallowing them with `try?`. A thrown decode error here
    /// means a live insert/update silently never applied — exactly the
    /// class of bug we want surfaced, not hidden.
    private func decodeRealtimeRecord<T: Decodable>(
        _ body: () throws -> T,
        table: String
    ) -> T? {
        do {
            return try body()
        } catch {
            SentryService.capture(error, extras: [
                "context": "realtime_decode",
                "table": table
            ])
            return nil
        }
    }

    // MARK: - Change Handlers

    private func handleFoodsChange(_ change: AnyAction, appState: AppState) async {
        switch change {
        case .insert(let action):
            if let food: Food = decodeRealtimeRecord({ try action.decodeRecord(decoder: JSONDecoder.supabase) }, table: "foods") {
                if !appState.foods.contains(where: { $0.id == food.id }) {
                    appState.foods.append(food)
                }
            }
        case .update(let action):
            if let food: Food = decodeRealtimeRecord({ try action.decodeRecord(decoder: JSONDecoder.supabase) }, table: "foods") {
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
            if let kid: Kid = decodeRealtimeRecord({ try action.decodeRecord(decoder: JSONDecoder.supabase) }, table: "kids") {
                if !appState.kids.contains(where: { $0.id == kid.id }) {
                    appState.kids.append(kid)
                }
            }
        case .update(let action):
            if let kid: Kid = decodeRealtimeRecord({ try action.decodeRecord(decoder: JSONDecoder.supabase) }, table: "kids") {
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
            if let item: GroceryItem = decodeRealtimeRecord({ try action.decodeRecord(decoder: JSONDecoder.supabase) }, table: "grocery_items") {
                if !appState.groceryItems.contains(where: { $0.id == item.id }) {
                    appState.groceryItems.append(item)
                }
            }
        case .update(let action):
            if let item: GroceryItem = decodeRealtimeRecord({ try action.decodeRecord(decoder: JSONDecoder.supabase) }, table: "grocery_items") {
                // US-255: detect simultaneous local edit on the same row.
                // Last-write-wins applies (we still take the realtime item),
                // but the toast warns the user another member edited too.
                await detectAndAnnounceConflict(
                    table: .groceryItems,
                    rowId: item.id,
                    displayName: item.name
                )
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
            if let entry: PlanEntry = decodeRealtimeRecord({ try action.decodeRecord(decoder: JSONDecoder.supabase) }, table: "plan_entries") {
                if !appState.planEntries.contains(where: { $0.id == entry.id }) {
                    appState.planEntries.append(entry)
                }
            }
        case .update(let action):
            if let entry: PlanEntry = decodeRealtimeRecord({ try action.decodeRecord(decoder: JSONDecoder.supabase) }, table: "plan_entries") {
                // US-255: resolve a display name from the linked recipe or
                // food; plan entries don't have a self-describing field.
                let title = resolvePlanEntryTitle(entry, appState: appState)
                await detectAndAnnounceConflict(
                    table: .planEntries,
                    rowId: entry.id,
                    displayName: title
                )
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

    /// US-255: if a remote UPDATE on `(table, rowId)` lands inside the
    /// 5s conflict window of a local edit on that same row, surface a
    /// one-time "kept your version" toast and fire telemetry. Best-effort
    /// — failures are swallowed so the row still updates cleanly.
    private func detectAndAnnounceConflict(
        table: ConflictDetector.Table,
        rowId: String,
        displayName: String
    ) async {
        // The realtime UPDATE we just received could be our own write's
        // echo. consumeEcho returns true (and decrements the counter)
        // when there's a pending echo within the 2s echo window — in
        // that case we skip the conflict check entirely. A real
        // household-mate write arrives without a pending echo OR after
        // the echo window has passed; both bypass this guard.
        let isOwnEcho = await ConflictDetector.shared.consumeEcho(table, rowId: rowId)
        if isOwnEcho { return }

        let (recent, ageMs) = await ConflictDetector.shared.wasRecentLocalEdit(
            table,
            rowId: rowId
        )
        guard recent else { return }
        let shouldFire = await ConflictDetector.shared.shouldFireToast(table, rowId: rowId)
        guard shouldFire else { return }

        let kindNoun: String
        switch table {
        case .groceryItems: kindNoun = displayName
        case .planEntries:  kindNoun = displayName
        }
        // Honest message: we don't have a `last_modified_by_user_id`
        // column today (follow-up migration), so we can't safely name
        // the conflicting member. "Your household" gives the parent the
        // actionable signal without misattributing the edit.
        ToastManager.shared.info(
            "Kept your version",
            message: "Your household also edited \(kindNoun) just now."
        )
        AnalyticsService.track(.householdConflictResolved(
            table: table.rawValue,
            conflictAgeMs: ageMs ?? 0
        ))
    }

    /// US-255: try to surface something human-readable for the toast.
    /// Resolves a plan entry to its recipe name, falling back to food
    /// name, then a generic label.
    private func resolvePlanEntryTitle(_ entry: PlanEntry, appState: AppState) -> String {
        if let rid = entry.recipeId,
           let recipe = appState.recipes.first(where: { $0.id == rid }) {
            return recipe.name
        }
        if let food = appState.foods.first(where: { $0.id == entry.foodId }) {
            return food.name
        }
        return "a planned meal"
    }

    private func handleRecipesChange(_ change: AnyAction, appState: AppState) async {
        switch change {
        case .insert(let action):
            if let recipe: Recipe = decodeRealtimeRecord({ try action.decodeRecord(decoder: JSONDecoder.supabase) }, table: "recipes") {
                if !appState.recipes.contains(where: { $0.id == recipe.id }) {
                    appState.recipes.append(recipe)
                }
            }
        case .update(let action):
            if let recipe: Recipe = decodeRealtimeRecord({ try action.decodeRecord(decoder: JSONDecoder.supabase) }, table: "recipes") {
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

// MARK: - JSON Decoder for Supabase realtime payloads

extension JSONDecoder {
    /// US-381: domain structs declare EXPLICIT snake_case CodingKeys (e.g.
    /// Food.userId = "user_id", Food.isSafe = "is_safe"). Setting
    /// `.convertFromSnakeCase` here would convert the incoming key
    /// (`is_safe` -> `isSafe`) BEFORE matching against the CodingKey raw
    /// value (`is_safe`), so the match fails and every multi-word
    /// non-optional field throws — silently breaking realtime decode.
    /// Keep the default key strategy so the explicit CodingKeys apply, the
    /// same contract OfflineStore.swift relies on. Dates are stored as
    /// ISO strings on the models, so no date strategy is required.
    static let supabase: JSONDecoder = {
        let decoder = JSONDecoder()
        return decoder
    }()
}
