import AppIntents
import Foundation

/// US-309: Shortcuts-facing wrapper around the `eatpal://recipe/import?url=...`
/// deep link.
///
/// Users who'd rather build a typed Shortcut than concatenate a URL ("URL →
/// Open" pattern) get the same end result: enqueue a `PendingRecipeImport`
/// that the main app drains on next foreground tick.
///
/// Runs in the background (`openAppWhenRun = false`) so a "Save link to
/// EatPal" automation can fire from the share-sheet of Safari / Reading List
/// / Notes without bringing the app to the foreground. The drain step still
/// requires a session, so the imported recipe surfaces the next time the user
/// opens EatPal — same contract as the share-extension path.
struct ImportRecipeFromURLIntent: AppIntent {
    static var title: LocalizedStringResource = "Import Recipe from URL"
    static var description = IntentDescription(
        "Sends a recipe URL to EatPal so it's parsed and queued for import.",
        categoryName: "Recipes"
    )
    static var openAppWhenRun: Bool = false

    @Parameter(
        title: "Recipe URL",
        description: "The recipe page to import — e.g. NYT Cooking, Bon Appétit, a personal blog."
    )
    var sourceURL: URL

    static var parameterSummary: some ParameterSummary {
        Summary("Import recipe in EatPal from \(\.$sourceURL)")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        // Reject anything that isn't a real HTTPS URL early — parse-recipe
        // assumes a public web page. http is accepted because some
        // self-hosted blogs still serve plain http; the edge function will
        // upgrade where it can.
        guard sourceURL.scheme == "https" || sourceURL.scheme == "http" else {
            return .result(dialog: "That doesn't look like a recipe URL. Try copying the page address from Safari.")
        }

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
            SentryService.leaveBreadcrumb(
                category: "intent",
                message: "ImportRecipeFromURLIntent: \(parsed.name)"
            )
            return .result(dialog: "Queued \(parsed.name). Open EatPal to see it in your recipes.")
        } catch {
            AnalyticsService.track(
                .deeplinkRecipeImportFailed(reason: Self.shortFailureReason(for: error))
            )
            SentryService.capture(error, extras: ["intent": "ImportRecipeFromURL"])
            // Surface a human-friendly message — the URL or the parse may have
            // failed, the user can fall back to opening the page manually.
            return .result(dialog: "I couldn't parse that recipe page. Try opening it in Safari and using Share → EatPal instead.")
        }
    }

    /// Bucket errors into a small reason vocabulary so the dashboard groups
    /// failures without leaking URLs into the event stream.
    private static func shortFailureReason(for error: Error) -> String {
        if let importError = error as? RecipeParseAPI.ImportError {
            switch importError {
            case .missingConfig: return "missing_config"
            case .badResponse:   return "bad_response"
            case .network:       return "network"
            case .decode:        return "decode"
            }
        }
        return "unknown"
    }
}
