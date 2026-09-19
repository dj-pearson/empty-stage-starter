import Foundation

/// US-871: an earned badge, as the database holds it.
///
/// Mirrors `public.kid_badges` (20260919000001). Badges lived only in
/// `UserDefaults` under `badges.<kidId>.earned` from US-241 until now, which
/// meant a year of a child's progress did not survive a reinstall, did not
/// move to a new phone, and was invisible to the second parent -- who opened
/// the badge grid and saw nothing for a child who had earned eight.
struct KidBadge: Identifiable, Codable, Equatable {
    let id: String
    var kidId: String
    /// The `Badge` enum's own id, e.g. `first_bite`. Client vocabulary, stored
    /// verbatim: the catalog ships with the app, so a build that earns a badge
    /// the database has never heard of stores it rather than being rejected,
    /// and an older build ignores an id it does not recognise. Which is why
    /// these ids must never be renamed (AC4).
    var badgeId: String
    /// When the child earned it, not when the row reached the server.
    var earnedAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case kidId = "kid_id"
        case badgeId = "badge_id"
        case earnedAt = "earned_at"
    }
}

/// Insert payload.
///
/// `id` is generated on the client for the same reason every other queued
/// insert in this app does it (US-609, US-823 on web): a write that replays
/// after a reconnect has to land under the id the optimistic state already
/// used. Additive -- `kid_badges.id` keeps its `gen_random_uuid()` default.
struct KidBadgeInsert: Codable {
    var id: String = UUID().uuidString
    var kidId: String
    var badgeId: String
    var earnedAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case kidId = "kid_id"
        case badgeId = "badge_id"
        case earnedAt = "earned_at"
    }
}
