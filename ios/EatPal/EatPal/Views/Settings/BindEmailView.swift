import SwiftUI

/// Three-step flow that lets a Sign-in-with-Apple user swap their
/// @privaterelay address for a real email and set a password. After
/// completion both Apple and email/password sign-in work.
struct BindEmailView: View {
    enum Step {
        case email
        case code
        case password
        case done
    }

    enum Mode {
        /// Run the full email -> code -> password flow.
        case full
        /// Skip the email + code steps; just set a password. Used when
        /// the Apple user already has a real email but no password.
        case passwordOnly
    }

    let mode: Mode
    var onComplete: (() -> Void)?

    @EnvironmentObject private var authViewModel: AuthViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var step: Step
    @State private var email = ""
    @State private var code = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var boundEmail: String?
    @State private var isWorking = false
    @State private var errorMessage: String?
    @State private var resendCooldown = 0
    @State private var cooldownTask: Task<Void, Never>?

    init(mode: Mode = .full, onComplete: (() -> Void)? = nil) {
        self.mode = mode
        self.onComplete = onComplete
        _step = State(initialValue: mode == .passwordOnly ? .password : .email)
    }

    var body: some View {
        Form {
            switch step {
            case .email:    emailStep
            case .code:     codeStep
            case .password: passwordStep
            case .done:     doneStep
            }

            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .font(.callout)
                        .foregroundStyle(.red)
                }
            }
        }
        .navigationTitle(navigationTitle)
        .navigationBarTitleDisplayMode(.inline)
        .onDisappear { cooldownTask?.cancel() }
    }

    private var navigationTitle: String {
        switch step {
        case .email, .code: return "Bind Email"
        case .password:     return "Set Password"
        case .done:         return "Done"
        }
    }

    // MARK: - Steps

    private var emailStep: some View {
        Group {
            Section {
                TextField("you@example.com", text: $email)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .disabled(isWorking)
            } header: {
                Text("Real email address")
            } footer: {
                Text("We'll send a 6-digit code to confirm this address. Once verified you can set a password and sign in with email or Apple.")
            }

            Section {
                Button {
                    Task { await sendCode(initial: true) }
                } label: {
                    if isWorking {
                        ProgressView()
                    } else {
                        Text("Send verification code")
                    }
                }
                .disabled(isWorking || !isEmailLikelyValid)
            }
        }
    }

    private var codeStep: some View {
        Group {
            Section {
                TextField("123456", text: $code)
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    .font(.system(.title3, design: .monospaced))
                    .disabled(isWorking)
                    .onChange(of: code) { _, newValue in
                        // Strip non-digits, cap at 6.
                        let cleaned = String(newValue.filter(\.isNumber).prefix(6))
                        if cleaned != newValue { code = cleaned }
                    }
            } header: {
                Text("Enter the 6-digit code")
            } footer: {
                Text("Sent to \(email).")
            }

            Section {
                Button {
                    Task { await verifyCode() }
                } label: {
                    if isWorking {
                        ProgressView()
                    } else {
                        Text("Verify code")
                    }
                }
                .disabled(isWorking || code.count != 6)

                Button(resendCooldown > 0 ? "Resend in \(resendCooldown)s" : "Resend code") {
                    Task { await sendCode(initial: false) }
                }
                .disabled(isWorking || resendCooldown > 0)

                Button("Use a different email", role: .cancel) {
                    code = ""
                    errorMessage = nil
                    step = .email
                }
                .disabled(isWorking)
            }
        }
    }

    private var passwordStep: some View {
        Group {
            if let boundEmail {
                Section {
                    Label(boundEmail, systemImage: "checkmark.seal.fill")
                        .foregroundStyle(.green)
                } header: {
                    Text("Email confirmed")
                }
            }

            Section {
                SecureField("At least 8 characters", text: $password)
                    .textContentType(.newPassword)
                    .disabled(isWorking)
                SecureField("Confirm password", text: $confirmPassword)
                    .textContentType(.newPassword)
                    .disabled(isWorking)
            } header: {
                Text("Set a password")
            } footer: {
                Text("After this you'll be able to sign in with email + password or continue using Sign in with Apple — both will work.")
            }

            Section {
                Button {
                    Task { await setPassword() }
                } label: {
                    if isWorking {
                        ProgressView()
                    } else {
                        Text("Set password")
                    }
                }
                .disabled(isWorking || !isPasswordValid)
            }
        }
    }

    private var doneStep: some View {
        Section {
            Label("All set", systemImage: "checkmark.seal.fill")
                .foregroundStyle(.green)
            Text("You can now sign in with email and password, or keep using Apple.")
                .font(.callout)
                .foregroundStyle(.secondary)
            Button("Done") { dismiss() }
        }
    }

    // MARK: - Validation

    private var isEmailLikelyValid: Bool {
        let trimmed = email.trimmingCharacters(in: .whitespaces)
        guard trimmed.contains("@"), trimmed.contains(".") else { return false }
        let lower = trimmed.lowercased()
        return !lower.hasSuffix("@privaterelay.appleid.com")
    }

    private var isPasswordValid: Bool {
        password.count >= 8 && password == confirmPassword
    }

    // MARK: - Actions

    private func sendCode(initial: Bool) async {
        let target = email.trimmingCharacters(in: .whitespaces).lowercased()
        guard isEmailLikelyValid else {
            errorMessage = "Enter a valid real email address."
            return
        }
        email = target
        isWorking = true
        errorMessage = nil
        do {
            try await AuthService.shared.bindEmailRequest(email: target)
            startResendCooldown()
            if initial { step = .code }
        } catch {
            errorMessage = error.localizedDescription
        }
        isWorking = false
    }

    private func verifyCode() async {
        guard code.count == 6 else { return }
        isWorking = true
        errorMessage = nil
        do {
            let bound = try await AuthService.shared.bindEmailVerify(code: code)
            boundEmail = bound
            await authViewModel.refreshBindStatus()
            step = .password
        } catch {
            errorMessage = error.localizedDescription
            code = ""
        }
        isWorking = false
    }

    private func setPassword() async {
        guard isPasswordValid else { return }
        isWorking = true
        errorMessage = nil
        do {
            try await AuthService.shared.setPassword(password)
            await authViewModel.refreshBindStatus()
            step = .done
            onComplete?()
        } catch {
            errorMessage = error.localizedDescription
        }
        isWorking = false
    }

    private func startResendCooldown() {
        cooldownTask?.cancel()
        resendCooldown = 60
        cooldownTask = Task { @MainActor in
            while resendCooldown > 0 {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if Task.isCancelled { return }
                resendCooldown -= 1
            }
        }
    }
}
