import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var appState: AppState
    @State private var showingSignOutAlert = false
    @State private var showingDeleteDataAlert = false
    @State private var showingPaywall = false
    @StateObject private var store = StoreKitService.shared

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
                        Text(authViewModel.email.isEmpty ? "Signed In" : authViewModel.email)
                            .font(.body)
                            .fontWeight(.medium)

                        Text("Manage your account")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
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
                    Label("Terms of Service", systemImage: "doc.text.fill")
                }
            }

            // Danger Zone
            Section {
                Button(role: .destructive) {
                    showingSignOutAlert = true
                } label: {
                    Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.forward")
                }
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
    }

    private var appVersion: String {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(version) (\(build))"
    }
}

// MARK: - Notification Settings

struct NotificationSettingsView: View {
    @AppStorage("notificationsEnabled") private var notificationsEnabled = false
    @AppStorage("mealReminders") private var mealReminders = true
    @AppStorage("groceryReminders") private var groceryReminders = false
    @StateObject private var notificationService = NotificationService.shared
    @State private var showingPermissionAlert = false

    var body: some View {
        Form {
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

            Section("Meal Planning") {
                Toggle("Meal Reminders", isOn: $mealReminders)
                    .disabled(!notificationsEnabled)
                    .onChange(of: mealReminders) { _, enabled in
                        Task {
                            if enabled && notificationsEnabled {
                                await notificationService.scheduleMealReminders()
                            } else {
                                notificationService.cancelMealReminders()
                            }
                        }
                    }

                if mealReminders && notificationsEnabled {
                    Text("Reminders at 8:00 AM, 12:00 PM, and 6:00 PM")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Section("Grocery") {
                Toggle("Grocery Reminders", isOn: $groceryReminders)
                    .disabled(!notificationsEnabled)
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
