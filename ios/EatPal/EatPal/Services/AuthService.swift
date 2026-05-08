import Foundation
import Supabase
import Auth

/// Handles all authentication operations against Supabase Auth.
@MainActor
final class AuthService {
    static let shared = AuthService()
    private let client = SupabaseManager.client

    private init() {}

    // MARK: - Session

    func currentSession() async throws -> Session? {
        try await client.auth.session
    }

    func currentUser() async throws -> User? {
        try await client.auth.session.user
    }

    // MARK: - Sign Up

    func signUp(email: String, password: String) async throws -> Session {
        let response = try await client.auth.signUp(
            email: email,
            password: password
        )
        guard let session = response.session else {
            throw AuthError.noSession
        }
        return session
    }

    // MARK: - Sign In

    func signIn(email: String, password: String) async throws -> Session {
        try await client.auth.signIn(
            email: email,
            password: password
        )
    }

    // MARK: - Sign In with Apple

    func signInWithApple(idToken: String, nonce: String) async throws -> Session {
        try await client.auth.signInWithIdToken(
            credentials: .init(
                provider: .apple,
                idToken: idToken,
                nonce: nonce
            )
        )
    }

    // MARK: - Password Reset

    func resetPassword(email: String) async throws {
        try await client.auth.resetPasswordForEmail(email)
    }

    // MARK: - Update Password

    func updatePassword(newPassword: String) async throws {
        try await client.auth.update(user: .init(password: newPassword))
    }

    // MARK: - Sign Out

    func signOut() async throws {
        try await client.auth.signOut()
    }

    // MARK: - Delete Account

    /// Deletes the signed-in user's account by calling the `delete-account`
    /// edge function, which removes user-keyed data and the auth.users row
    /// with service-role credentials. Required for Apple Guideline 5.1.1(v).
    ///
    /// On success the server returns 200 and we sign the user out locally so
    /// the session token can't be reused. Any server error is rethrown.
    func deleteAccount() async throws {
        struct Empty: Encodable {}
        struct DeleteResponse: Decodable {
            let success: Bool?
            let error: String?
        }

        let body = try JSONEncoder().encode(Empty())
        let response: DeleteResponse = try await EdgeFunctions.invoke(
            "delete-account",
            jsonBody: body,
            as: DeleteResponse.self
        )

        if let error = response.error {
            throw NSError(
                domain: "DeleteAccount",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: error]
            )
        }

        // Best-effort local sign-out — even if the network call fails here,
        // the server already removed the account so the session is dead.
        try? await client.auth.signOut()
    }

    // MARK: - Apple Relay Email Binding

    /// Whether the current user has a password set. Reads
    /// `auth.users.encrypted_password IS NOT NULL` via the
    /// `current_user_has_password()` SECURITY DEFINER function. False on
    /// any error (treat unknown as "not set" — the UI will offer to set one).
    func hasPassword() async -> Bool {
        do {
            let result: Bool = try await client.rpc("current_user_has_password").execute().value
            return result
        } catch {
            return false
        }
    }

    /// Sends a 6-digit verification code to the requested email so the
    /// user can swap their @privaterelay Apple address for a real one.
    func bindEmailRequest(email: String) async throws {
        struct Request: Encodable { let email: String }
        struct Response: Decodable { let ok: Bool?; let error: String? }
        let response: Response = try await EdgeFunctions.invoke(
            "bind-email-request",
            body: Request(email: email),
            as: Response.self
        )
        if let error = response.error {
            throw NSError(domain: "BindEmail", code: 1, userInfo: [NSLocalizedDescriptionKey: error])
        }
    }

    /// Verifies the code emitted by bindEmailRequest. On success,
    /// auth.users.email is rewritten to the bound address; the Apple
    /// identity remains linked.
    @discardableResult
    func bindEmailVerify(code: String) async throws -> String {
        struct Request: Encodable { let code: String }
        struct Response: Decodable { let ok: Bool?; let email: String?; let error: String? }
        let response: Response = try await EdgeFunctions.invoke(
            "bind-email-verify",
            body: Request(code: code),
            as: Response.self
        )
        if let error = response.error {
            throw NSError(domain: "BindEmail", code: 2, userInfo: [NSLocalizedDescriptionKey: error])
        }
        guard let email = response.email else {
            throw NSError(domain: "BindEmail", code: 3, userInfo: [NSLocalizedDescriptionKey: "Server did not return the bound email"])
        }
        return email
    }

    /// Sets the password for the current session. Used by the post-bind
    /// step so an Apple-only user can subsequently sign in with email.
    func setPassword(_ password: String) async throws {
        try await client.auth.update(user: .init(password: password))
    }

    // MARK: - Auth State Listener

    func onAuthStateChange() -> AsyncStream<(AuthChangeEvent, Session?)> {
        AsyncStream { continuation in
            let task = Task {
                for await (event, session) in client.auth.authStateChanges {
                    continuation.yield((event, session))
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in
                task.cancel()
            }
        }
    }
}

// MARK: - Error Types

enum AuthError: LocalizedError {
    case noSession
    case invalidCredentials
    case weakPassword
    case emailAlreadyInUse

    var errorDescription: String? {
        switch self {
        case .noSession:
            return "No session was returned. Please check your email for verification."
        case .invalidCredentials:
            return "Invalid email or password."
        case .weakPassword:
            return "Password must be at least 12 characters with uppercase, lowercase, number, and special character."
        case .emailAlreadyInUse:
            return "An account with this email already exists."
        }
    }
}
