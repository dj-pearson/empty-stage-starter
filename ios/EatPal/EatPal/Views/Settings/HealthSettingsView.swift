import SwiftUI

/// US-144: Settings screen for opting into HealthKit sync of logged meals.
/// The HealthKit authorization status is orthogonal to the user's opt-in:
/// we request permission the first time the toggle is flipped on, but also
/// respect cases where the user has denied at the system level.
struct HealthSettingsView: View {
    @State private var isEnabled: Bool = HealthKitService.shared.isEnabled
    @State private var showDeniedAlert = false
    @State private var statusMessage: String?

    private var service: HealthKitService { HealthKitService.shared }

    var body: some View {
        Form {
            Section {
                Toggle("Sync logged meals to Health", isOn: $isEnabled)
                    .disabled(!service.isAvailable)
            } header: {
                Text("Apple Health")
            } footer: {
                if !service.isAvailable {
                    Text("Health isn't available on this device.")
                } else if isEnabled {
                    Text("When you mark a meal as eaten, EatPal saves calories, protein, carbs, and fat from the linked recipe to your Health profile as a food entry.")
                } else {
                    Text("When enabled, logged meals with a linked recipe contribute nutrition to Health. You can turn this off at any time.")
                }
            }

            if let statusMessage {
                Section {
                    Label(statusMessage, systemImage: "exclamationmark.circle")
                        .foregroundStyle(.orange)
                        .font(.footnote)
                }
            }

            Section {
                Link(destination: URL(string: "x-apple-health://")!) {
                    Label("Open Health App", systemImage: "heart.text.square.fill")
                }
            } footer: {
                Text("You can revoke EatPal's Health access at any time in Settings › Privacy & Security › Health › EatPal.")
            }
        }
        .navigationTitle("Sync to Health")
        .onChange(of: isEnabled) { _, newValue in
            Task { await handleToggle(newValue) }
        }
        .alert("Health access denied", isPresented: $showDeniedAlert) {
            Button("Open Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("EatPal can't write to Health without your permission. You can grant access in iOS Settings under Privacy & Security › Health.")
        }
    }

    private func handleToggle(_ newValue: Bool) async {
        statusMessage = nil

        if !newValue {
            service.isEnabled = false
            return
        }

        guard service.isAvailable else {
            statusMessage = "Health isn't available on this device."
            isEnabled = false
            return
        }

        do {
            let granted = try await service.requestAuthorization()
            if granted {
                service.isEnabled = true
            } else {
                service.isEnabled = false
                isEnabled = false
                showDeniedAlert = true
            }
        } catch {
            service.isEnabled = false
            isEnabled = false
            statusMessage = error.localizedDescription
            SentryService.capture(error, extras: ["context": "healthkit_requestAuthorization"])
        }
    }
}

#Preview {
    NavigationStack {
        HealthSettingsView()
    }
}
