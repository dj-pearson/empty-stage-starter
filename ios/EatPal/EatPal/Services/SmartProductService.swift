import Foundation
@preconcurrency import Supabase

/// US-272: The brain behind the grocery quick-add flow.
///
/// Three things this service does:
///
///  1. **Resolve**: given a barcode and/or a name, return the best
///     pre-fill we can find by walking user → catalog → barcode →
///     classifier in order. The first hit wins.
///
///  2. **Learn from add**: every time the user successfully adds a
///     grocery item, upsert their `user_product_preferences` row so
///     the next add auto-fills with the same values. Also seed the
///     centralized catalog if the product isn't there yet.
///
///  3. **Learn from edit**: when the user edits an item's aisle, brand,
///     unit, etc., that's a strong signal — propagate it back to the
///     preference row so future adds reflect the change.
///
/// Errors are intentionally swallowed for the learn-on-add/edit paths:
/// a failed preference upsert should never block the actual grocery
/// item save. The resolve path returns the strongest fallback (.keyword)
/// even on network failure so the UI is never blocked.
@MainActor
final class SmartProductService {
    static let shared = SmartProductService()

    private let client = SupabaseManager.client

    /// US-274: UserDefaults key for the household preference-sharing
    /// toggle. Off by default so existing users see no behavior change.
    static let householdShareEnabledKey = "smartProduct.householdShareEnabled"

    /// US-274: Cached household id for the signed-in user. Populated by
    /// `setHouseholdContext` after Settings reads it; read on every
    /// resolve/upsert so we don't pay an `ensure_user_household` round
    /// trip per call.
    private var cachedHouseholdId: String?

    private init() {}

    // MARK: - US-274 household context

    /// Pushes the current household id into the service. Called once on
    /// app launch (and after household membership changes) so the
    /// resolver/upsert path can include the household tier without
    /// touching the network.
    func setHouseholdContext(householdId: String?) {
        cachedHouseholdId = householdId
    }

    /// Whether the user has opted into household-shared preferences.
    /// Read fresh on every resolve so flipping the toggle takes effect
    /// without restarting the app.
    private var householdShareEnabled: Bool {
        UserDefaults.standard.bool(forKey: Self.householdShareEnabledKey)
    }

    // MARK: - Resolve (tiered lookup)

    /// Walks the lookup tiers in order. With US-274 household sharing
    /// enabled the walk becomes:
    ///   household → user → catalog → barcode → keyword
    /// Without sharing it stays:
    ///   user → catalog → barcode → keyword
    /// Always returns a value — the keyword classifier is the floor.
    ///
    /// - Parameters:
    ///   - name: Free-text item name. Required for keyword fallback;
    ///     optional otherwise.
    ///   - barcode: Optional scanned barcode; checked before name when
    ///     present.
    func resolve(name: String?, barcode: String? = nil) async -> ResolvedProduct {
        let trimmedName = name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let normalized = ProductNameNormalizer.normalize(trimmedName)
        let userId = (try? await currentUserId()) ?? ""
        let householdId: String? = householdShareEnabled ? cachedHouseholdId : nil

        // Tier 0 — household-shared preference (US-274).
        if let householdId, !householdId.isEmpty {
            if let barcode, !barcode.isEmpty,
               let pref = try? await fetchHouseholdPreference(householdId: householdId, barcode: barcode) {
                return apply(preference: pref, fallbackName: trimmedName)
            }
            if !normalized.isEmpty,
               let pref = try? await fetchHouseholdPreference(householdId: householdId, nameNormalized: normalized) {
                return apply(preference: pref, fallbackName: trimmedName)
            }
        }

        // Tier 1 — user preference.
        if !userId.isEmpty {
            if let barcode, !barcode.isEmpty,
               let pref = try? await fetchUserPreference(userId: userId, barcode: barcode) {
                return apply(preference: pref, fallbackName: trimmedName)
            }
            if !normalized.isEmpty,
               let pref = try? await fetchUserPreference(userId: userId, nameNormalized: normalized) {
                return apply(preference: pref, fallbackName: trimmedName)
            }
        }

        // Tier 2 — centralized catalog.
        if let barcode, !barcode.isEmpty,
           let entry = try? await fetchCatalogEntry(barcode: barcode) {
            return apply(catalog: entry, fallbackName: trimmedName)
        }
        if !normalized.isEmpty,
           let entry = try? await fetchCatalogEntry(nameNormalized: normalized) {
            return apply(catalog: entry, fallbackName: trimmedName)
        }

        // Tier 3 — Open Food Facts barcode lookup. Treat the result as a
        // first-time-anywhere hit so the next save will seed the catalog.
        if let barcode, !barcode.isEmpty {
            let lookup = try? await BarcodeService.lookup(barcode: barcode)
            if let result = lookup ?? nil {
                let aisle = GroceryAisle.classify(result.name)
                return ResolvedProduct(
                    name: result.name,
                    aisleSection: aisle == .other
                        ? GroceryAisle.fromLegacyCategory(result.category)
                        : aisle,
                    category: FoodCategory(rawValue: result.category) ?? .snack,
                    unit: "count",
                    quantity: 1,
                    brand: nil,
                    barcode: result.barcode,
                    notes: result.allergens.isEmpty
                        ? nil
                        : "Allergens: \(result.allergens.joined(separator: ", "))",
                    source: .barcodeFresh
                )
            }
        }

        // Tier 4 — keyword classifier. Always returns *something*.
        // US-279: when the classifier hits but the unit/quantity is the
        // generic "count, 1", upgrade via UnitInference so eggs default
        // to a dozen, milk to a gallon, rice to a bag, etc. The source
        // flips to .unitInference so the UI shows a soft-confirm chip.
        let aisle = GroceryAisle.classify(trimmedName)
        if let inference = UnitInference.infer(name: trimmedName) {
            return ResolvedProduct(
                name: trimmedName,
                aisleSection: aisle,
                category: aisle.derivedFoodCategory,
                unit: inference.unit,
                quantity: inference.quantity,
                brand: nil,
                barcode: barcode,
                notes: nil,
                source: .unitInference
            )
        }
        return ResolvedProduct(
            name: trimmedName,
            aisleSection: aisle,
            category: aisle.derivedFoodCategory,
            unit: "count",
            quantity: 1,
            brand: nil,
            barcode: barcode,
            notes: nil,
            source: .keywordFallback
        )
    }

    // MARK: - Learn (after add)

    /// Records that the user added an item with these final values.
    /// Upserts both the user preference (always) and the centralized
    /// catalog (when missing). Never throws — telemetry-grade learning
    /// must not block the parent save.
    func recordAdd(item: GroceryItem) async {
        let normalized = ProductNameNormalizer.normalize(item.name)
        guard !normalized.isEmpty else { return }
        guard let userId = try? await currentUserId() else { return }

        // Upsert the centralized catalog row first so we can capture
        // its id on the user preference (lets the preference UI later
        // show "based on community defaults" if the user hasn't tweaked
        // anything).
        let catalogId = await upsertCatalog(item: item, normalized: normalized)
        await upsertPreference(
            userId: userId,
            catalogId: catalogId,
            item: item,
            normalized: normalized
        )
    }

    /// Same as recordAdd, but used after an in-place edit. Treated as a
    /// strong signal: the user *changed* something, so we always
    /// overwrite the preference with the new values.
    func recordEdit(item: GroceryItem) async {
        await recordAdd(item: item)
    }

    // MARK: - DB queries

    private func fetchUserPreference(userId: String, barcode: String) async throws -> UserProductPreference? {
        let rows: [UserProductPreference] = try await client
            .from("user_product_preferences")
            .select()
            .eq("user_id", value: userId)
            .eq("barcode", value: barcode)
            .limit(1)
            .execute()
            .value
        return rows.first
    }

    private func fetchUserPreference(userId: String, nameNormalized: String) async throws -> UserProductPreference? {
        let rows: [UserProductPreference] = try await client
            .from("user_product_preferences")
            .select()
            .eq("user_id", value: userId)
            .eq("name_normalized", value: nameNormalized)
            .is("household_id", value: nil)
            .limit(1)
            .execute()
            .value
        return rows.first
    }

    /// US-276: Fetches every preference row for the signed-in user (and
    /// their household, if shared mode is on). Used by the
    /// RestockPredictor to compute cadence + due-soon suggestions.
    /// Returns an empty array on auth/network failure.
    func fetchAllPreferences() async -> [UserProductPreference] {
        do {
            let userId = try await currentUserId()
            // OR (user_id, household_id) — Supabase swift's filter chain
            // doesn't ship an `or` helper at the version we use, so two
            // queries + dedupe by id is the cheapest path.
            async let mine: [UserProductPreference] = (try? await client
                .from("user_product_preferences")
                .select()
                .eq("user_id", value: userId)
                .execute()
                .value) ?? []
            async let household: [UserProductPreference] = await {
                guard householdShareEnabled, let hid = cachedHouseholdId else { return [] }
                return (try? await client
                    .from("user_product_preferences")
                    .select()
                    .eq("household_id", value: hid)
                    .execute()
                    .value) ?? []
            }()
            let (a, b) = await (mine, household)
            // Dedupe by id; household rows are owned by some user_id so
            // they may show up in `mine` too.
            var byId: [String: UserProductPreference] = [:]
            for row in a + b { byId[row.id] = row }
            return Array(byId.values)
        } catch {
            return []
        }
    }

    /// US-274: Reads a household-shared preference row. The partial
    /// unique index `(household_id, name_normalized) WHERE household_id
    /// IS NOT NULL` guarantees at most one match.
    private func fetchHouseholdPreference(householdId: String, barcode: String) async throws -> UserProductPreference? {
        let rows: [UserProductPreference] = try await client
            .from("user_product_preferences")
            .select()
            .eq("household_id", value: householdId)
            .eq("barcode", value: barcode)
            .limit(1)
            .execute()
            .value
        return rows.first
    }

    private func fetchHouseholdPreference(householdId: String, nameNormalized: String) async throws -> UserProductPreference? {
        let rows: [UserProductPreference] = try await client
            .from("user_product_preferences")
            .select()
            .eq("household_id", value: householdId)
            .eq("name_normalized", value: nameNormalized)
            .limit(1)
            .execute()
            .value
        return rows.first
    }

    private func fetchCatalogEntry(barcode: String) async throws -> ProductCatalogEntry? {
        let rows: [ProductCatalogEntry] = try await client
            .from("grocery_product_catalog")
            .select()
            .eq("barcode", value: barcode)
            .limit(1)
            .execute()
            .value
        return rows.first
    }

    private func fetchCatalogEntry(nameNormalized: String) async throws -> ProductCatalogEntry? {
        let rows: [ProductCatalogEntry] = try await client
            .from("grocery_product_catalog")
            .select()
            .eq("name_normalized", value: nameNormalized)
            .limit(1)
            .execute()
            .value
        return rows.first
    }

    // MARK: - Upserts

    private struct CatalogUpsert: Encodable {
        let id: String
        let name: String
        let name_normalized: String
        let barcode: String?
        let default_aisle_section: String?
        let default_category: String?
        let default_unit: String?
        let default_quantity: Double?
        let brand: String?
        let times_added: Int
        let last_added_at: String
    }

    private struct PreferenceUpsert: Encodable {
        let id: String
        let user_id: String
        /// US-274: nil for user-only rows, a household uuid for shared rows.
        let household_id: String?
        let catalog_id: String?
        let name: String
        let name_normalized: String
        let barcode: String?
        let preferred_aisle_section: String?
        let preferred_category: String?
        let preferred_unit: String?
        let preferred_quantity: Double?
        let preferred_brand: String?
        let notes: String?
        let times_added: Int
        let last_added_at: String
        /// US-276: capped to 12 entries on the client before upsert.
        let add_history: [String]
    }

    /// US-276: cap on `add_history` length. Keeps the JSONB column tiny
    /// while still giving the cadence predictor enough datapoints to
    /// drop the worst outliers (we use the median of gaps).
    private static let addHistoryCap = 12

    /// Returns the catalog row id (existing or freshly created), or nil
    /// when the upsert hit a network/RLS error. Failures are swallowed —
    /// the catalog is best-effort.
    private func upsertCatalog(item: GroceryItem, normalized: String) async -> String? {
        do {
            // Fetch existing first so we can preserve fields other users
            // contributed (we never null-out values; we only fill blanks).
            let existing = try? await fetchCatalogEntry(nameNormalized: normalized)
            let row = CatalogUpsert(
                id: existing?.id ?? UUID().uuidString,
                name: existing?.name ?? item.name,
                name_normalized: normalized,
                barcode: item.barcode ?? existing?.barcode,
                default_aisle_section: existing?.defaultAisleSection ?? item.aisleSection,
                default_category: existing?.defaultCategory ?? item.category,
                default_unit: existing?.defaultUnit ?? item.unit,
                default_quantity: existing?.defaultQuantity ?? item.quantity,
                brand: existing?.brand ?? item.brandPreference,
                times_added: (existing?.timesAdded ?? 0) + 1,
                last_added_at: ISO8601DateFormatter().string(from: Date())
            )
            try await client
                .from("grocery_product_catalog")
                .upsert(row, onConflict: "name_normalized")
                .execute()
            return row.id
        } catch {
            return nil
        }
    }

    private func upsertPreference(
        userId: String,
        catalogId: String?,
        item: GroceryItem,
        normalized: String
    ) async {
        // US-274: route writes to the household-scoped row when sharing
        // is enabled and we have a cached household. Conflict target +
        // existing-row lookup must match — household path uses
        // (household_id, name_normalized) and ignores any older user-
        // only row for the same product (those continue to exist until
        // manually consolidated).
        let writeToHousehold = householdShareEnabled && cachedHouseholdId != nil
        let householdId = writeToHousehold ? cachedHouseholdId : nil
        let conflictTarget = writeToHousehold
            ? "household_id,name_normalized"
            : "user_id,name_normalized"

        do {
            // Read existing so we can carry forward the times_added
            // counter without an extra round trip.
            let existing: UserProductPreference? = await {
                if let householdId {
                    return try? await fetchHouseholdPreference(householdId: householdId, nameNormalized: normalized)
                }
                return try? await fetchUserPreference(userId: userId, nameNormalized: normalized)
            }()
            // US-276: append "now" to history and trim to the cap.
            // Newer entries are at the end (chronological) so the
            // predictor reads the array as `let last = .last`.
            let nowISO = ISO8601DateFormatter().string(from: Date())
            let priorHistory = existing?.addHistory ?? []
            let history = Array((priorHistory + [nowISO]).suffix(Self.addHistoryCap))

            let row = PreferenceUpsert(
                id: existing?.id ?? UUID().uuidString,
                user_id: userId,
                household_id: householdId,
                catalog_id: catalogId ?? existing?.catalogId,
                name: item.name,
                name_normalized: normalized,
                barcode: item.barcode ?? existing?.barcode,
                preferred_aisle_section: item.aisleSection ?? existing?.preferredAisleSection,
                preferred_category: item.category,
                preferred_unit: item.unit,
                preferred_quantity: item.quantity,
                preferred_brand: item.brandPreference ?? existing?.preferredBrand,
                notes: item.notes ?? existing?.notes,
                times_added: (existing?.timesAdded ?? 0) + 1,
                last_added_at: nowISO,
                add_history: history
            )
            try await client
                .from("user_product_preferences")
                .upsert(row, onConflict: conflictTarget)
                .execute()
        } catch {
            // Best-effort: don't surface to the user.
        }
    }

    // MARK: - Mapping helpers

    private func apply(preference: UserProductPreference, fallbackName: String) -> ResolvedProduct {
        let aisle = preference.preferredAisleSection
            .flatMap(GroceryAisle.init(rawValue:))
            ?? GroceryAisle.classify(preference.name)
        let category = preference.preferredCategory
            .flatMap(FoodCategory.init(rawValue:))
            ?? aisle.derivedFoodCategory
        return ResolvedProduct(
            name: preference.name.isEmpty ? fallbackName : preference.name,
            aisleSection: aisle,
            category: category,
            unit: preference.preferredUnit ?? "count",
            quantity: preference.preferredQuantity ?? 1,
            brand: preference.preferredBrand,
            barcode: preference.barcode,
            notes: preference.notes,
            source: .userPreference
        )
    }

    private func apply(catalog: ProductCatalogEntry, fallbackName: String) -> ResolvedProduct {
        let aisle = catalog.defaultAisleSection
            .flatMap(GroceryAisle.init(rawValue:))
            ?? GroceryAisle.classify(catalog.name)
        let category = catalog.defaultCategory
            .flatMap(FoodCategory.init(rawValue:))
            ?? aisle.derivedFoodCategory
        return ResolvedProduct(
            name: catalog.name.isEmpty ? fallbackName : catalog.name,
            aisleSection: aisle,
            category: category,
            unit: catalog.defaultUnit ?? "count",
            quantity: catalog.defaultQuantity ?? 1,
            brand: catalog.brand,
            barcode: catalog.barcode,
            notes: nil,
            source: .catalog
        )
    }

    private func currentUserId() async throws -> String {
        let session = try await client.auth.session
        return session.user.id.uuidString.lowercased()
    }
}
