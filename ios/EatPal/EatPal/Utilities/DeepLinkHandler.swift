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
            activeDestination = .grocery
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
