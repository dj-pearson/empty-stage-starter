import Foundation

/// US-262: Result of `rpc_mark_meal_made`. Mirrors the JSON envelope
/// returned by the Postgres RPC so the iOS side can surface the right
/// toast (logged, already_logged, no_recipe).
struct MarkMealMadeResult: Codable {
    enum Status: String, Codable {
        /// Recipe-linked plan entry; foods debited and grocery items
        /// auto-checked.
        case logged
        /// Already logged within the past hour — no debit applied.
        /// Surface "Already logged - undo?" so users can correct typos.
        case alreadyLogged = "already_logged"
        /// Plan entry has no recipe; nothing to debit but grocery items
        /// linked manually still got checked.
        case noRecipe = "no_recipe"
    }

    let status: Status
    /// Number of pantry foods debited (one per linked recipe ingredient).
    /// nil when status is `alreadyLogged`.
    let debitedCount: Int?
    /// Number of grocery items auto-checked. nil when alreadyLogged.
    let checkedCount: Int?
    /// ISO timestamp of the original logging event (for the
    /// alreadyLogged path) or this one (for logged/noRecipe).
    let madeAt: String?

    enum CodingKeys: String, CodingKey {
        case status
        case debitedCount = "debited_count"
        case checkedCount = "checked_count"
        case madeAt = "made_at"
    }
}

/// Persisted log row. Mirrors `plan_entry_made_log`. Currently only
/// surfaced indirectly (via the RPC result), but the standalone struct
/// is here for the upcoming undo flow that will fetch + apply
/// `reversal_payload`.
struct PlanEntryMadeLog: Identifiable, Codable, Equatable {
    let id: String
    var planEntryId: String
    var userId: String
    var madeAt: String
    var debitedFoodCount: Int
    var checkedGroceryCount: Int
    /// Encoded JSONB blob; opaque to Swift. The undo RPC will parse it
    /// server-side, so we don't need to model the inner shape here.
    var reversalPayload: String?

    enum CodingKeys: String, CodingKey {
        case id
        case planEntryId = "plan_entry_id"
        case userId = "user_id"
        case madeAt = "made_at"
        case debitedFoodCount = "debited_food_count"
        case checkedGroceryCount = "checked_grocery_count"
        case reversalPayload = "reversal_payload"
    }
}
