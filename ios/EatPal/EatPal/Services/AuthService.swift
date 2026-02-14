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
