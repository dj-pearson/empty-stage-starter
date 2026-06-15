import Foundation

/// US-249: durable per-kid earned-badge record (mirrors the `kid_badges`
/// table). UserDefaults in BadgeService is a write-through cache of these.
struct KidBadge: Identifiable, Codable, Equatable {
    let id: String
    var kidId: String
    var badgeId: String
    /// ISO-8601 timestamp string (the column is timestamptz). String keeps the
    /// model decoder-strategy-agnostic, matching the rest of the app.
    var earnedAt: String
    var householdId: String?

    enum CodingKeys: String, CodingKey {
        case id
        case kidId = "kid_id"
        case badgeId = "badge_id"
        case earnedAt = "earned_at"
        case householdId = "household_id"
    }

    /// Parsed earned-at date (best-effort across the formats Postgres returns).
    var earnedDate: Date? {
        ISO8601DateFormatter.kidBadge.date(from: earnedAt)
            ?? ISO8601DateFormatter.kidBadgeFractional.date(from: earnedAt)
    }
}

extension ISO8601DateFormatter {
    static let kidBadge: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static let kidBadgeFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}
