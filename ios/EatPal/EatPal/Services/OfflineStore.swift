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

    init(from food: Food) {
        self.id = food.id
        self.name = food.name
        self.category = food.category
        self.isSafe = food.isSafe
        self.isTryBite = food.isTryBite
        self.allergens = food.allergens
        self.barcode = food.barcode
        self.lastSyncedAt = Date()
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

    init(from kid: Kid) {
        self.id = kid.id
        self.name = kid.name
        self.age = kid.age
        self.pickinessLevel = kid.pickinessLevel
        self.lastSyncedAt = Date()
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

    init(from item: GroceryItem) {
        self.id = item.id
        self.name = item.name
        self.category = item.category
        self.quantity = item.quantity
        self.unit = item.unit
        self.checked = item.checked
        self.lastSyncedAt = Date()
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

    init(table: String, operation: String, entityId: String, payload: Data? = nil) {
        self.id = UUID().uuidString
        self.table = table
        self.operation = operation
        self.entityId = entityId
        self.payload = payload
        self.createdAt = Date()
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
            fatalError("Failed to initialize SwiftData: \(error)")
        }

        refreshPendingCount()
    }

    // MARK: - Cache Foods

    func cacheFoods(_ foods: [Food]) {
        for food in foods {
            let cached = CachedFood(from: food)
            context.insert(cached)
        }
        try? context.save()
    }

    func loadCachedFoods(userId: String) -> [Food] {
        let descriptor = FetchDescriptor<CachedFood>(
            sortBy: [SortDescriptor(\.name)]
        )
        let cached = (try? context.fetch(descriptor)) ?? []
        return cached.map { $0.toFood(userId: userId) }
    }

    // MARK: - Cache Kids

    func cacheKids(_ kids: [Kid]) {
        for kid in kids {
            let cached = CachedKid(from: kid)
            context.insert(cached)
        }
        try? context.save()
    }

    // MARK: - Cache Grocery Items

    func cacheGroceryItems(_ items: [GroceryItem]) {
        for item in items {
            let cached = CachedGroceryItem(from: item)
            context.insert(cached)
        }
        try? context.save()
    }

    // MARK: - Pending Mutations

    func addPendingMutation(table: String, operation: String, entityId: String, payload: Data? = nil) {
        let mutation = PendingMutation(
            table: table,
            operation: operation,
            entityId: entityId,
            payload: payload
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
    func enqueueInsert<T: Encodable>(_ payload: T, table: Table, entityId: String) {
        let data = try? JSONEncoder.supabaseSnakeCase.encode(payload)
        addPendingMutation(
            table: table.rawValue,
            operation: Operation.insert.rawValue,
            entityId: entityId,
            payload: data
        )
    }

    /// Queue an update with an encodable update struct.
    func enqueueUpdate<T: Encodable>(_ payload: T, table: Table, entityId: String) {
        let data = try? JSONEncoder.supabaseSnakeCase.encode(payload)
        addPendingMutation(
            table: table.rawValue,
            operation: Operation.update.rawValue,
            entityId: entityId,
            payload: data
        )
    }

    /// Queue a delete for a specific row id.
    func enqueueDelete(table: Table, entityId: String) {
        addPendingMutation(
            table: table.rawValue,
            operation: Operation.delete.rawValue,
            entityId: entityId,
            payload: nil
        )
    }

    // MARK: - Sync

    /// Replays pending mutations against Supabase when coming back online.
    /// Per-table dispatch decodes the stored payload and posts the right typed
    /// insert / update to the right endpoint. Stops on first failure to
    /// preserve queue ordering — the next sync pass retries from that point.
    func syncPendingMutations() async {
        guard !isSyncing else { return }
        let mutations = getPendingMutations()
        guard !mutations.isEmpty else {
            lastSyncError = nil
            return
        }

        isSyncing = true
        lastSyncError = nil
        defer { isSyncing = false }

        for mutation in mutations {
            do {
                try await replay(mutation)
                clearPendingMutation(mutation)
            } catch {
                lastSyncError = error.localizedDescription
                SentryService.capture(error, extras: [
                    "queue": "OfflineStore",
                    "table": mutation.table,
                    "operation": mutation.operation,
                    "id": mutation.entityId
                ])
                break // preserve ordering; retry on next reconnection
            }
        }

        refreshPendingCount()
    }

    // MARK: - Private helpers

    private func refreshPendingCount() {
        pendingMutationCount = getPendingMutations().count
    }

    private func replay(_ mutation: PendingMutation) async throws {
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

            switch table {
            case Table.groceryItems.rawValue:
                let item = try decoder.decode(GroceryItem.self, from: data)
                try await client.from(table).insert(item).execute()
            case Table.foods.rawValue:
                let food = try decoder.decode(Food.self, from: data)
                try await client.from(table).insert(food).execute()
            case Table.planEntries.rawValue:
                let entry = try decoder.decode(PlanEntry.self, from: data)
                try await client.from(table).insert(entry).execute()
            case Table.kids.rawValue:
                let kid = try decoder.decode(Kid.self, from: data)
                try await client.from(table).insert(kid).execute()
            case Table.recipes.rawValue:
                let recipe = try decoder.decode(Recipe.self, from: data)
                try await client.from(table).insert(recipe).execute()
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
