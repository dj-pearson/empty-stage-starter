import SwiftUI
import AppIntents

/// US-233: Settings → Voice & Shortcuts. Lists every EatPal AppIntent with
/// example phrases and an inline `SiriTipView` that invites the user to set
/// up a voice shortcut without leaving the app.
struct VoiceShortcutsSettingsView: View {
    var body: some View {
        Form {
            Section {
                ShortcutsLink()
                    .shortcutsLinkStyle(.automaticOutline)
                    .frame(maxWidth: .infinity, minHeight: 64)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                    .accessibilityLabel("Open the Shortcuts app to manage EatPal voice commands")
            } header: {
                Text("Manage in Shortcuts")
            } footer: {
                Text("Set up custom phrases or chain EatPal commands with other automations in the Shortcuts app.")
            }

            ForEach(VoiceShortcut.all) { shortcut in
                Section {
                    HStack(alignment: .top, spacing: 12) {
                        ZStack {
                            Circle()
                                .fill(shortcut.tint.opacity(0.18))
                                .frame(width: 36, height: 36)
                            Image(systemName: shortcut.icon)
                                .foregroundStyle(shortcut.tint)
                        }

                        VStack(alignment: .leading, spacing: 4) {
                            Text(shortcut.title)
                                .font(.subheadline)
                                .fontWeight(.semibold)

                            Text(shortcut.summary)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        Spacer()
                    }

                    ForEach(shortcut.phrases, id: \.self) { phrase in
                        Label("\u{201C}\(phrase)\u{201D}", systemImage: "quote.bubble")
                            .font(.callout)
                            .foregroundStyle(.primary)
                            .accessibilityLabel("Example phrase: \(phrase)")
                    }

                    // SiriTipView is the system component that invites the user
                    // to set up a Siri voice shortcut for the given intent —
                    // tapping it opens the inline "Add to Siri" UI.
                    SiriTipView(intent: shortcut.intent, isVisible: .constant(true))
                        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                }
            }

            Section {
                Text("Voice commands run in the background — your data stays on this device until the action completes.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Voice & Shortcuts")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Catalog

/// One row per registered intent. Mirrors `EatPalAppShortcuts` so adding a
/// new intent is a two-step process (register + describe here) — keeps the
/// settings page exhaustive without runtime introspection.
private struct VoiceShortcut: Identifiable {
    let id: String
    let title: String
    let icon: String
    let tint: Color
    let summary: String
    let phrases: [String]
    /// Type-erased intent passed straight to `SiriTipView`. Each intent's
    /// concrete type is held internally by AppIntents.
    let intent: any AppIntent

    static let all: [VoiceShortcut] = [
        VoiceShortcut(
            id: "add_grocery",
            title: "Add to grocery",
            icon: "cart.fill.badge.plus",
            tint: .green,
            summary: "Hands-free way to add anything to your grocery list mid-cooking.",
            phrases: [
                "Hey Siri, add milk to my EatPal grocery list.",
                "Hey Siri, put two pounds of chicken on my EatPal list."
            ],
            intent: AddGroceryItemIntent()
        ),
        VoiceShortcut(
            id: "whats_for_dinner",
            title: "What's for dinner",
            icon: "fork.knife",
            tint: .orange,
            summary: "Spoken summary of tonight's planned dinner across every kid.",
            phrases: [
                "Hey Siri, what's for dinner in EatPal?",
                "Hey Siri, EatPal dinner tonight."
            ],
            intent: WhatsForDinnerIntent()
        ),
        VoiceShortcut(
            id: "todays_plan",
            title: "Today's plan",
            icon: "calendar",
            tint: .blue,
            summary: "Read out every meal across breakfast, lunch, dinner, and snacks.",
            phrases: [
                "Hey Siri, what's planned in EatPal today?",
                "Hey Siri, today's EatPal plan."
            ],
            intent: TodaysPlanIntent()
        ),
        VoiceShortcut(
            id: "log_meal",
            title: "Log a meal result",
            icon: "checkmark.circle.fill",
            tint: .green,
            summary: "Mark today's planned meal as eaten, tasted, or refused without opening the app.",
            phrases: [
                "Hey Siri, log lunch in EatPal.",
                "Hey Siri, mark dinner in EatPal."
            ],
            intent: LogMealResultIntent()
        ),
        VoiceShortcut(
            id: "mark_safe",
            title: "Mark a food as safe",
            icon: "checkmark.shield.fill",
            tint: .blue,
            summary: "Add a known-good food to your safe-foods list — Siri matches it against your pantry.",
            phrases: [
                "Hey Siri, mark broccoli as a safe food in EatPal.",
                "Hey Siri, EatPal safe food rice."
            ],
            intent: MarkFoodSafeIntent()
        ),
        VoiceShortcut(
            id: "mark_try_bite",
            title: "Mark a try-bite",
            icon: "star.fill",
            tint: .yellow,
            summary: "Flag a food as a try-bite — Siri matches against your pantry by spoken name.",
            phrases: [
                "Hey Siri, mark cucumber as a try-bite in EatPal.",
                "Hey Siri, flag tofu as a try-bite in EatPal."
            ],
            intent: MarkFoodTryBiteIntent()
        )
    ]
}

#Preview {
    NavigationStack {
        VoiceShortcutsSettingsView()
    }
}
