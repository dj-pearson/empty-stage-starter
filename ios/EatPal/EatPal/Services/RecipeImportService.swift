import Foundation

/// US-223: In-app recipe import from a pasted URL. Calls the same
/// Supabase `parse-recipe` edge function that the share extension uses,
/// but via the main app's authenticated SupabaseClient so it benefits
/// from session refresh and shared networking.
enum RecipeImportService {
    enum ImportError: Error, LocalizedError {
        case invalidURL
        case network(String)
        case decode(String)

        var errorDescription: String? {
            switch self {
            case .invalidURL:
                return "That doesn't look like a recipe URL."
            case .network(let detail):
                return "Couldn't reach the recipe service: \(detail)"
            case .decode(let detail):
                return "The recipe was found but the response was unreadable: \(detail)"
            }
        }
    }

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

    private struct RequestBody: Encodable {
        let url: String
    }

    private struct ResponseWrapper: Decodable {
        let recipe: ParsedRecipe?
    }

    /// Parse a recipe URL via the `parse-recipe` edge function.
    /// Handles both direct and `{recipe: {...}}` wrapper response shapes.
    static func parse(_ rawURL: String) async throws -> ParsedRecipe {
        let trimmed = rawURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed),
              url.scheme?.hasPrefix("http") == true,
              url.host != nil else {
            throw ImportError.invalidURL
        }

        let body = RequestBody(url: url.absoluteString)

        do {
            // Try decoding as ParsedRecipe directly first.
            if let direct: ParsedRecipe = try? await EdgeFunctions.invoke(
                "parse-recipe",
                body: body,
                as: ParsedRecipe.self
            ) {
                return direct
            }

            // Fall back to wrapper shape.
            let wrapper: ResponseWrapper = try await EdgeFunctions.invoke(
                "parse-recipe",
                body: body,
                as: ResponseWrapper.self
            )
            guard let recipe = wrapper.recipe else {
                throw ImportError.decode("Empty response")
            }
            return recipe
        } catch let error as ImportError {
            throw error
        } catch {
            let message = error.localizedDescription
            if message.lowercased().contains("decod") {
                throw ImportError.decode(message)
            }
            throw ImportError.network(message)
        }
    }

    /// Heuristic extraction of the first http(s) URL from a string —
    /// used to auto-detect pasted URLs from pasteboard contents.
    static func firstURL(in text: String) -> URL? {
        guard !text.isEmpty else { return nil }
        let detector = try? NSDataDetector(
            types: NSTextCheckingResult.CheckingType.link.rawValue
        )
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        guard let match = detector?.firstMatch(
            in: text,
            options: [],
            range: range
        ), let url = match.url,
              url.scheme?.hasPrefix("http") == true else {
            return nil
        }
        return url
    }
}
