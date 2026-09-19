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
        /// US-609: an exposure log, which is not a plain insert.
        ///
        /// Replaying one means reading the CURRENT ladder row and re-deriving
        /// the next rung from it, then writing two rows. A generic insert
        /// would replay the rung computed hours ago on a phone with no signal
        /// and stamp it over whatever the other parent's phone has since done.
        /// See `LadderSyncOps`.
        case ladderAttempt = "ladder_attempt"
    }

    /// A queued mutation this build cannot replay.
    ///
    /// `replay` used to `return` or `break` out of its switches for anything it
    /// did not recognise, and the caller reads a non-throwing return as
    /// "landed on the server" and clears the row. So an unhandled case was
    /// silently indistinguishable from success: the user's offline edit
    /// disappeared with no error, no toast and nothing in Sentry. The update
    /// switch was missing `kids` and `recipes`, and a payload that failed to
    /// encode at enqueue time was stored as nil and then dropped on the same
    /// path.
    ///
    /// Throwing instead routes these into the existing failure handling, which
    /// reports them. Neither case can succeed on a retry, so `isPermanent`
    /// tells the drain to quarantine immediately rather than burn five passes.
    enum ReplayError: Error, LocalizedError {
        case missingPayload(table: String, operation: String)
        case unsupported(table: String, operation: String)

        var isPermanent: Bool { true }

        var errorDescription: String? {
            switch self {
            case .missingPayload(let table, let operation):
                return "Queued \(operation) on \(table) has no payload to replay."
            case .unsupported(let table, let operation):
                return "No replay path for \(operation) on \(table)."
            }
        }
    }

    enum Table: String, CaseIterable {
        case foods
        case kids
        case recipes
        case planEntries = "plan_entries"
        case groceryItems = "grocery_items"
        /// US-809: keyed by the auth user id, because on `profiles` the primary
        /// key IS `auth.users.id`. Update-only -- the row is created by the
        /// `handle_new_user` trigger at signup, so a client never inserts one.
        case profiles
        /// US-609. Ownership derives through a `household_members` join, so a
        /// queued op carrying `kid_id` is sufficient and the queue does not
        /// need to remember who was signed in.
        case kidFoodLadder = "kid_food_ladder"
        /// US-609. Written only by the `ladderAttempt` operation -- a plain
        /// insert here would skip the re-derivation the conflict rule needs,
        /// so `replay`'s insert arm deliberately does not route it.
        case foodAttempts = "food_attempts"
        /// US-871. Insert-only: an earn is append-only, and the table has no
        /// UPDATE policy, so a queued update would be refused by RLS rather
        /// than doing anything.
        case kidBadges = "kid_badges"
    }

    /// The decoded payload of an update replay, and the table it belongs to.
    ///
    /// US-809: extracted from the switch inside `replay` so the table-to-type
    /// routing can be tested. `replay` needs a live Supabase client and is
    /// private; this is the part that decides whether a queued write is
    /// understood at all, which is the part that was silently dropping
    /// mutations.
    enum DecodedUpdate {
        case groceryItem(GroceryItemUpdate)
        case food(FoodUpdate)
        case planEntry(PlanEntryUpdate)
        case kid(KidUpdate)
        case recipe(RecipeUpdate)
        case profile(ProfileUpdate)
        /// US-609: a direct parent edit, carried as the absolute state rather
        /// than as a `KidFoodLadderUpdate`. That type is Encodable-only by
        /// design (its double-optionals mean nothing on the way back in), and
        /// the state round-trips losslessly into one via
        /// `ExposureLadderPolicy.update(from:)` at replay.
        case ladder(LadderState)
    }

    /// Decode a queued update payload, or throw `ReplayError.unsupported`.
    ///
    /// Throwing rather than returning nil on an unknown table is the point of
    /// US-809 AC3: the caller treats a non-throwing return as "landed on the
    /// server" and clears the row, so anything that quietly succeeds here is a
    /// user's edit deleted with no error and nothing in Sentry.
    static func decodeUpdate(
        table: String,
        data: Data,
        decoder: JSONDecoder
    ) throws -> DecodedUpdate {
        switch table {
        case Table.groceryItems.rawValue:
            return .groceryItem(try decoder.decode(GroceryItemUpdate.self, from: data))
        case Table.foods.rawValue:
            return .food(try decoder.decode(FoodUpdate.self, from: data))
        case Table.planEntries.rawValue:
            return .planEntry(try decoder.decode(PlanEntryUpdate.self, from: data))
        case Table.kids.rawValue:
            return .kid(try decoder.decode(KidUpdate.self, from: data))
        case Table.recipes.rawValue:
            return .recipe(try decoder.decode(RecipeUpdate.self, from: data))
        case Table.profiles.rawValue:
            return .profile(try decoder.decode(ProfileUpdate.self, from: data))
        case Table.kidFoodLadder.rawValue:
            return .ladder(try decoder.decode(LadderState.self, from: data))
        default:
            throw ReplayError.unsupported(table: table, operation: Operation.update.rawValue)
        }
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
        guard let data = encodeOrReport(payload, table: table, operation: .insert) else { return }
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
        guard let data = encodeOrReport(payload, table: table, operation: .update) else { return }
        addPendingMutation(
            table: table.rawValue,
            operation: Operation.update.rawValue,
            entityId: entityId,
            payload: data,
            userId: userId
        )
    }

    /// Encode a queued payload, reporting rather than swallowing a failure.
    ///
    /// This used to be `try?`, which stored nil and left the drain to discard
    /// the mutation as if it had synced. Refusing to queue something we cannot
    /// replay is no better for the user's data, but it is at least honest and
    /// it shows up in Sentry instead of nowhere.
    private func encodeOrReport<T: Encodable>(
        _ payload: T,
        table: Table,
        operation: Operation
    ) -> Data? {
        do {
            return try JSONEncoder.supabaseSnakeCase.encode(payload)
        } catch {
            SentryService.capture(error, extras: [
                "queue": "OfflineStore",
                "context": "enqueue_encode_failed",
                "table": table.rawValue,
                "operation": operation.rawValue
            ])
            return nil
        }
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

    /// US-609: queue one exposure log.
    ///
    /// Keyed by the op's client-generated `attemptId`, which is also what the
    /// replay checks the server for. Deliberately not `enqueueInsert`: the
    /// payload is the parent's INTENT, and replaying it means re-deriving the
    /// rung from the server rather than posting the row as given.
    func enqueueLadderAttempt(_ op: LadderAttemptOp, userId: String) {
        guard let data = encodeOrReport(op, table: .foodAttempts, operation: .ladderAttempt) else {
            return
        }
        addPendingMutation(
            table: Table.foodAttempts.rawValue,
            operation: Operation.ladderAttempt.rawValue,
            entityId: op.attemptId,
            payload: data,
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

                // A mutation this build has no replay path for will fail the
                // same way on every pass. Quarantine it now rather than
                // blocking its entity for five reconnections first.
                let permanent = (error as? ReplayError)?.isPermanent ?? false
                if permanent || mutation.attemptCount >= Self.maxReplayAttempts {
                    SentryService.capture(error, extras: [
                        "queue": "OfflineStore",
                        "table": mutation.table,
                        "operation": mutation.operation,
                        "id": mutation.entityId,
                        "quarantined": true,
                        "permanent": permanent,
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
            guard let data = mutation.payload else {
                throw ReplayError.missingPayload(table: table, operation: mutation.operation)
            }

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
            case Table.kidBadges.rawValue:
                // US-871. No user stamping: like the ladder, ownership derives
                // through kid_id. Deduped on (kid_id, badge_id) because that
                // is what "earned once" means -- both parents' phones evaluate
                // the same earn from the same logged meal.
                let badge = try decoder.decode(KidBadgeInsert.self, from: data)
                try await client.from(table).upsert(badge, onConflict: "kid_id,badge_id").execute()
            case Table.kidFoodLadder.rawValue:
                // US-609. No user stamping: the table has no user_id or
                // household_id and derives ownership through kid_id. The
                // dedupe key is the (kid_id, food_id) unique index rather than
                // the primary key, so a replay of a row another device already
                // created refreshes it instead of stalling the queue on a
                // constraint the id-based upsert would never see.
                let row = try decoder.decode(KidFoodLadderInsert.self, from: data)
                try await client.from(table).upsert(row, onConflict: "kid_id,food_id").execute()
            default:
                throw ReplayError.unsupported(table: table, operation: mutation.operation)
            }

        case Operation.update.rawValue:
            guard let data = mutation.payload else {
                throw ReplayError.missingPayload(table: table, operation: mutation.operation)
            }

            // Routing lives in `decodeUpdate` so it can be tested without a
            // client; this switch only picks which concrete type to hand to
            // PostgREST, which needs the static type at the call site.
            switch try Self.decodeUpdate(table: table, data: data, decoder: decoder) {
            case .groceryItem(let update):
                try await client.from(table).update(update).eq("id", value: mutation.entityId).execute()
            case .food(let update):
                try await client.from(table).update(update).eq("id", value: mutation.entityId).execute()
            case .planEntry(let update):
                try await client.from(table).update(update).eq("id", value: mutation.entityId).execute()
            case .kid(let update):
                try await client.from(table).update(update).eq("id", value: mutation.entityId).execute()
            case .recipe(let update):
                try await client.from(table).update(update).eq("id", value: mutation.entityId).execute()
            case .profile(let update):
                try await client.from(table).update(update).eq("id", value: mutation.entityId).execute()
            case .ladder(let state):
                let update = ExposureLadderPolicy.update(from: state)
                try await client.from(table).update(update).eq("id", value: mutation.entityId).execute()
            }

        case Operation.ladderAttempt.rawValue:
            try await replayLadderAttempt(mutation, decoder: decoder)

        default:
            throw ReplayError.unsupported(table: table, operation: mutation.operation)
        }
    }

    /// US-609: replay one exposure log.
    ///
    /// Three server reads' worth of care for one tap, because the alternative
    /// is a child's ladder moving twice for one dinner or being dragged back
    /// to a rung they have already passed. The rules themselves are in
    /// `LadderSyncOps.planAttemptReplay`, which is pure and tested; this is
    /// the part that needs a client.
    private func replayLadderAttempt(_ mutation: PendingMutation, decoder: JSONDecoder) async throws {
        guard let data = mutation.payload else {
            throw ReplayError.missingPayload(table: mutation.table, operation: mutation.operation)
        }
        let op = try decoder.decode(LadderAttemptOp.self, from: data)
        let client = SupabaseManager.client

        let alreadyLogged: [FoodAttemptIdRow] = try await client.from(Table.foodAttempts.rawValue)
            .select("id")
            .eq("id", value: op.attemptId)
            .limit(1)
            .execute()
            .value

        let ladderRows: [KidFoodLadder] = try await client.from(Table.kidFoodLadder.rawValue)
            .select()
            .eq("id", value: op.ladderRowId)
            .limit(1)
            .execute()
            .value

        let plan = LadderSyncOps.planAttemptReplay(
            op: op,
            serverState: ladderRows.first.map(LadderState.init(row:)),
            attemptExists: !alreadyLogged.isEmpty
        )

        switch plan {
        case .skipAlreadyApplied, .skipRowGone:
            // Returning without throwing clears the pending row, which is
            // right: there is nothing left to do for this op and retrying it
            // forever would head-of-line block everything behind it.
            return

        case .apply(let nextState):
            do {
                try await client.from(Table.foodAttempts.rawValue)
                    .insert(LadderSyncOps.attemptRow(from: op))
                    .execute()
            } catch {
                // Another device landed the same attempt between the check
                // above and this insert. It applied the same move, so stop
                // rather than applying it a second time. Retrying would spin
                // on a constraint that can never clear.
                guard LadderSyncOps.isUniqueViolation(error) else { throw error }
                return
            }

            try await client.from(Table.kidFoodLadder.rawValue)
                .update(ExposureLadderPolicy.update(from: nextState))
                .eq("id", value: op.ladderRowId)
                .execute()
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
