import Foundation

/// US-242: Household + member models.
///
/// The DB schema for `households` and `household_members` already exists
/// (see migrations 20251008035758 + 20251124000000); these are just the
/// iOS-side mirrors of the row shapes the Settings → Household view needs.

struct Household: Identifiable, Codable, Equatable {
    let id: String
    var name: String
    var createdAt: String?
    var updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, name
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

struct HouseholdMember: Identifiable, Codable, Equatable {
    let id: String
    let householdId: String
    let userId: String
    /// Free-text role — current values: "parent" / "guardian". The
    /// household_members CHECK constraint enforces the allowed set on the
    /// server.
    var role: String
    var invitedBy: String?
    var joinedAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case householdId = "household_id"
        case userId = "user_id"
        case role
        case invitedBy = "invited_by"
        case joinedAt = "joined_at"
    }

    var displayRole: String {
        switch role.lowercased() {
        case "parent":   return "Parent"
        case "guardian": return "Guardian"
        default:         return role.capitalized
        }
    }
}

/// Outstanding invite code — listed in the Settings → Household view so
/// the inviting parent can copy/share it again or revoke it.
struct HouseholdInviteCode: Identifiable, Codable, Equatable {
    let id: String
    let householdId: String
    let code: String
    var role: String
    var createdBy: String
    var expiresAt: String
    var usedBy: String?
    var usedAt: String?
    var createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case householdId = "household_id"
        case code, role
        case createdBy = "created_by"
        case expiresAt = "expires_at"
        case usedBy = "used_by"
        case usedAt = "used_at"
        case createdAt = "created_at"
    }

    var isExpired: Bool {
        guard let parsed = ISO8601DateFormatter.permissive.date(from: expiresAt) else {
            return false
        }
        return parsed < Date()
    }

    var isUsed: Bool { usedAt != nil }

    /// Human-friendly relative expiry — "expires in 3 hours".
    var expiresInDescription: String {
        guard let parsed = ISO8601DateFormatter.permissive.date(from: expiresAt) else {
            return ""
        }
        let interval = parsed.timeIntervalSinceNow
        if interval < 0 { return "expired" }
        let hours = Int(interval / 3600)
        if hours >= 1 { return "expires in \(hours) hour\(hours == 1 ? "" : "s")" }
        let minutes = max(1, Int(interval / 60))
        return "expires in \(minutes) min"
    }
}

/// ISO8601 with fractional seconds — Supabase's `timestamptz` columns
/// serialize as e.g. `2026-04-26T12:34:56.789Z`, which the default
/// `ISO8601DateFormatter` rejects unless we opt into the option flag.
extension ISO8601DateFormatter {
    static let permissive: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}
