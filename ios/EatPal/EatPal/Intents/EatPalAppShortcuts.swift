import AppIntents

/// US-142 + US-233: Exposes the EatPal App Intents to Siri and the Shortcuts
/// app. Phrases are pre-filled so users can trigger them without configuring
/// a shortcut first — Siri surface appears in Settings › Siri › EatPal.
struct EatPalAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddGroceryItemIntent(),
            phrases: [
                "Add to \(.applicationName) grocery",
                "Add to my \(.applicationName) list",
                "Put on my \(.applicationName) grocery list"
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
                "Log \(\.$slot) in \(.applicationName)",
                "Record \(\.$slot) in \(.applicationName)",
                "Mark \(\.$slot) in \(.applicationName)"
            ],
            shortTitle: "Log meal result",
            systemImageName: "checkmark.circle.fill"
        )

        // US-233: pantry-status intents — `\(\.$food)` gets resolved by
        // `FoodEntityQuery.entities(matching:)` so a spoken food name maps
        // to the user's actual pantry record.
        AppShortcut(
            intent: MarkFoodSafeIntent(),
            phrases: [
                "Mark \(\.$food) as a safe food in \(.applicationName)",
                "Mark \(\.$food) safe in \(.applicationName)",
                "\(.applicationName) safe food \(\.$food)"
            ],
            shortTitle: "Mark food safe",
            systemImageName: "checkmark.shield.fill"
        )

        AppShortcut(
            intent: MarkFoodTryBiteIntent(),
            phrases: [
                "Mark \(\.$food) as a try-bite in \(.applicationName)",
                "Flag \(\.$food) as a try-bite in \(.applicationName)",
                "\(.applicationName) try-bite \(\.$food)"
            ],
            shortTitle: "Mark try-bite",
            systemImageName: "star.fill"
        )

        AppShortcut(
            intent: TodaysPlanIntent(),
            phrases: [
                "What's planned in \(.applicationName) today",
                "Today's \(.applicationName) plan",
                "\(.applicationName) meal plan today"
            ],
            shortTitle: "Today's plan",
            systemImageName: "calendar"
        )
    }
}
