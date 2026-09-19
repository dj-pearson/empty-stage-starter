import XCTest
@testable import EatPal

/// US-703 AC7: the verify path, the expired-code path and the resend cooldown.
///
/// Against `SignupVerificationPolicy` rather than `AuthViewModel`, because the
/// view model's init opens a Supabase auth-state listener and a test that needs
/// a network client is a test nobody runs. The decisions worth pinning are all
/// in the policy: what counts as a code, what a parent reads when one fails,
/// whether a refused sign-in is really the same screen, and when Resend
/// re-enables.
final class SignupVerificationPolicyTests: XCTestCase {

    // MARK: - The code (verify path)

    func testAcceptsSixPlainDigits() {
        let normalized = SignupVerificationPolicy.normalize("123456")
        XCTAssertEqual(normalized, "123456")
        XCTAssertTrue(SignupVerificationPolicy.isComplete(normalized))
    }

    func testStripsWhatPeopleActuallyPaste() {
        // Mail clients break the code into groups, and a parent copying the
        // line above it is not a wrong code.
        XCTAssertEqual(SignupVerificationPolicy.normalize("123 456"), "123456")
        XCTAssertEqual(SignupVerificationPolicy.normalize("Code: 123456"), "123456")
        XCTAssertEqual(SignupVerificationPolicy.normalize("123-456\n"), "123456")
    }

    func testCapsAtSixSoAnExtraKeystrokeCannotSubmitGarbage() {
        XCTAssertEqual(SignupVerificationPolicy.normalize("1234567"), "123456")
    }

    func testAPartialCodeIsNotSubmittable() {
        XCTAssertFalse(SignupVerificationPolicy.isComplete(SignupVerificationPolicy.normalize("12345")))
        XCTAssertFalse(SignupVerificationPolicy.isComplete(SignupVerificationPolicy.normalize("")))
        XCTAssertFalse(SignupVerificationPolicy.isComplete(SignupVerificationPolicy.normalize("abcdef")))
    }

    // MARK: - Expired and invalid codes (AC5)

    func testExpiredCodeNamesResendRatherThanRepeatingSupabase() {
        // The raw string GoTrue returns, which is what the screen used to show.
        let message = SignupVerificationPolicy.verificationFailureMessage(
            for: "Token has expired or is invalid"
        )
        XCTAssertTrue(message.contains("expired"), "should say the code expired: \(message)")
        XCTAssertTrue(message.contains("Resend"), "should name the next step: \(message)")
        XCTAssertFalse(message.contains("Token"), "should not echo the raw error: \(message)")
    }

    func testWrongCodeIsToldApartFromAnExpiredOne() {
        let message = SignupVerificationPolicy.verificationFailureMessage(for: "Invalid token")
        XCTAssertTrue(message.contains("did not match"), message)
        XCTAssertFalse(message.contains("expired"), "a mistyped code is not an expired one: \(message)")
    }

    func testAnUnrecognisedFailureStillNamesAStep() {
        // The case that matters most: a message this function has never seen is
        // exactly when a parent is stuck with nothing to do.
        let message = SignupVerificationPolicy.verificationFailureMessage(for: "unexpected server condition")
        XCTAssertTrue(message.contains("Resend"), message)
        XCTAssertFalse(message.contains("unexpected server condition"), message)
    }

    func testOfflineIsNotReportedAsABadCode() {
        let message = SignupVerificationPolicy.verificationFailureMessage(
            for: "The Internet connection appears to be offline."
        )
        XCTAssertTrue(message.contains("connection"), message)
        XCTAssertFalse(message.contains("Resend"), "resending will not help while offline: \(message)")
    }

    // MARK: - Unconfirmed sign-in routes to the same screen (AC6)

    func testUnconfirmedSignInIsRecognised() {
        XCTAssertTrue(SignupVerificationPolicy.isUnconfirmedEmail("Email not confirmed"))
        XCTAssertTrue(SignupVerificationPolicy.isUnconfirmedEmail("email_not_confirmed"))
        // Case and surrounding text vary by SDK version; the substring does not.
        XCTAssertTrue(SignupVerificationPolicy.isUnconfirmedEmail("AuthApiError: Email not confirmed (400)"))
    }

    func testOtherSignInFailuresAreNotSwallowed() {
        // A wrong password must stay a wrong password. Routing it to the code
        // screen would ask for a code that was never sent.
        XCTAssertFalse(SignupVerificationPolicy.isUnconfirmedEmail("Invalid login credentials"))
        XCTAssertFalse(SignupVerificationPolicy.isUnconfirmedEmail("User not found"))
    }

    // MARK: - Resend cooldown (AC3)

    func testCooldownIsSixtySeconds() {
        XCTAssertEqual(SignupVerificationPolicy.resendCooldownSeconds, 60)

        let start = Date(timeIntervalSince1970: 1_000_000)
        let deadline = SignupVerificationPolicy.cooldownDeadline(from: start)
        XCTAssertEqual(
            SignupVerificationPolicy.remainingCooldown(until: deadline, now: start),
            60
        )
    }

    func testCooldownCountsDownAndStopsAtZero() {
        let start = Date(timeIntervalSince1970: 1_000_000)
        let deadline = SignupVerificationPolicy.cooldownDeadline(from: start)

        XCTAssertEqual(
            SignupVerificationPolicy.remainingCooldown(until: deadline, now: start.addingTimeInterval(30)),
            30
        )
        XCTAssertEqual(
            SignupVerificationPolicy.remainingCooldown(until: deadline, now: start.addingTimeInterval(60)),
            0
        )
    }

    func testASuspendedAppComesBackToAnEnabledButton() {
        // US-432 hit this in BindEmailView: a per-tick decrement drifts while
        // the app is suspended, so the counter comes back stuck above zero and
        // the button never re-enables. Reading from the deadline means a long
        // absence clamps to 0 rather than going negative.
        let start = Date(timeIntervalSince1970: 1_000_000)
        let deadline = SignupVerificationPolicy.cooldownDeadline(from: start)

        XCTAssertEqual(
            SignupVerificationPolicy.remainingCooldown(until: deadline, now: start.addingTimeInterval(3_600)),
            0
        )
    }

    func testAlmostElapsedStillReadsAsWaiting() {
        // Rounding up matters: at 0.2s left, an enabled button sends a request
        // the server refuses with its own rate limit.
        let start = Date(timeIntervalSince1970: 1_000_000)
        let deadline = SignupVerificationPolicy.cooldownDeadline(from: start)

        XCTAssertEqual(
            SignupVerificationPolicy.remainingCooldown(until: deadline, now: start.addingTimeInterval(59.8)),
            1
        )
    }

    // MARK: - Resend failures

    func testServerRateLimitReadsAsWaitRatherThanFailure() {
        let message = SignupVerificationPolicy.resendFailureMessage(
            for: "over_email_send_rate_limit: For security purposes, you can only request this after 43 seconds."
        )
        XCTAssertTrue(message.contains("Wait"), message)
        XCTAssertFalse(message.contains("over_email_send_rate_limit"), message)
    }
}
