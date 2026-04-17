import AppIntents

/// US-142: Exposes the three EatPal App Intents to Siri and the Shortcuts
/// app. Phrases are pre-filled so users can trigger them without configuring
/// a shortcut first — Siri surface appears in Settings › Siri › EatPal.
struct EatPalAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddGroceryItemIntent(),
            phrases: [
                "Add \(\.$item) to \(.applicationName) grocery",
                "Add \(\.$item) to my \(.applicationName) list",
                "Put \(\.$item) on my \(.applicationName) grocery list"
            ],
            shortTitle: "Add to grocery",
            systemImageName: "cart.fill.badge.plus"
        )

        AppShortcut(
            intent: WhatsForDinnerIntent(),
            phrases: [
                "What's for dinner in \(.applicationName)",
                "What am I making for dinner in \(.applicationName)",
                "\(.applicationName) dinner tonight"
            ],
            shortTitle: "What's for dinner",
            systemImageName: "fork.knife"
        )

        AppShortcut(
            intent: LogMealResultIntent(),
            phrases: [
                "Log \(\.$slot) as \(\.$result) in \(.applicationName)",
                "Mark \(\.$slot) \(\.$result) in \(.applicationName)",
                "Record \(\.$slot) in \(.applicationName)"
            ],
            shortTitle: "Log meal result",
            systemImageName: "checkmark.circle.fill"
        )
    }

    static var shortcutTileColor: ShortcutTileColor = .green
}
