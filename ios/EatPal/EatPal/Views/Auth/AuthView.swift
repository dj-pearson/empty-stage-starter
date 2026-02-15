import SwiftUI
import AuthenticationServices

struct AuthView: View {
    @EnvironmentObject var authViewModel: AuthViewModel

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 32) {
                    // Logo & Branding
                    VStack(spacing: 12) {
                        Image(systemName: "fork.knife.circle.fill")
                            .font(.system(size: 64))
                            .foregroundStyle(.green)

                        Text("EatPal")
                            .font(.largeTitle)
                            .fontWeight(.bold)

                        Text("Meal planning made simple")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 40)

                    // Auth Form
                    VStack(spacing: 20) {
                        // Mode Picker
                        if authViewModel.authMode != .forgotPassword {
                            Picker("", selection: Binding(
                                get: { authViewModel.authMode == .signUp },
                                set: { authViewModel.switchMode(to: $0 ? .signUp : .signIn) }
                            )) {
                                Text("Sign In").tag(false)
                                Text("Sign Up").tag(true)
                            }
                            .pickerStyle(.segmented)
                        }

                        // Email Field
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Email")
                                .font(.subheadline)
                                .fontWeight(.medium)

                            TextField("you@example.com", text: $authViewModel.email)
                                .textFieldStyle(.roundedBorder)
                                .textContentType(.emailAddress)
                                .keyboardType(.emailAddress)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                        }

                        // Password Field
                        if authViewModel.authMode != .forgotPassword {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Password")
                                    .font(.subheadline)
                                    .fontWeight(.medium)

                                SecureField("Enter password", text: $authViewModel.password)
                                    .textFieldStyle(.roundedBorder)
                                    .textContentType(authViewModel.authMode == .signUp ? .newPassword : .password)
                                    .onChange(of: authViewModel.password) {
                                        authViewModel.validatePassword()
                                    }

                                // Password strength indicator (sign up only)
                                if authViewModel.authMode == .signUp {
                                    PasswordStrengthView(
                                        validation: authViewModel.passwordValidation
                                    )
                                }
                            }
                        }

                        // Confirm Password (sign up only)
                        if authViewModel.authMode == .signUp {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Confirm Password")
                                    .font(.subheadline)
                                    .fontWeight(.medium)

                                SecureField("Confirm password", text: $authViewModel.confirmPassword)
                                    .textFieldStyle(.roundedBorder)
                                    .textContentType(.newPassword)

                                if !authViewModel.confirmPassword.isEmpty &&
                                   authViewModel.password != authViewModel.confirmPassword {
                                    Text("Passwords do not match")
                                        .font(.caption)
                                        .foregroundStyle(.red)
                                }
                            }
                        }

                        // Error / Success Messages
                        if let error = authViewModel.errorMessage {
                            Label(error, systemImage: "exclamationmark.triangle.fill")
                                .font(.callout)
                                .foregroundStyle(.red)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(12)
                                .background(.red.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
                        }

                        if let success = authViewModel.successMessage {
                            Label(success, systemImage: "checkmark.circle.fill")
                                .font(.callout)
                                .foregroundStyle(.green)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(12)
                                .background(.green.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
                        }

                        // Submit Button
                        Button {
                            Task { await authViewModel.submit() }
                        } label: {
                            HStack {
                                if authViewModel.isSubmitting {
                                    ProgressView()
                                        .tint(.white)
                                }
                                Text(submitButtonTitle)
                                    .fontWeight(.semibold)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.green)
                        .disabled(!authViewModel.isFormValid || authViewModel.isSubmitting)

                        // Sign in with Apple
                        if authViewModel.authMode != .forgotPassword {
                            dividerWithText("or")

                            SignInWithAppleButton(.signIn) { request in
                                authViewModel.configureAppleRequest(request)
                            } onCompletion: { result in
                                Task {
                                    await authViewModel.handleAppleSignIn(result)
                                }
                            }
                            .signInWithAppleButtonStyle(.black)
                            .frame(height: 50)
                            .clipShape(RoundedRectangle(cornerRadius: AppTheme.Radius.md))
                            .accessibilityLabel("Sign in with Apple")
                        }

                        // Forgot Password / Back
                        if authViewModel.authMode == .forgotPassword {
                            Button("Back to Sign In") {
                                authViewModel.switchMode(to: .signIn)
                            }
                            .font(.callout)
                        } else {
                            Button("Forgot Password?") {
                                authViewModel.switchMode(to: .forgotPassword)
                            }
                            .font(.callout)
                            .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.horizontal, 24)
                }
            }
            .scrollDismissesKeyboard(.interactively)
        }
    }

    private var submitButtonTitle: String {
        switch authViewModel.authMode {
        case .signIn: return "Sign In"
        case .signUp: return "Create Account"
        case .forgotPassword: return "Send Reset Link"
        }
    }

    private func dividerWithText(_ text: String) -> some View {
        HStack {
            Rectangle()
                .fill(Color(.separator))
                .frame(height: 1)
            Text(text)
                .font(.caption)
                .foregroundStyle(.secondary)
            Rectangle()
                .fill(Color(.separator))
                .frame(height: 1)
        }
    }
}

// MARK: - Password Strength Indicator

struct PasswordStrengthView: View {
    let validation: PasswordValidator.ValidationResult?

    var body: some View {
        if let validation {
            VStack(alignment: .leading, spacing: 4) {
                // Strength bar
                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(Color(.systemGray5))
                            .frame(height: 4)

                        RoundedRectangle(cornerRadius: 2)
                            .fill(strengthColor)
                            .frame(
                                width: geometry.size.width * strengthPercentage,
                                height: 4
                            )
                            .animation(.easeInOut(duration: 0.3), value: strengthPercentage)
                    }
                }
                .frame(height: 4)

                // Error list
                if !validation.isValid {
                    ForEach(validation.errors, id: \.self) { error in
                        Label(error, systemImage: "xmark.circle.fill")
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                } else {
                    Label("Strong password", systemImage: "checkmark.circle.fill")
                        .font(.caption)
                        .foregroundStyle(.green)
                }
            }
        }
    }

    private var strengthPercentage: CGFloat {
        guard let validation else { return 0 }
        let totalChecks = 5.0
        let passed = totalChecks - Double(validation.errors.count)
        return CGFloat(passed / totalChecks)
    }

    private var strengthColor: Color {
        switch strengthPercentage {
        case 0..<0.4: return .red
        case 0.4..<0.7: return .orange
        case 0.7..<1.0: return .yellow
        default: return .green
        }
    }
}

#Preview {
    AuthView()
        .environmentObject(AuthViewModel())
}
