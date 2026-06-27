import Foundation
import SwiftUI

/// Handles deep links and universal links for the app.
/// Supports URL scheme: eatpal:// and universal links: https://tryeatpal.com/app/
@MainActor
final class DeepLinkHandler: ObservableObject {
    static let shared = DeepLinkHandler()

    @Published var activeDestination: Destination?

    enum Destination: Equatable {
        case dashboard
        case pantry
        case mealPlan(date: String?)
        case recipes
        case grocery
        case kidProfile(id: String)
        case scanner
        case settings
        case quiz
        case foodChaining
        /// US-406: progress/achievements surface, opened by streak/badge
        /// notifications and `eatpal://progress`.
        case progress
        /// US-462: remaining More-tab tools now deep-linkable so notifications,
        /// widgets, and Siri shortcuts can open them directly instead of
        /// dead-ending on the More root. Routed onto the More tab's path.
        case foodTracker
        case insights
        case aiCoach
        /// US-296 (Tier 1): parsed grocery import via `eatpal://grocery/import?text=...`.
        /// The handler enqueues the parsed lines into `PendingGroceryImportQueue`
        /// and asks the app to switch to the grocery tab so the user sees the
        /// drained items appear with the standard toast.
        case groceryImport(itemCount: Int)
        /// US-309: parsed recipe import via `eatpal://recipe/import?url=...`.
        /// The handler calls `RecipeParseAPI.parseRecipe(url:)` inline, enqueues
        /// the result into `PendingRecipeImportQueue`, and asks the app to
        /// switch to the recipes tab so the drain-on-launch toast lands in the
        /// right place. `recipeName` is the parsed name (best-effort) so the
        /// router can surface "Imported <name>" without re-reading the queue.
        case recipeImport(recipeName: String)
    }

    private init() {}

    /// Parses a URL and navigates to the appropriate destination.
    func handle(url: URL) {
        // Handle eatpal:// scheme
        if url.scheme == "eatpal" {
            handleCustomScheme(url)
            return
        }

        // Handle universal links: https://tryeatpal.com/app/...
        if url.host == "tryeatpal.com", url.pathComponents.count > 1 {
            handleUniversalLink(url)
            return
        }
    }

    private func handleCustomScheme(_ url: URL) {
        guard let host = url.host else { return }

        switch host {
        case "dashboard":
            activeDestination = .dashboard
        case "pantry":
            activeDestination = .pantry
        case "meal-plan":
            let date = url.queryValue(for: "date")
            activeDestination = .mealPlan(date: date)
        case "recipes":
            activeDestination = .recipes
        case "grocery":
            // US-296 (Tier 1): `eatpal://grocery/import?text=<url-encoded>` pipes
            // a multi-line text blob through `GroceryTextParser` and enqueues
            // it for the standard drain-on-launch path. The shortcuts ecosystem
            // (Shortcuts.app `Open URL`, Notes Action button, custom widgets)
            // can hand off raw text via this URL without needing the AppIntent.
            if url.pathComponents.contains("import"),
               let raw = url.queryValue(for: "text"),
               !raw.isEmpty {
                enqueueGroceryImport(text: raw, source: "deeplink:grocery")
            } else {
                activeDestination = .grocery
            }
        case "recipe":
            // US-309: `eatpal://recipe/import?url=<url-encoded>` parses a
            // recipe URL via the public parse-recipe edge function and
            // enqueues it onto the share-extension's drain path. Runs in a
            // background Task so the URL-open call returns immediately.
            if url.pathComponents.contains("import"),
               let raw = url.queryValue(for: "url"),
               let sourceURL = URL(string: raw),
               (sourceURL.scheme == "https" || sourceURL.scheme == "http") {
                Task { await handleRecipeImport(sourceURL: sourceURL) }
            } else {
                activeDestination = .recipes
            }
        case "kid":
            if let id = url.queryValue(for: "id") {
                activeDestination = .kidProfile(id: id)
            }
        case "scanner":
            activeDestination = .scanner
        case "settings":
            activeDestination = .settings
        case "quiz":
            activeDestination = .quiz
        case "food-chaining":
            activeDestination = .foodChaining
        case "progress":
            activeDestination = .progress
        case "food-tracker":
            activeDestination = .foodTracker
        case "insights":
            activeDestination = .insights
        case "ai-coach":
            activeDestination = .aiCoach
        default:
            break
        }
    }

    // MARK: - Notification routing (US-406)

    /// Maps a local-notification `categoryIdentifier` to a navigation
    /// destination so tapping a reminder lands on the relevant screen. Reuses
    /// the same `activeDestination` consumption path as deep links. Topic
    /// categories are the uppercased `NotificationService.Topic` raw values.
    func routeFromNotification(categoryIdentifier: String) {
        switch categoryIdentifier {
        case "MEALREMINDERS", "MEAL_REMINDER":
            activeDestination = .mealPlan(date: nil)
        case "GROCERYREADY", "GROCERY_REMINDER":
            activeDestination = .grocery
        case "EXPIRINGFOOD":
            activeDestination = .pantry
        case "AISUMMARY":
            activeDestination = .dashboard
        case "STREAKMILESTONE", "TRYBITE":
            activeDestination = .progress
        default:
            break
        }
    }

    // MARK: - Grocery import (US-296 Tier 1)

    /// Parses the supplied free-text into `ParsedGroceryItem`s, persists them
    /// to the shared `PendingGroceryImportQueue`, and flips the active
    /// destination to `.groceryImport(itemCount:)` so the routing layer can
    /// surface a toast / tab switch. The actual DB insert happens in
    /// `AppState.drainPendingGroceryImports()` on the next foreground tick,
    /// reusing the share-extension's proven path.
    private func enqueueGroceryImport(text: String, source: String) {
        let parsed = GroceryTextParser.parse(text)
        guard !parsed.isEmpty else {
            // Fall back to opening the grocery tab so the user can see the
            // empty paste banner and edit/retry from there.
            activeDestination = .grocery
            return
        }

        let pending = PendingGroceryImport(
            items: parsed.map {
                PendingGroceryImport.ParsedLine(
                    name: $0.name,
                    quantity: $0.quantity,
                    unit: $0.unit,
                    category: $0.category
                )
            },
            sourceLabel: source
        )
        PendingGroceryImportQueue.enqueue(pending)
        activeDestination = .groceryImport(itemCount: parsed.count)
    }

    // MARK: - Recipe import (US-309)

    /// Calls the public `parse-recipe` edge function against the supplied URL,
    /// enqueues the result onto `PendingRecipeImportQueue`, and surfaces a
    /// toast. Failure case offers an "open in Safari" fallback so the user
    /// can still get to the page — the parser falling over on a particular
    /// site shouldn't dead-end the workflow.
    private func handleRecipeImport(sourceURL: URL) async {
        AnalyticsService.track(.deeplinkRecipeImportReceived)
        let started = Date()
        do {
            let parsed = try await RecipeParseAPI.parseRecipe(url: sourceURL)
            let pending = PendingRecipeImport(
                sourceUrl: sourceURL.absoluteString,
                name: parsed.name,
                description: parsed.description,
                imageUrl: parsed.imageUrl,
                instructions: parsed.instructions,
                prepTime: parsed.prepTime,
                cookTime: parsed.cookTime,
                servings: parsed.servings,
                additionalIngredients: parsed.ingredients.isEmpty
                    ? nil
                    : parsed.ingredients.joined(separator: "\n")
            )
            PendingRecipeImportQueue.enqueue(pending)

            let elapsedMs = Int(Date().timeIntervalSince(started) * 1000)
            AnalyticsService.track(.deeplinkRecipeImportSucceeded(timeMs: elapsedMs))

            ToastManager.shared.success(
                "Imported \(parsed.name)",
                message: "Open Recipes to see it"
            )
            activeDestination = .recipeImport(recipeName: parsed.name)
        } catch {
            AnalyticsService.track(
                .deeplinkRecipeImportFailed(reason: shortFailureReason(for: error))
            )
            ToastManager.shared.error(
                "Couldn't parse recipe",
                message: "Open in Safari?",
                retry: { @MainActor in
                    UIApplication.shared.open(sourceURL)
                }
            )
        }
    }

    /// Bucket the error into a small set of stable reason codes so the
    /// dashboard can group failures without leaking URLs or PII.
    private func shortFailureReason(for error: Error) -> String {
        if let importError = error as? RecipeParseAPI.ImportError {
            switch importError {
            case .missingConfig:      return "missing_config"
            case .badResponse:        return "bad_response"
            case .network:            return "network"
            case .decode:             return "decode"
            }
        }
        return "unknown"
    }

    private func handleUniversalLink(_ url: URL) {
        let components = url.pathComponents.filter { $0 != "/" }
        guard components.first == "app", components.count > 1 else { return }

        switch components[1] {
        case "dashboard":
            activeDestination = .dashboard
        case "pantry":
            activeDestination = .pantry
        case "meal-plan":
            let date = url.queryValue(for: "date")
            activeDestination = .mealPlan(date: date)
        case "recipes":
            activeDestination = .recipes
        case "grocery":
            activeDestination = .grocery
        case "kid":
            if components.count > 2 {
                activeDestination = .kidProfile(id: components[2])
            }
        case "scanner":
            activeDestination = .scanner
        case "quiz":
            activeDestination = .quiz
        case "food-chaining":
            activeDestination = .foodChaining
        case "settings":
            activeDestination = .settings
        case "progress":
            activeDestination = .progress
        case "food-tracker":
            activeDestination = .foodTracker
        case "insights":
            activeDestination = .insights
        case "ai-coach":
            activeDestination = .aiCoach
        default:
            break
        }
    }

    func clearDestination() {
        activeDestination = nil
    }
}

// MARK: - URL Extension

extension URL {
    func queryValue(for key: String) -> String? {
        URLComponents(url: self, resolvingAgainstBaseURL: false)?
            .queryItems?
            .first { $0.name == key }?
            .value
    }
}
