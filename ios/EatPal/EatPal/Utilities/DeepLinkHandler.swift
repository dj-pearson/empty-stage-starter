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
        /// US-296 (Tier 1): parsed grocery import via `eatpal://grocery/import?text=...`.
        /// The handler enqueues the parsed lines into `PendingGroceryImportQueue`
        /// and asks the app to switch to the grocery tab so the user sees the
        /// drained items appear with the standard toast.
        case groceryImport(itemCount: Int)
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
