import Foundation
@preconcurrency import SwiftData
@preconcurrency import Supabase

/// Local offline cache using SwiftData.
/// Persists data locally so the app is usable without network.

// MARK: - SwiftData Models

@Model
final class CachedFood {
    @Attribute(.unique) var id: String
    var name: String
    var category: String
    var isSafe: Bool
    var isTryBite: Bool
    var allergens: [String]?
    var barcode: String?
    var lastSyncedAt: Date
    /// US-489: the id of the user whose session cached this row. Reads are
    /// filtered by it so a previous account's cache can never be shown to a
    /// different user who signs in on the same device. Defaulted so SwiftData
    /// lightweight migration adds it to pre-existing rows (which then read as
    /// "" — owned by no one — and are safely ignored).
    var cachedByUserId: String = ""

    init(from food: Food, cachedByUserId: String) {
        self.id = food.id
        self.name = food.name
        self.category = food.category
        self.isSafe = food.isSafe
        self.isTryBite = food.isTryBite
        self.allergens = food.allergens
        self.barcode = food.barcode
        self.lastSyncedAt = Date()
        self.cachedByUserId = cachedByUserId
    }

    func toFood(userId: String) -> Food {
        Food(
            id: id,
            userId: userId,
            name: name,
            category: category,
            isSafe: isSafe,
            isTryBite: isTryBite,
            allergens: allergens,
            barcode: barcode
        )
    }
}

@Model
final class CachedKid {
    @Attribute(.unique) var id: String
    var name: String
    var age: Int?
    var pickinessLevel: String?
    var lastSyncedAt: Date
    /// US-489: see `CachedFood.cachedByUserId`.
    var cachedByUserId: String = ""

    init(from kid: Kid, cachedByUserId: String) {
        self.id = kid.id
        self.name = kid.name
        self.age = kid.age
        self.pickinessLevel = kid.pickinessLevel
        self.lastSyncedAt = Date()
        self.cachedByUserId = cachedByUserId
    }

    func toKid(userId: String) -> Kid {
        Kid(
            id: id,
            userId: userId,
            name: name,
            age: age,
            pickinessLevel: pickinessLevel
        )
    }
}

@Model
final class CachedGroceryItem {
    @Attribute(.unique) var id: String
    var name: String
    var category: String
    var quantity: Double
    var unit: String
    var checked: Bool
    var lastSyncedAt: Date
    /// US-489: see `CachedFood.cachedByUserId`.
    var cachedByUserId: String = ""

    init(from item: GroceryItem, cachedByUserId: String) {
        self.id = item.id
        self.name = item.name
        self.category = item.category
        self.quantity = item.quantity
        self.unit = item.unit
        self.checked = item.checked
        self.lastSyncedAt = Date()
        self.cachedByUserId = cachedByUserId
    }

    func toGroceryItem(userId: String) -> GroceryItem {
        GroceryItem(
            id: id,
            userId: userId,
            name: name,
            category: category,
            quantity: quantity,
            unit: unit,
            checked: checked
        )
    }
}

/// Tracks mutations made while offline for later sync.
@Model
final class PendingMutation {
    @Attribute(.unique) var id: String
    var table: String
    var operation: String // "insert", "update", "delete"
    var entityId: String
    var payload: Data? // JSON-encoded update
    var createdAt: Date
    /// US-385: how many times this mutation has failed to replay. Used to
    /// quarantine a permanently-failing mutation so it can't head-of-line
    /// block the whole queue forever. Defaulted so SwiftData lightweight
    /// migration adds it to existing rows.
    var attemptCount: Int = 0
    /// US-489: the id of the user who enqueued this mutation. The sync pass
    /// only replays mutations belonging to the currently-authenticated user,
    /// so one account's queued offline writes can never be replayed under a
    /// different account's session. Defaulted for lightweight migration; a
    /// legacy "" row is adopted by whoever is signed in at sync time (the
    /// offline queue is effectively single-user per device).
    var userId: String = ""

    init(table: String, operation: String, entityId: String, payload: Data? = nil, userId: String = "") {
        self.id = UUID().uuidString
        self.table = table
        self.operation = operation
        self.entityId = entityId
        self.payload = payload
        self.createdAt = Date()
        self.attemptCount = 0
        self.userId = userId
    }
}

// MARK: - Offline Store

@MainActor
final class OfflineStore: ObservableObject {
    static let shared = OfflineStore()

    let container: ModelContainer
    let context: ModelContext

    /// Reflects the current pending-mutation queue size so UI can surface it
    /// (offline banner, Settings diagnostics). Updated after every enqueue
    /// and after each successful or failed sync.
    @Published private(set) var pendingMutationCount: Int = 0

    /// Set to true while a sync pass is in flight. Prevents concurrent syncs
    /// racing against the same queue.
    @Published private(set) var isSyncing: Bool = false

    /// Last sync error, if any. Reset on successful sync.
    @Published private(set) var lastSyncError: String?

    enum Operation: String {
        case insert
        case update
        case delete
    }

    enum Table: String {
        case foods
        case kids
        case recipes
        case planEntries = "plan_entries"
        case groceryItems = "grocery_items"
    }

    private init() {
        let schema = Schema([
            CachedFood.self,
            CachedKid.self,
            CachedGroceryItem.self,
            PendingMutation.self,
        ])

        let config = ModelConfiguration(
            "EatPalOffline",
            schema: schema,
            isStoredInMemoryOnly: false
        )

        do {
            container = try ModelContainer(for: schema, configurations: [config])
            context = ModelContext(container)
        } catch {
            // If the on-disk store is corrupted or migration fails, fall back
            // to an in-memory container so the app stays alive. Offline queue
            // state won't persist across launches in this degraded mode, but
            // it beats crashing on launch for the user.
            SentryService.capture(error, extras: [
                "context": "offline_store_init_fallback"
            ])
            let memoryConfig = ModelConfiguration(
                "EatPalOfflineMemory",
                schema: schema,
                isStoredInMemoryOnly: true
            )
            do {
                container = try ModelContainer(for: schema, configurations: [memoryConfig])
                context = ModelContext(container)
            } catch {
                fatalError("Failed to initialize SwiftData fallback: \(error)")
            }
        }

        refreshPendingCount()
    }

    // MARK: - Cache Foods

    /// US-383: replace the cached snapshot wholesale (delete-all-then-insert)
    /// so updated rows refresh, server-side deletions are pruned, and a
    /// re-cache of an existing id can't 409 on the `.unique` constraint or
    /// leak unbounded duplicate rows.
    func cacheFoods(_ foods: [Food], ownerUserId: String) {
        try? context.delete(model: CachedFood.self)
        for food in foods {
            context.insert(CachedFood(from: food, cachedByUserId: ownerUserId))
        }
        try? context.save()
    }

    func loadCachedFoods(userId: String) -> [Food] {
        // US-489: never serve a cache written by a different account. An empty
        // userId (no session) matches nothing, so it returns [] rather than
        // leaking a stale account's rows.
        guard !userId.isEmpty else { return [] }
        let descriptor = FetchDescriptor<CachedFood>(
            predicate: #Predicate { $0.cachedByUserId == userId },
            sortBy: [SortDescriptor(\.name)]
        )
        let cached = (try? context.fetch(descriptor)) ?? []
        return cached.map { $0.toFood(userId: userId) }
    }

    // MARK: - Cache Kids

    func cacheKids(_ kids: [Kid], ownerUserId: String) {
        try? context.delete(model: CachedKid.self)
        for kid in kids {
            context.insert(CachedKid(from: kid, cachedByUserId: ownerUserId))
        }
        try? context.save()
    }

    func loadCachedKids(userId: String) -> [Kid] {
        guard !userId.isEmpty else { return [] }
        let descriptor = FetchDescriptor<CachedKid>(
            predicate: #Predicate { $0.cachedByUserId == userId },
            sortBy: [SortDescriptor(\.name)]
        )
        let cached = (try? context.fetch(descriptor)) ?? []
        return cached.map { $0.toKid(userId: userId) }
    }

    // MARK: - Cache Grocery Items

    func cacheGroceryItems(_ items: [GroceryItem], ownerUserId: String) {
        try? context.delete(model: CachedGroceryItem.self)
        for item in items {
            context.insert(CachedGroceryItem(from: item, cachedByUserId: ownerUserId))
        }
        try? context.save()
    }

    func loadCachedGroceryItems(userId: String) -> [GroceryItem] {
        guard !userId.isEmpty else { return [] }
        let descriptor = FetchDescriptor<CachedGroceryItem>(
            predicate: #Predicate { $0.cachedByUserId == userId },
            sortBy: [SortDescriptor(\.name)]
        )
        let cached = (try? context.fetch(descriptor)) ?? []
        return cached.map { $0.toGroceryItem(userId: userId) }
    }

    /// US-489: drop all display caches (foods/kids/grocery) without touching
    /// the pending-mutation queue. Called on sign-out so an account's cached
    /// rows don't linger on disk; the queue is user-scoped and kept so a
    /// departing user's un-synced writes still replay when they return.
    func clearCachedData() {
        try? context.delete(model: CachedFood.self)
        try? context.delete(model: CachedKid.self)
        try? context.delete(model: CachedGroceryItem.self)
        try? context.save()
    }

    // MARK: - Pending Mutations

    func addPendingMutation(table: String, operation: String, entityId: String, payload: Data? = nil, userId: String) {
        let mutation = PendingMutation(
            table: table,
            operation: operation,
            entityId: entityId,
            payload: payload,
            userId: userId
        )
        context.insert(mutation)
        try? context.save()
        refreshPendingCount()
    }

    func getPendingMutations() -> [PendingMutation] {
        let descriptor = FetchDescriptor<PendingMutation>(
            sortBy: [SortDescriptor(\.createdAt)]
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    func clearPendingMutation(_ mutation: PendingMutation) {
        context.delete(mutation)
        try? context.save()
        refreshPendingCount()
    }

    func clearAllPendingMutations() {
        let mutations = getPendingMutations()
        for mutation in mutations {
            context.delete(mutation)
        }
        try? context.save()
        refreshPendingCount()
    }

    // MARK: - Typed enqueue helpers (US-150)

    /// Queue an insert with an encodable payload. The payload is JSON-encoded
    /// and decoded back during sync.
    func enqueueInsert<T: Encodable>(_ payload: T, table: Table, entityId: String, userId: String) {
        let data = try? JSONEncoder.supabaseSnakeCase.encode(payload)
        addPendingMutation(
            table: table.rawValue,
            operation: Operation.insert.rawValue,
            entityId: entityId,
            payload: data,
            userId: userId
        )
    }

    /// Queue an update with an encodable update struct.
    func enqueueUpdate<T: Encodable>(_ payload: T, table: Table, entityId: String, userId: String) {
        let data = try? JSONEncoder.supabaseSnakeCase.encode(payload)
        addPendingMutation(
            table: table.rawValue,
            operation: Operation.update.rawValue,
            entityId: entityId,
            payload: data,
            userId: userId
        )
    }

    /// Queue a delete for a specific row id.
    func enqueueDelete(table: Table, entityId: String, userId: String) {
        addPendingMutation(
            table: table.rawValue,
            operation: Operation.delete.rawValue,
            entityId: entityId,
            payload: nil,
            userId: userId
        )
    }

    // MARK: - Sync

    /// Replays pending mutations against Supabase when coming back online.
    /// Per-table dispatch decodes the stored payload and posts the right typed
    /// insert / update to the right endpoint. Stops on first failure to
    /// preserve queue ordering — the next sync pass retries from that point.
    func syncPendingMutations() async {
        guard !isSyncing else { return }

        // US-494: bail out when offline instead of burning replay attempts.
        // This makes the pass safe to call unconditionally on launch and on
        // foreground (US-494 M2), not just on a network-restore transition.
        guard NetworkMonitor.shared.isConnected else { return }

        // US-489: resolve the authenticated user and only replay mutations
        // that belong to them. Without a session there is no one to attribute
        // writes to, so we replay nothing (and never route one account's
        // queued writes through another account's session).
        let uid = (try? await SupabaseManager.client.auth.session)?
            .user.id.uuidString.lowercased() ?? ""
        guard !uid.isEmpty else { return }

        // A legacy mutation predating US-489 has userId == "" — adopt it for
        // the current user (the offline queue is single-user per device) so
        // items the old build would have lost are recovered rather than
        // stranded forever.
        let mutations = getPendingMutations().filter { $0.userId == uid || $0.userId.isEmpty }
        guard !mutations.isEmpty else {
            lastSyncError = nil
            return
        }

        isSyncing = true
        lastSyncError = nil
        defer { isSyncing = false }

        // US-494 (M3): a failing mutation only blocks *its own entity's* later
        // ops (an insert must land before its update/delete for the same id),
        // not the entire queue. Unrelated rows keep draining in the same pass
        // instead of head-of-line blocking behind one transient failure and
        // waiting for the next reconnection.
        var blockedEntityIds: Set<String> = []

        for mutation in mutations {
            // Preserve per-entity ordering: skip this op if an earlier op for
            // the same id failed this pass (it'll retry next pass, in order).
            if blockedEntityIds.contains(mutation.entityId) { continue }

            do {
                try await replay(mutation, userId: uid)
                clearPendingMutation(mutation)
            } catch {
                // US-385: count the failure. A mutation that keeps failing is
                // quarantined (dropped + reported) so it can't permanently
                // block its entity's later ops.
                mutation.attemptCount += 1
                try? context.save()

                lastSyncError = error.localizedDescription
                if mutation.attemptCount >= Self.maxReplayAttempts {
                    SentryService.capture(error, extras: [
                        "queue": "OfflineStore",
                        "table": mutation.table,
                        "operation": mutation.operation,
                        "id": mutation.entityId,
                        "quarantined": true,
                        "attempts": mutation.attemptCount
                    ])
                    clearPendingMutation(mutation)
                    // Dropped — later ops for this entity are no longer
                    // blocked and may proceed.
                    continue
                }

                SentryService.capture(error, extras: [
                    "queue": "OfflineStore",
                    "table": mutation.table,
                    "operation": mutation.operation,
                    "id": mutation.entityId,
                    "attempts": mutation.attemptCount
                ])
                // Block only this entity's later ops; keep draining the rest.
                blockedEntityIds.insert(mutation.entityId)
            }
        }

        refreshPendingCount()
    }

    /// US-385: after this many failed replays a mutation is quarantined so it
    /// stops blocking the rest of the queue.
    private static let maxReplayAttempts = 5

    // MARK: - Private helpers

    private func refreshPendingCount() {
        pendingMutationCount = getPendingMutations().count
    }

    private func replay(_ mutation: PendingMutation, userId: String) async throws {
        let client = SupabaseManager.client
        let table = mutation.table
        let decoder = JSONDecoder.supabaseSnakeCase

        switch mutation.operation {
        case Operation.delete.rawValue:
            try await client.from(table)
                .delete()
                .eq("id", value: mutation.entityId)
                .execute()

        case Operation.insert.rawValue:
            guard let data = mutation.payload else { return }

            // US-385: replay inserts as upsert-on-id so a row that already
            // landed (e.g. the request succeeded server-side but the response
            // was lost) refreshes instead of 409-ing and stalling the queue.
            //
            // US-489: rows are built optimistically with userId == "" (the
            // real id is only known once a session resolves). Stamp the
            // authenticated user here before upserting, otherwise Postgres
            // rejects `user_id: ""` as an invalid uuid and every offline-
            // created row is quarantined and lost.
            switch table {
            case Table.groceryItems.rawValue:
                var item = try decoder.decode(GroceryItem.self, from: data)
                item.userId = userId
                try await client.from(table).upsert(item, onConflict: "id").execute()
            case Table.foods.rawValue:
                var food = try decoder.decode(Food.self, from: data)
                food.userId = userId
                try await client.from(table).upsert(food, onConflict: "id").execute()
            case Table.planEntries.rawValue:
                var entry = try decoder.decode(PlanEntry.self, from: data)
                entry.userId = userId
                try await client.from(table).upsert(entry, onConflict: "id").execute()
            case Table.kids.rawValue:
                var kid = try decoder.decode(Kid.self, from: data)
                kid.userId = userId
                try await client.from(table).upsert(kid, onConflict: "id").execute()
            case Table.recipes.rawValue:
                var recipe = try decoder.decode(Recipe.self, from: data)
                recipe.userId = userId
                try await client.from(table).upsert(recipe, onConflict: "id").execute()
            default:
                break
            }

        case Operation.update.rawValue:
            guard let data = mutation.payload else { return }

            switch table {
            case Table.groceryItems.rawValue:
                let update = try decoder.decode(GroceryItemUpdate.self, from: data)
                try await client.from(table).update(update).eq("id", value: mutation.entityId).execute()
            case Table.foods.rawValue:
                let update = try decoder.decode(FoodUpdate.self, from: data)
                try await client.from(table).update(update).eq("id", value: mutation.entityId).execute()
            case Table.planEntries.rawValue:
                let update = try decoder.decode(PlanEntryUpdate.self, from: data)
                try await client.from(table).update(update).eq("id", value: mutation.entityId).execute()
            default:
                break
            }

        default:
            break
        }
    }
}

// MARK: - JSONCoder helpers shared with Supabase (matches the library's default encoding)

private extension JSONEncoder {
    static var supabaseSnakeCase: JSONEncoder {
        let encoder = JSONEncoder()
        // Domain structs already declare their snake_case CodingKeys, so keep
        // the default key strategy to avoid double-conversion.
        return encoder
    }
}

private extension JSONDecoder {
    static var supabaseSnakeCase: JSONDecoder {
        let decoder = JSONDecoder()
        return decoder
    }
}
