import Foundation

/// US-851: the invite link, parsed and held until there is someone to accept
/// it as.
///
/// Swift mirror of `src/lib/householdInvite.ts`, which the web `/join` route
/// already uses. Same normalisation on both platforms, because the code a
/// parent reads off a text message is the same code either client sends to
/// `accept_household_invite` — and that RPC compares it uppercased.
///
/// Pure except for the pending store, which is one string in UserDefaults.
enum HouseholdInviteLink {
    static let joinPath = "/join"

    /// Extract and normalise the `code` query parameter.
    ///
    /// Trimmed and uppercased to match `parseInviteCode` on the web: a code
    /// pasted with a trailing space, or typed in lower case, is the same
    /// invite. An empty or absent one is nil rather than "", so a caller
    /// cannot accidentally send a blank code to the RPC.
    static func parseCode(from url: URL) -> String? {
        normalise(url.queryValue(for: "code"))
    }

    static func normalise(_ raw: String?) -> String? {
        guard let raw else { return nil }
        let code = raw.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        return code.isEmpty ? nil : code
    }

    /// The shareable accept URL, matching `buildInviteLink` on the web so a
    /// link minted in the app opens the same place as one minted in a browser.
    static func buildLink(code: String, origin: String = "https://tryeatpal.com") -> String? {
        guard let normalised = normalise(code) else { return nil }
        var components = URLComponents(string: origin)
        components?.path = joinPath
        components?.queryItems = [URLQueryItem(name: "code", value: normalised)]
        return components?.url?.absoluteString
    }

    /// Map an `accept_household_invite` failure to something a parent can act
    /// on. The RPC raises 'Invite code is invalid or expired' / 'Sign in
    /// required'; the same two strings `inviteErrorMessage` matches on the web.
    static func errorMessage(for error: Error) -> String {
        let message = String(describing: error).lowercased()
        if message.contains("sign in") {
            return "Please sign in to accept this invite."
        }
        if message.contains("invalid or expired") {
            return "This invite link is invalid, expired, or already used."
        }
        return "Could not join the household. Please check the link and try again."
    }

    // MARK: - Pending invite (AC2, AC4)

    /// Where a tapped-but-not-yet-accepted code waits.
    ///
    /// A tap can arrive before there is anyone to accept it as: the app may be
    /// cold, or the person may be signed out entirely — which is the common
    /// case, because an invite is usually the first EatPal link someone ever
    /// receives. The web solves this by letting `?code=` ride through its
    /// `/auth` redirect; the app has no redirect to ride, so the code is
    /// parked here and drained once a session exists.
    ///
    /// Plain UserDefaults rather than the App Group: nothing outside the main
    /// app writes an invite, and the keychain would be overkill for a code
    /// that is single-use, short-lived, and already sitting in the recipient's
    /// Messages thread.
    private static let pendingKey = "pending_household_invite_code"

    static func storePending(code: String) {
        guard let normalised = normalise(code) else { return }
        UserDefaults.standard.set(normalised, forKey: pendingKey)
    }

    static func pendingCode() -> String? {
        normalise(UserDefaults.standard.string(forKey: pendingKey))
    }

    /// Read and clear in one step.
    ///
    /// Cleared before the RPC runs rather than after it succeeds, deliberately.
    /// A code that fails is spent either way — `accept_household_invite` raises
    /// on an already-used or expired one — and leaving it parked would retry a
    /// doomed join on every launch, showing the same error each time with no
    /// way for the user to dismiss it.
    static func takePending() -> String? {
        let code = pendingCode()
        clearPending()
        return code
    }

    static func clearPending() {
        UserDefaults.standard.removeObject(forKey: pendingKey)
    }
}
