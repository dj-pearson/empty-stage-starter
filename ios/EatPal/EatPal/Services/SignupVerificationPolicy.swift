import Foundation

/// US-703: the rules behind emailed-code signup verification, kept apart from
/// the view and the network so they can be tested.
///
/// The link path is not available to this project. Coolify pins
/// `GOTRUE_SITE_URL` to `${SERVICE_URL_SUPABASEKONG}`, so every confirmation
/// link Supabase mints points at the Kong gateway rather than at the app or the
/// site, and no `redirectTo` argument changes that. The web client already
/// verifies typed codes for password reset; this is the same shape for signup.
///
/// Nothing here touches Supabase or SwiftUI. `AuthService` owns the two calls
/// and `AuthViewModel` owns the state; this owns the decisions that were worth
/// writing tests for.
enum SignupVerificationPolicy {
    /// GoTrue emails a six-digit numeric code.
    static let codeLength = 6

    /// Seconds a resend is refused for after one has been sent.
    ///
    /// Matches the web client and `BindEmailView`. GoTrue also enforces its own
    /// interval server-side and answers `429 over_email_send_rate_limit`; this
    /// is so the common case is a disabled button rather than an error.
    static let resendCooldownSeconds = 60

    // MARK: - The code itself

    /// Strip everything that is not a digit and cap at the code length.
    ///
    /// People paste "123 456" and "Code: 123456" out of a mail client, and a
    /// space is not a reason to tell a parent their code is wrong.
    static func normalize(_ raw: String) -> String {
        String(raw.filter(\.isNumber).prefix(codeLength))
    }

    /// Whether `normalize` output is ready to submit.
    static func isComplete(_ normalized: String) -> Bool {
        normalized.count == codeLength
    }

    // MARK: - Routing

    /// Whether a failed sign-in means "this account exists but has never
    /// confirmed its email", which is the code-entry screen rather than an
    /// error (AC6).
    ///
    /// Matched on the message because GoTrue's `email_not_confirmed` arrives as
    /// an `AuthError` whose payload shape has changed across SDK versions,
    /// while the string has not. `matchable` flattens the underscores, so the
    /// code and the prose both land on one branch.
    static func isUnconfirmedEmail(_ message: String) -> Bool {
        matchable(message).contains("email not confirmed")
    }

    /// Lowercased, with underscores flattened to spaces.
    ///
    /// GoTrue names a condition twice: a snake_case code
    /// (`over_email_send_rate_limit`, `email_not_confirmed`) and spaced prose,
    /// and which one reaches `localizedDescription` depends on the SDK version
    /// and on whether the body decoded. The first version of this file matched
    /// only the spaced form, so `over_email_send_rate_limit` -- the single most
    /// likely resend failure -- fell past the rate-limit branch into the generic
    /// fallback. CI caught it; nothing local could have, since the string only
    /// appears in a live GoTrue response. Flattening underscores matches both
    /// spellings with one branch.
    private static func matchable(_ message: String) -> String {
        message.lowercased().replacingOccurrences(of: "_", with: " ")
    }

    // MARK: - What the parent reads

    /// A sentence naming the next step, in place of the raw Supabase string
    /// (AC5).
    ///
    /// "Token has expired or is invalid" is accurate and useless: it does not
    /// say that codes last an hour, that a new one can be sent, or which of the
    /// two things went wrong. Anything unrecognised falls back to a sentence
    /// that still tells the reader what to do, because a message this function
    /// has not seen is exactly when a parent is most stuck.
    static func verificationFailureMessage(for message: String) -> String {
        let lowered = matchable(message)

        if lowered.contains("expired") {
            return "That code has expired. Tap Resend to get a new one."
        }
        if lowered.contains("invalid") || lowered.contains("token") {
            return "That code did not match. Check the six digits in your email, or tap Resend."
        }
        if lowered.contains("rate limit") || lowered.contains("too many") {
            return "Too many attempts. Wait a minute, then try again."
        }
        if isNetworkish(lowered) {
            return "Could not reach EatPal. Check your connection and try again."
        }
        return "We could not verify that code. Check the six digits in your email, or tap Resend."
    }

    /// The same treatment for a failed resend.
    static func resendFailureMessage(for message: String) -> String {
        let lowered = matchable(message)

        if lowered.contains("rate limit") || lowered.contains("too many") || lowered.contains("429") {
            return "A code was sent recently. Wait a minute before asking for another."
        }
        if isNetworkish(lowered) {
            return "Could not reach EatPal. Check your connection and try again."
        }
        return "We could not send a new code. Try again in a moment."
    }

    private static func isNetworkish(_ lowered: String) -> Bool {
        lowered.contains("offline")
            || lowered.contains("network")
            || lowered.contains("internet connection")
            || lowered.contains("timed out")
    }

    // MARK: - Cooldown

    /// Seconds left before a resend is allowed, given when the cooldown ends.
    ///
    /// Computed from a wall-clock deadline rather than decremented per tick.
    /// US-432 hit this in `BindEmailView`: a `Task.sleep` loop drifts while the
    /// app is suspended, so a backgrounded screen comes back with a counter
    /// stuck above zero and a button that never re-enables. Rounding up means
    /// a deadline 0.2s away still reads "1s" rather than an enabled button that
    /// the server then refuses.
    static func remainingCooldown(until deadline: Date, now: Date = Date()) -> Int {
        max(0, Int(deadline.timeIntervalSince(now).rounded(.up)))
    }

    /// When a cooldown started now would end.
    static func cooldownDeadline(from start: Date = Date()) -> Date {
        start.addingTimeInterval(TimeInterval(resendCooldownSeconds))
    }
}
