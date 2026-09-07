import Foundation

/// US-143 / US-309: Minimal HTTP client for `functions/parse-recipe`.
///
/// Originally lived in the share extension (`EatPalShare/ShareExtensionAPI.swift`)
/// where it only needed to round-trip a URL → parsed recipe. US-309 promoted
/// the file into `Shared/` so the MAIN app target can also call it from the
/// `eatpal://recipe/import?url=...` deep-link handler and from the
/// `ImportRecipeFromURLIntent` AppIntent — same code path, two callers, no
/// duplication.
///
/// US-807: the caller is identified by the access token the main app publishes
/// to the App Group (`SharedAuthTokenStore`), falling back to the anon key from
/// each target's Info.plist when there is no session or the token has gone
/// stale. It used to send the anon key unconditionally, on the strength of a
/// US-014 note saying the function was public; `parse-recipe` began requiring a
/// real user in July 2026 and every caller here answered 401 from then until
/// US-806. The share extension's tight memory budget still rules out pulling in
/// supabase-swift — pure URLSession is the right tool for all three call sites.
public struct ParsedRecipe: Codable, Equatable {
    public let name: String
    public let description: String?
    public let imageUrl: String?
    public let instructions: String?
    public let prepTime: String?
    public let cookTime: String?
    public let servings: String?
    public let ingredients: [String]

    public init(
        name: String,
        description: String? = nil,
        imageUrl: String? = nil,
        instructions: String? = nil,
        prepTime: String? = nil,
        cookTime: String? = nil,
        servings: String? = nil,
        ingredients: [String] = []
    ) {
        self.name = name
        self.description = description
        self.imageUrl = imageUrl
        self.instructions = instructions
        self.prepTime = prepTime
        self.cookTime = cookTime
        self.servings = servings
        self.ingredients = ingredients
    }

    enum CodingKeys: String, CodingKey {
        case name, description, ingredients, instructions, servings
        case imageUrl = "image_url"
        case prepTime = "prep_time"
        case cookTime = "cook_time"
    }
}

public enum RecipeParseAPI {
    public enum ImportError: Error, LocalizedError {
        case missingConfig
        case notSignedIn
        case busy
        case badResponse(Int)
        case network(String)
        case decode(String)

        public var errorDescription: String? {
            switch self {
            case .missingConfig:
                return "Recipe import isn't configured yet. Reinstall EatPal."
            case .notSignedIn:
                return "Open EatPal and sign in, then share this recipe again."
            case .busy:
                return "Recipe import is busy. Open EatPal and sign in, or try again in a few minutes."
            case .badResponse(let status):
                return "The recipe service returned an error (\(status))."
            case .network(let detail):
                return "Network error: \(detail)"
            case .decode(let detail):
                return "Couldn't read the recipe: \(detail)"
            }
        }
    }

    /// Maps the statuses this endpoint uses to say "who are you" and "not right
    /// now" onto messages that tell the user what to do about it. A bare
    /// "error (401)" told them nothing.
    static func importError(forStatus status: Int) -> ImportError {
        switch status {
        case 401, 403: return .notSignedIn
        case 429: return .busy
        default: return .badResponse(status)
        }
    }

    /// Calls the Supabase edge function `parse-recipe` with the URL the user
    /// wants to import. Returns the parsed recipe payload; the caller is
    /// responsible for enqueuing it into `PendingRecipeImportQueue` (so the
    /// main app + share extension share the same drain path).
    ///
    /// Hits `functions.tryeatpal.com/<name>` directly — Kong's `/functions/v1/*`
    /// upstream is broken on this Coolify Supabase deployment, see
    /// `EdgeFunctions.swift` in the main app for context.
    public static func parseRecipe(url: URL) async throws -> ParsedRecipe {
        guard let functionsUrl = functionsBaseUrl(),
              let anonKey = supabaseAnonKey() else {
            throw ImportError.missingConfig
        }

        let endpoint = functionsUrl.appendingPathComponent("parse-recipe")
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // US-807: spend the user's own token when the app has published a live
        // one. `apikey` stays the anon key either way — that header identifies
        // the project, not the caller.
        let bearer = SharedAuthTokenStore.load()?.accessToken ?? anonKey
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")

        let body = ["url": url.absoluteString]
        request.httpBody = try? JSONEncoder().encode(body)
        // 60s — cold-start path is URL fetch + first-request esm.sh dep
        // download + Claude call, which can run 30–45s on a fresh container.
        request.timeoutInterval = 60

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let http = response as? HTTPURLResponse else {
            throw ImportError.network("Invalid response")
        }

        guard (200..<300).contains(http.statusCode) else {
            throw importError(forStatus: http.statusCode)
        }

        do {
            // Some implementations return a wrapper `{ "recipe": {...} }`.
            // Try direct decode first, then fall back to a wrapper lookup.
            if let parsed = try? JSONDecoder().decode(ParsedRecipe.self, from: data) {
                return parsed
            }
            let wrapper = try JSONDecoder().decode(ParseRecipeWrapper.self, from: data)
            return wrapper.recipe
        } catch {
            throw ImportError.decode(error.localizedDescription)
        }
    }

    // MARK: - Config lookup

    private static func functionsBaseUrl() -> URL? {
        // Explicit override first.
        if let raw = Bundle.main.object(forInfoDictionaryKey: "FUNCTIONS_URL") as? String,
           !raw.isEmpty,
           raw != "$(FUNCTIONS_URL)",
           let url = URL(string: raw) {
            return url
        }
        // Derive from SUPABASE_URL by swapping `api.` for `functions.`.
        if let raw = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String,
           !raw.isEmpty,
           raw != "$(SUPABASE_URL)" {
            let derived = raw.replacingOccurrences(of: "://api.", with: "://functions.")
            if let url = URL(string: derived) { return url }
        }
        return URL(string: "https://functions.tryeatpal.com")
    }

    private static func supabaseAnonKey() -> String? {
        guard let key = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String,
              !key.isEmpty,
              key != "$(SUPABASE_ANON_KEY)" else {
            return nil
        }
        return key
    }
}

private struct ParseRecipeWrapper: Codable {
    let recipe: ParsedRecipe
}
