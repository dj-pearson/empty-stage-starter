import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var appState: AppState
    @State private var showingSignOutAlert = false
    @State private var showingDeleteDataAlert = false

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
                    Text("1.0.0")
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
}

// MARK: - Notification Settings

struct NotificationSettingsView: View {
    @AppStorage("notificationsEnabled") private var notificationsEnabled = true
    @AppStorage("mealReminders") private var mealReminders = true
    @AppStorage("groceryReminders") private var groceryReminders = false

    var body: some View {
        Form {
            Section {
                Toggle("Enable Notifications", isOn: $notificationsEnabled)
            }

            Section("Meal Planning") {
                Toggle("Meal Reminders", isOn: $mealReminders)
                    .disabled(!notificationsEnabled)
            }

            Section("Grocery") {
                Toggle("Grocery Reminders", isOn: $groceryReminders)
                    .disabled(!notificationsEnabled)
            }
        }
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.inline)
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
