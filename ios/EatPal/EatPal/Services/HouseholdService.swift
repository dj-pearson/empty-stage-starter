import Foundation
@preconcurrency import Supabase

/// US-242: Household + invite-code operations.
///
/// Wraps the SECURITY DEFINER RPCs added in
/// `20260426000001_household_invite_codes.sql` plus the existing
/// `households` / `household_members` tables. Doesn't hold its own state
/// — the Settings → Household view loads on demand via the methods here
/// and re-fetches after mutations.
@MainActor
enum HouseholdService {
    private static let client = SupabaseManager.client

    // MARK: - Household

    /// Resolve the caller's household, auto-provisioning one if needed.
    /// Returns the row so the UI can show the name.
    static func currentHousehold() async throws -> Household {
        // ensure_user_household RPC creates the row if missing.
        let _: Empty = (try? await client.rpc("ensure_user_household").execute().value) ?? Empty()

        let rows: [Household] = try await client
            .from("households")
            .select()
            .limit(1)
            .execute()
            .value

        guard let first = rows.first else {
            throw HouseholdError.notFound
        }
        return first
    }

    static func renameHousehold(id: String, to newName: String) async throws {
        struct Patch: Encodable { let name: String }
        try await client.from("households")
            .update(Patch(name: newName))
            .eq("id", value: id)
            .execute()
    }

    // MARK: - Members

    static func members(householdId: String) async throws -> [HouseholdMember] {
        try await client.from("household_members")
            .select()
            .eq("household_id", value: householdId)
            .order("joined_at", ascending: true)
            .execute()
            .value
    }

    /// Remove a member. Server-side RLS enforces that only existing
    /// members of the household can perform the delete.
    static func removeMember(memberId: String) async throws {
        try await client.from("household_members")
            .delete()
            .eq("id", value: memberId)
            .execute()
    }

    // MARK: - Invite codes

    static func openInviteCodes(householdId: String) async throws -> [HouseholdInviteCode] {
        try await client.from("household_invite_codes")
            .select()
            .eq("household_id", value: householdId)
            .is("used_at", value: nil)
            .order("created_at", ascending: false)
            .execute()
            .value
    }

    /// Create a fresh 6-char invite code valid 24h. Returns the raw code
    /// so the UI can show it immediately without a follow-up fetch.
    static func createInvite(role: String = "parent") async throws -> String {
        // Postgrest expects the JSON keys to match the SQL function param
        // names (`p_role`, `p_code`). Swift identifier rules forbid
        // underscores in property names, so we use camelCase Swift +
        // CodingKeys to control the wire format.
        struct Args: Encodable {
            let role: String
            enum CodingKeys: String, CodingKey { case role = "p_role" }
        }
        let code: String = try await client.rpc(
            "create_household_invite",
            params: Args(role: role)
        ).execute().value
        return code
    }

    /// Accept an invite code. Returns the household id the user just
    /// joined so the UI can refresh into the new household context.
    static func acceptInvite(code: String) async throws -> String {
        struct Args: Encodable {
            let code: String
            enum CodingKeys: String, CodingKey { case code = "p_code" }
        }
        let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        let householdId: String = try await client.rpc(
            "accept_household_invite",
            params: Args(code: trimmed)
        ).execute().value
        return householdId
    }

    static func revokeInvite(id: String) async throws {
        try await client.from("household_invite_codes")
            .delete()
            .eq("id", value: id)
            .execute()
    }

    // MARK: - Errors

    enum HouseholdError: Error, LocalizedError {
        case notFound

        var errorDescription: String? {
            switch self {
            case .notFound: return "We couldn't find your household. Try signing out and back in."
            }
        }
    }

    /// Used when an RPC returns void.
    private struct Empty: Codable {}
}
