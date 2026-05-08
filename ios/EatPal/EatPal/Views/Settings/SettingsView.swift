import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var appState: AppState
    @State private var showingSignOutAlert = false
    @State private var showingDeleteDataAlert = false
    @State private var showingPaywall = false
    @State private var showingDeleteAccountAlert = false
    @State private var isDeletingAccount = false
    @State private var deleteAccountError: String?
    @StateObject private var store = StoreKitService.shared

    /// Prefers the real session email over the login form field so users
    /// who signed in with Apple still see their email here.
    private var displayedAccountLabel: String {
        if let email = authViewModel.sessionEmail, !email.isEmpty {
            return email
        }
        if !authViewModel.email.isEmpty {
            return authViewModel.email
        }
        return "Signed In"
    }

    var body: some View {
        Form {
            // Account Section
            Section("Account") {
                HStack {
                    ZStack {
                        Circle()
                            .fill(Color.green.opacity(0.2))
                            .frame(width: 44, height: 44)

                        Image(systemName: "person.fill")
                            .foregroundStyle(.green)
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text(displayedAccountLabel)
                            .font(.body)
                            .fontWeight(.medium)

                        Text("Manage your account")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            // Bind email + set password CTA — only shown for Apple users
            // who still have a privaterelay address or no password set.
            if authViewModel.needsEmailBind || authViewModel.needsPassword {
                Section {
                    NavigationLink {
                        BindEmailView(
                            mode: authViewModel.needsEmailBind ? .full : .passwordOnly
                        )
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "envelope.badge.shield.half.filled")
                                .foregroundStyle(.blue)
                                .frame(width: 28)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(authViewModel.needsEmailBind ? "Bind a real email" : "Set a password")
                                    .font(.body)
                                    .fontWeight(.medium)
                                Text(authViewModel.needsEmailBind
                                     ? "Swap your Apple relay address for a real one and set a password."
                                     : "You signed up with Apple. Set a password to enable email sign-in too.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                } header: {
                    Text("Email & Password")
                }
            }

            // App Info
            Section("App Info") {
                LabeledContent("Version") {
                    Text(appVersion)
                        .foregroundStyle(.secondary)
                }

                LabeledContent("Foods") {
                    Text("\(appState.foods.count)")
                        .foregroundStyle(.secondary)
                }

                LabeledContent("Recipes") {
                    Text("\(appState.recipes.count)")
                        .foregroundStyle(.secondary)
                }

                LabeledContent("Children") {
                    Text("\(appState.kids.count)")
                        .foregroundStyle(.secondary)
                }
            }

            // Subscription
            Section("Subscription") {
                Button {
                    showingPaywall = true
                } label: {
                    HStack {
                        Label("Plan", systemImage: "crown.fill")
                        Spacer()
                        Text(store.currentTier.displayName)
                            .foregroundStyle(.secondary)
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                }
                .foregroundStyle(.primary)
            }

            // Preferences
            Section("Preferences") {
                NavigationLink {
                    NotificationSettingsView()
                } label: {
                    Label("Notifications", systemImage: "bell.fill")
                }

                NavigationLink {
                    AppearanceSettingsView()
                } label: {
                    Label("Appearance", systemImage: "paintbrush.fill")
                }

                NavigationLink {
                    HealthSettingsView()
                } label: {
                    Label("Sync to Health", systemImage: "heart.text.square.fill")
                }

                NavigationLink {
                    VoiceShortcutsSettingsView()
                } label: {
                    Label("Voice & Shortcuts", systemImage: "mic.badge.plus")
                }

                NavigationLink {
                    BudgetView()
                } label: {
                    Label("Budget", systemImage: "dollarsign.circle.fill")
                }

                NavigationLink {
                    HouseholdSettingsView()
                } label: {
                    Label("Household", systemImage: "house.fill")
                }
            }

            // Support
            Section("Support") {
                Link(destination: URL(string: "https://tryeatpal.com")!) {
                    Label("Visit Website", systemImage: "globe")
                }

                Link(destination: URL(string: "https://tryeatpal.com/privacy")!) {
                    Label("Privacy Policy", systemImage: "hand.raised.fill")
                }

                Link(destination: URL(string: "https://tryeatpal.com/terms")!) {
                    Label("Terms of Use (EULA)", systemImage: "doc.text.fill")
                }
            }

            // Danger Zone
            Section {
                Button(role: .destructive) {
                    showingSignOutAlert = true
                } label: {
                    Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.forward")
                }

                Button(role: .destructive) {
                    showingDeleteAccountAlert = true
                } label: {
                    HStack {
                        Label("Delete Account", systemImage: "trash.fill")
                        if isDeletingAccount {
                            Spacer()
                            ProgressView()
                        }
                    }
                }
                .disabled(isDeletingAccount)
            } footer: {
                Text("Deleting your account permanently removes your profile, meal plans, pantry, recipes, grocery lists, and children's profiles. This can't be undone.")
            }
        }
        .navigationTitle("Settings")
        .accessibilityIdentifier("settingsForm")
        .sheet(isPresented: $showingPaywall) {
            PaywallView()
        }
        .alert("Sign Out?", isPresented: $showingSignOutAlert) {
            Button("Sign Out", role: .destructive) {
                Task {
                    appState.clearData()
                    await authViewModel.signOut()
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("You will need to sign in again to access your data.")
        }
        .alert("Delete your account?", isPresented: $showingDeleteAccountAlert) {
            Button("Delete Account", role: .destructive) {
                Task { await performDeleteAccount() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This permanently deletes your account and all of your data. You can't undo this action.")
        }
        .alert(
            "Couldn't delete account",
            isPresented: Binding(
                get: { deleteAccountError != nil },
                set: { if !$0 { deleteAccountError = nil } }
            )
        ) {
            Button("OK", role: .cancel) { deleteAccountError = nil }
        } message: {
            Text(deleteAccountError ?? "")
        }
    }

    private func performDeleteAccount() async {
        isDeletingAccount = true
        defer { isDeletingAccount = false }

        do {
            try await authViewModel.deleteAccount()
            // Successful delete signs out server-side; clear local caches so
            // stale AppState doesn't linger after the auth listener flips us
            // back to the login screen.
            appState.clearData()
        } catch {
            // Standardize the friendly error string + Sentry breadcrumb.
            // Sentry's `extras` context is preserved alongside the AppError tag.
            let appError = AppError.wrap(error, as: { .delete(entity: "account", underlying: $0) })
            deleteAccountError = appError.errorDescription
            SentryService.capture(error, extras: ["context": "settings_delete_account"])
        }
    }

    private var appVersion: String {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(version) (\(build))"
    }
}

// MARK: - Notification Settings (US-239)

struct NotificationSettingsView: View {
    @AppStorage("notificationsEnabled") private var notificationsEnabled = false
    @StateObject private var notificationService = NotificationService.shared
    @State private var showingPermissionAlert = false
    @State private var muteRefreshTick = 0  // forces re-render when we toggle mute

    private var mutedUntil: Date? { notificationService.mutedUntil }

    var body: some View {
        Form {
            // Master toggle + system-permission state
            Section {
                Toggle("Enable Notifications", isOn: $notificationsEnabled)
                    .onChange(of: notificationsEnabled) { _, enabled in
                        Task {
                            if enabled {
                                let granted = await notificationService.requestAuthorization()
                                if !granted {
                                    notificationsEnabled = false
                                    showingPermissionAlert = true
                                }
                            } else {
                                notificationService.cancelAll()
                            }
                        }
                    }

                if notificationService.authorizationStatus == .denied {
                    Label(
                        "Notifications are disabled in system settings.",
                        systemImage: "exclamationmark.triangle"
                    )
                    .font(.caption)
                    .foregroundStyle(.orange)

                    Button("Open Settings") {
                        if let url = URL(string: UIApplication.openSettingsURLString) {
                            UIApplication.shared.open(url)
                        }
                    }
                    .font(.callout)
                }
            }

            // Mute-all chip
            if notificationsEnabled {
                Section {
                    if let until = mutedUntil {
                        HStack {
                            Label {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Muted until \(until, style: .time)")
                                        .font(.subheadline)
                                    Text(until, style: .relative)
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                            } icon: {
                                Image(systemName: "bell.slash.fill")
                                    .foregroundStyle(.orange)
                            }
                            Spacer()
                            Button("Unmute") {
                                notificationService.unmute()
                                muteRefreshTick += 1
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                        }
                    } else {
                        Button {
                            notificationService.mute(forSeconds: 24 * 60 * 60)
                            muteRefreshTick += 1
                            HapticManager.warning()
                        } label: {
                            Label("Mute all for 24h", systemImage: "bell.slash")
                        }
                    }
                }
            }

            // Per-topic toggles
            ForEach(NotificationService.Topic.allCases) { topic in
                NotificationTopicSection(
                    topic: topic,
                    masterEnabled: notificationsEnabled
                )
            }
        }
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await notificationService.checkAuthorizationStatus()
            if notificationService.isAuthorized {
                notificationsEnabled = true
            }
        }
        .alert("Notifications Disabled", isPresented: $showingPermissionAlert) {
            Button("Open Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Please enable notifications in Settings to receive meal and grocery reminders.")
        }
        .id(muteRefreshTick)  // re-evaluate body when mute state changes
    }
}

/// Per-topic settings row — toggle, optional time picker, and a Test button.
private struct NotificationTopicSection: View {
    let topic: NotificationService.Topic
    let masterEnabled: Bool

    @AppStorage private var enabled: Bool
    @AppStorage private var hour: Int
    @AppStorage private var minute: Int

    @State private var didFireTest = false

    init(topic: NotificationService.Topic, masterEnabled: Bool) {
        self.topic = topic
        self.masterEnabled = masterEnabled
        self._enabled = AppStorage(wrappedValue: false, topic.enabledKey)
        self._hour = AppStorage(wrappedValue: topic.defaultHour, topic.hourKey)
        self._minute = AppStorage(wrappedValue: topic.defaultMinute, topic.minuteKey)
    }

    private var pickerBinding: Binding<Date> {
        Binding(
            get: {
                var comps = DateComponents()
                comps.hour = hour
                comps.minute = minute
                return Calendar.current.date(from: comps) ?? Date()
            },
            set: { newValue in
                let comps = Calendar.current.dateComponents([.hour, .minute], from: newValue)
                hour = comps.hour ?? topic.defaultHour
                minute = comps.minute ?? topic.defaultMinute
            }
        )
    }

    var body: some View {
        Section {
            Toggle(isOn: $enabled) {
                Label {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(topic.title)
                        Text(topic.subtitle)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                } icon: {
                    Image(systemName: topic.icon)
                        .foregroundStyle(.green)
                }
            }
            .disabled(!masterEnabled)

            if enabled, masterEnabled, topic.supportsDailyTime {
                DatePicker(
                    "Daily time",
                    selection: pickerBinding,
                    displayedComponents: .hourAndMinute
                )
            }

            if enabled, masterEnabled {
                Button {
                    Task {
                        await NotificationService.shared.fireTestNotification(for: topic)
                        didFireTest = true
                    }
                } label: {
                    HStack {
                        Image(systemName: didFireTest ? "checkmark.circle.fill" : "paperplane")
                        Text(didFireTest ? "Test sent — check notification center" : "Send test notification")
                    }
                    .font(.callout)
                }
            }
        }
    }
}

// MARK: - Appearance Settings

struct AppearanceSettingsView: View {
    @AppStorage("appTheme") private var appTheme = "system"

    var body: some View {
        Form {
            Section("Theme") {
                Picker("Appearance", selection: $appTheme) {
                    Text("System").tag("system")
                    Text("Light").tag("light")
                    Text("Dark").tag("dark")
                }
                .pickerStyle(.inline)
            }
        }
        .navigationTitle("Appearance")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NavigationStack {
        SettingsView()
    }
    .environmentObject(AuthViewModel())
    .environmentObject(AppState())
}
