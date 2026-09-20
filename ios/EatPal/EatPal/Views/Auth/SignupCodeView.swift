import SwiftUI

/// US-703: the screen a new account lands on instead of a dead end.
///
/// Signing up used to end on "Account created! Check your email to verify." and
/// nothing else. The link in that email points at the Kong gateway, because
/// Coolify pins `GOTRUE_SITE_URL` to `${SERVICE_URL_SUPABASEKONG}`, so tapping
/// it never got anyone into the app. 75 Apple users signed up and none came
/// back. The email also carries a six-digit code, and this is where it is
/// typed.
///
/// Reached from two directions: straight after a signup that returned no
/// session, and from a sign-in refused with "Email not confirmed" -- which is
/// the same situation a day later, and used to be a message you could only read
/// and give up on.
///
/// Shape follows `BindEmailView`, which already does this for email binding.
struct SignupCodeView: View {
    @ObservedObject var viewModel: AuthViewModel

    /// Focus the field on appear: there is exactly one thing to do here, and
    /// the code is sitting in an email the parent has to switch apps to read.
    @FocusState private var codeFieldFocused: Bool

    private var email: String { viewModel.pendingVerificationEmail ?? "" }

    var body: some View {
        Form {
            Section {
                TextField("123456", text: Binding(
                    get: { viewModel.verificationCode },
                    set: { viewModel.updateVerificationCode($0) }
                ))
                .keyboardType(.numberPad)
                // Lets iOS offer the code from the notification banner, so the
                // common case is one tap rather than switching to Mail.
                .textContentType(.oneTimeCode)
                .font(.system(.title3, design: .monospaced))
                .focused($codeFieldFocused)
                .disabled(viewModel.isSubmitting)
                .accessibilityLabel("Six-digit verification code")
            } header: {
                Text("Enter the 6-digit code")
            } footer: {
                Text("Sent to \(email). Codes expire after an hour.")
            }

            if let error = viewModel.errorMessage {
                Section {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .accessibilityAddTraits(.isStaticText)
                }
            }

            if let notice = viewModel.verificationNotice {
                Section {
                    Text(notice)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            Section {
                Button {
                    Task { await viewModel.verifySignupCode() }
                } label: {
                    if viewModel.isSubmitting {
                        ProgressView()
                    } else {
                        Text("Verify and sign in")
                    }
                }
                .disabled(viewModel.isSubmitting || !viewModel.isVerificationCodeComplete)

                Button(
                    viewModel.resendCooldown > 0
                        ? "Resend in \(viewModel.resendCooldown)s"
                        : "Resend code"
                ) {
                    Task { await viewModel.resendSignupCode() }
                }
                .disabled(viewModel.isSubmitting || viewModel.resendCooldown > 0)

                Button("Back to sign in", role: .cancel) {
                    viewModel.cancelSignupVerification()
                }
                .disabled(viewModel.isSubmitting)
            } footer: {
                // Says the account survives leaving, because the obvious worry
                // at this point is that going back throws the signup away.
                Text("Your account is already created. You can come back and enter a code any time by signing in.")
            }
        }
        .navigationTitle("Confirm your email")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { codeFieldFocused = true }
    }
}
