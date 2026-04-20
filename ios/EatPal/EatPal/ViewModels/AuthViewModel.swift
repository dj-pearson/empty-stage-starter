import SwiftUI
import Supabase
import AuthenticationServices

enum AuthState: Equatable {
    case loading
    case unauthenticated
    case authenticated
}

enum AuthMode {
    case signIn
    case signUp
    case forgotPassword
}

@MainActor
final class AuthViewModel: ObservableObject {
    // MARK: - Published State

    @Published var authState: AuthState = .loading
    @Published var authMode: AuthMode = .signIn

    @Published var email = ""
    @Published var password = ""
    @Published var confirmPassword = ""

    @Published var isSubmitting = false
    @Published var errorMessage: String?
    @Published var successMessage: String?

    @Published var passwordValidation: PasswordValidator.ValidationResult?

    /// Email of the currently signed-in user, sourced from the Supabase
    /// session (not the login form). Nil when unauthenticated. Used by
    /// Settings to show the real email even after Sign in with Apple,
    /// which never populates the form field.
    @Published var sessionEmail: String?

    // MARK: - Apple Sign-In

    /// The raw nonce for the current Apple Sign-In attempt.
    /// Stored so it can be sent to Supabase after Apple returns the credential.
    private(set) var currentNonce: String?

    // MARK: - Services

    private let authService = AuthService.shared
    private var authStateTask: Task<Void, Never>?

    // MARK: - Init

    init() {
        startListeningForAuthChanges()
    }

    deinit {
        authStateTask?.cancel()
    }

    // MARK: - Auth State Listener

    private func startListeningForAuthChanges() {
        authStateTask = Task { [weak self] in
            guard let self else { return }

            // Check initial session
            do {
                let session = try await authService.currentSession()
                self.authState = session != nil ? .authenticated : .unauthenticated
                self.sessionEmail = session?.user.email
                if let userId = session?.user.id.uuidString {
                    SentryService.setUserId(userId)
                    SentryService.leaveBreadcrumb(category: "auth", message: "session restored")
                }
            } catch {
                self.authState = .unauthenticated
                self.sessionEmail = nil
            }

            // Listen for changes
            for await (event, session) in authService.onAuthStateChange() {
                switch event {
                case .signedIn:
                    self.authState = .authenticated
                    self.sessionEmail = session?.user.email
                    SentryService.setUserId(session?.user.id.uuidString)
                    SentryService.leaveBreadcrumb(category: "auth", message: "signed in")
                case .signedOut:
                    self.authState = .unauthenticated
                    self.sessionEmail = nil
                    self.clearForm()
                    SentryService.setUserId(nil)
                    SentryService.leaveBreadcrumb(category: "auth", message: "signed out")
                default:
                    break
                }
            }
        }
    }

    // MARK: - Validation

    func validatePassword() {
        guard !password.isEmpty else {
            passwordValidation = nil
            return
        }
        passwordValidation = PasswordValidator.validate(password)
    }

    var isFormValid: Bool {
        switch authMode {
        case .signIn:
            return !email.isEmpty && !password.isEmpty
        case .signUp:
            return !email.isEmpty && !password.isEmpty &&
                   password == confirmPassword &&
                   (passwordValidation?.isValid ?? false)
        case .forgotPassword:
            return !email.isEmpty
        }
    }

    // MARK: - Actions

    func submit() async {
        guard isFormValid else { return }
        isSubmitting = true
        errorMessage = nil
        successMessage = nil

        do {
            switch authMode {
            case .signIn:
                _ = try await authService.signIn(email: email, password: password)
            case .signUp:
                _ = try await authService.signUp(email: email, password: password)
                successMessage = "Account created! Check your email to verify."
            case .forgotPassword:
                try await authService.resetPassword(email: email)
                successMessage = "Password reset email sent. Check your inbox."
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        isSubmitting = false
    }

    func signOut() async {
        do {
            try await authService.signOut()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Permanently deletes the user's account via the `delete-account` edge
    /// function. Throws so the caller can show an error; the auth-state
    /// listener handles the sign-out transition on success.
    func deleteAccount() async throws {
        try await authService.deleteAccount()
    }

    // MARK: - Apple Sign-In

    /// Configures the Apple Sign-In request with a fresh nonce.
    func configureAppleRequest(_ request: ASAuthorizationAppleIDRequest) {
        let nonce = AppleSignInHelper.randomNonceString()
        currentNonce = nonce
        request.requestedScopes = [.email, .fullName]
        request.nonce = AppleSignInHelper.sha256(nonce)
    }

    /// Handles the result of the Apple Sign-In authorization.
    func handleAppleSignIn(_ result: Result<ASAuthorization, Error>) async {
        isSubmitting = true
        errorMessage = nil

        switch result {
        case .success(let authorization):
            guard let appleCredential = authorization.credential as? ASAuthorizationAppleIDCredential else {
                errorMessage = "Apple Sign-In returned an unexpected credential type. Please try again."
                SentryService.capture(
                    NSError(domain: "AppleSignIn", code: -1, userInfo: [NSLocalizedDescriptionKey: "Unexpected credential type"]),
                    extras: ["context": "apple_sign_in_credential_type"]
                )
                isSubmitting = false
                return
            }
            guard let identityTokenData = appleCredential.identityToken else {
                errorMessage = "Apple didn't return an identity token. Please try Sign in with Apple again."
                SentryService.capture(
                    NSError(domain: "AppleSignIn", code: -2, userInfo: [NSLocalizedDescriptionKey: "Missing identity token"]),
                    extras: ["context": "apple_sign_in_missing_token"]
                )
                isSubmitting = false
                return
            }
            guard let idToken = String(data: identityTokenData, encoding: .utf8) else {
                errorMessage = "Couldn't read the identity token returned by Apple. Please try again."
                SentryService.capture(
                    NSError(domain: "AppleSignIn", code: -3, userInfo: [NSLocalizedDescriptionKey: "Identity token not UTF-8 decodable"]),
                    extras: ["context": "apple_sign_in_token_decode"]
                )
                isSubmitting = false
                return
            }
            guard let nonce = currentNonce else {
                errorMessage = "Sign in with Apple lost its secure nonce. Please tap the button again."
                SentryService.capture(
                    NSError(domain: "AppleSignIn", code: -4, userInfo: [NSLocalizedDescriptionKey: "Missing nonce"]),
                    extras: ["context": "apple_sign_in_missing_nonce"]
                )
                isSubmitting = false
                return
            }

            do {
                _ = try await authService.signInWithApple(idToken: idToken, nonce: nonce)
                // Auth state listener will handle the transition to .authenticated
            } catch {
                errorMessage = "Sign in with Apple failed: \(error.localizedDescription)"
                SentryService.capture(error, extras: [
                    "context": "apple_sign_in_supabase_exchange",
                    "userIdentifier": appleCredential.user
                ])
            }

        case .failure(let error):
            let nsError = error as NSError
            // Don't surface an error if the user simply cancelled the sheet.
            switch nsError.code {
            case ASAuthorizationError.canceled.rawValue:
                break
            case ASAuthorizationError.notHandled.rawValue:
                errorMessage = "Apple couldn't complete Sign in. Make sure you're signed into iCloud and try again."
                SentryService.capture(error, extras: ["context": "apple_sign_in_not_handled"])
            case ASAuthorizationError.failed.rawValue:
                errorMessage = "Sign in with Apple failed. Please try again or use email sign-in."
                SentryService.capture(error, extras: ["context": "apple_sign_in_failed"])
            case ASAuthorizationError.invalidResponse.rawValue:
                errorMessage = "Apple returned an invalid response. Please try again."
                SentryService.capture(error, extras: ["context": "apple_sign_in_invalid_response"])
            default:
                errorMessage = error.localizedDescription
                SentryService.capture(error, extras: [
                    "context": "apple_sign_in_authorization",
                    "errorCode": "\(nsError.code)",
                    "errorDomain": nsError.domain
                ])
            }
        }

        currentNonce = nil
        isSubmitting = false
    }

    func switchMode(to mode: AuthMode) {
        withAnimation(.easeInOut(duration: 0.2)) {
            authMode = mode
            errorMessage = nil
            successMessage = nil
        }
    }

    private func clearForm() {
        email = ""
        password = ""
        confirmPassword = ""
        errorMessage = nil
        successMessage = nil
        passwordValidation = nil
    }
}
