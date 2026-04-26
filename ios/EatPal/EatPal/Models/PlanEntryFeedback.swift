import Foundation

/// US-231: Per-meal feedback rating + optional note. One row per
/// `(planEntry, parent submission)`; multiple rows per planEntry are
/// allowed (e.g., re-rate after a second serving) and the dashboard
/// always uses the latest by `createdAt`.
struct PlanEntryFeedback: Identifiable, Codable, Equatable {
    let id: String
    var planEntryId: String
    var userId: String
    /// 1-5 emoji scale. Zero is reserved for "note-only feedback" — the
    /// UI never produces it today but the schema permits it.
    var rating: Int
    var note: String?
    var createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case planEntryId = "plan_entry_id"
        case userId = "user_id"
        case rating, note
        case createdAt = "created_at"
    }
}

/// Insert payload — server fills in id + created_at via defaults, and
/// the iOS layer fills in user_id from the session, so callers only
/// have to provide the meaningful fields.
struct PlanEntryFeedbackInsert: Codable {
    var planEntryId: String
    var userId: String
    var rating: Int
    var note: String?

    enum CodingKeys: String, CodingKey {
        case planEntryId = "plan_entry_id"
        case userId = "user_id"
        case rating, note
    }
}
