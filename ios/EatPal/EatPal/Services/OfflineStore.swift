import Foundation
import SwiftData

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
final class OfflineStore {
    static let shared = OfflineStore()

    let container: ModelContainer
    let context: ModelContext

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
    }

    func clearAllPendingMutations() {
        let mutations = getPendingMutations()
        for mutation in mutations {
            context.delete(mutation)
        }
        try? context.save()
    }

    // MARK: - Sync

    /// Replays pending mutations against Supabase when coming back online.
    func syncPendingMutations() async {
        let mutations = getPendingMutations()
        guard !mutations.isEmpty else { return }

        let client = SupabaseManager.client

        for mutation in mutations {
            do {
                switch mutation.operation {
                case "delete":
                    try await client.from(mutation.table)
                        .delete()
                        .eq("id", value: mutation.entityId)
                        .execute()

                default:
                    break // insert/update handled by optimistic updates in AppState
                }

                clearPendingMutation(mutation)
            } catch {
                print("Failed to sync mutation \(mutation.id): \(error)")
                break // Stop on first failure to maintain order
            }
        }
    }
}
