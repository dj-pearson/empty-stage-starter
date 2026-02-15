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
            } catch {
                self.authState = .unauthenticated
            }

            // Listen for changes
            for await (event, _) in authService.onAuthStateChange() {
                switch event {
                case .signedIn:
                    self.authState = .authenticated
                case .signedOut:
                    self.authState = .unauthenticated
                    self.clearForm()
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
            guard let appleCredential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let identityTokenData = appleCredential.identityToken,
                  let idToken = String(data: identityTokenData, encoding: .utf8),
                  let nonce = currentNonce else {
                errorMessage = "Failed to process Apple Sign-In credentials."
                isSubmitting = false
                return
            }

            do {
                _ = try await authService.signInWithApple(idToken: idToken, nonce: nonce)
                // Auth state listener will handle the transition to .authenticated
            } catch {
                errorMessage = error.localizedDescription
            }

        case .failure(let error):
            // Don't show error if user cancelled (error code 1001)
            if (error as NSError).code != ASAuthorizationError.canceled.rawValue {
                errorMessage = error.localizedDescription
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
