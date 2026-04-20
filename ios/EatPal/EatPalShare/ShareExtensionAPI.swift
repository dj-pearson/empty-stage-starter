import Foundation

/// US-143: Minimal HTTP client the share extension uses to call the public
/// `functions/parse-recipe` Supabase edge function. No Supabase SDK — the
/// extension memory budget is tight and the edge function doesn't require
/// an authenticated session (no JWT).
struct ParsedRecipe: Codable, Equatable {
    let name: String
    let description: String?
    let imageUrl: String?
    let instructions: String?
    let prepTime: String?
    let cookTime: String?
    let servings: String?
    let ingredients: [String]

    enum CodingKeys: String, CodingKey {
        case name, description, ingredients, instructions, servings
        case imageUrl = "image_url"
        case prepTime = "prep_time"
        case cookTime = "cook_time"
    }
}

enum ShareExtensionAPI {
    enum ImportError: Error, LocalizedError {
        case missingConfig
        case badResponse(Int)
        case network(String)
        case decode(String)

        var errorDescription: String? {
            switch self {
            case .missingConfig:
                return "Share extension isn't configured yet. Reinstall EatPal."
            case .badResponse(let status):
                return "The recipe service returned an error (\(status))."
            case .network(let detail):
                return "Network error: \(detail)"
            case .decode(let detail):
                return "Couldn't read the recipe: \(detail)"
            }
        }
    }

    /// Calls the Supabase edge function `parse-recipe` with the shared URL.
    static func parseRecipe(url: URL) async throws -> ParsedRecipe {
        guard let supabaseUrl = supabaseBaseUrl(),
              let anonKey = supabaseAnonKey() else {
            throw ImportError.missingConfig
        }

        let endpoint = supabaseUrl.appendingPathComponent("functions/v1/parse-recipe")
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(anonKey)", forHTTPHeaderField: "Authorization")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")

        let body = ["url": url.absoluteString]
        request.httpBody = try? JSONEncoder().encode(body)
        request.timeoutInterval = 20

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let http = response as? HTTPURLResponse else {
            throw ImportError.network("Invalid response")
        }

        guard (200..<300).contains(http.statusCode) else {
            throw ImportError.badResponse(http.statusCode)
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

    private static func supabaseBaseUrl() -> URL? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String,
              !raw.isEmpty,
              raw != "$(SUPABASE_URL)",
              let url = URL(string: raw) else {
            return nil
        }
        return url
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
