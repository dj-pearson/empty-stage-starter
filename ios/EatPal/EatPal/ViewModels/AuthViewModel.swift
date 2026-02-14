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
