import Foundation

/// US-143: A recipe parsed by the share extension but not yet written to
/// Supabase. The extension enqueues these into App Group UserDefaults;
/// the main app drains them on launch when a full authenticated session
/// is available.
///
/// Codable so both sides (extension + app) can round-trip through JSON
/// without needing to share the Recipe domain type.
public struct PendingRecipeImport: Codable, Identifiable, Equatable {
    public let id: String
    public let sourceUrl: String
    public let name: String
    public let description: String?
    public let imageUrl: String?
    public let instructions: String?
    public let prepTime: String?
    public let cookTime: String?
    public let servings: String?
    public let additionalIngredients: String?
    public let capturedAt: Date

    public init(
        id: String = UUID().uuidString,
        sourceUrl: String,
        name: String,
        description: String? = nil,
        imageUrl: String? = nil,
        instructions: String? = nil,
        prepTime: String? = nil,
        cookTime: String? = nil,
        servings: String? = nil,
        additionalIngredients: String? = nil,
        capturedAt: Date = .now
    ) {
        self.id = id
        self.sourceUrl = sourceUrl
        self.name = name
        self.description = description
        self.imageUrl = imageUrl
        self.instructions = instructions
        self.prepTime = prepTime
        self.cookTime = cookTime
        self.servings = servings
        self.additionalIngredients = additionalIngredients
        self.capturedAt = capturedAt
    }
}

/// App Group UserDefaults queue for pending recipe imports.
public enum PendingRecipeImportQueue {
    public static let appGroup = "group.com.eatpal.app"
    public static let key = "pending_recipe_imports"

    public static func load() -> [PendingRecipeImport] {
        guard let defaults = UserDefaults(suiteName: appGroup),
              let data = defaults.data(forKey: key),
              let items = try? JSONDecoder().decode([PendingRecipeImport].self, from: data) else {
            return []
        }
        return items
    }

    public static func enqueue(_ item: PendingRecipeImport) {
        var items = load()
        items.append(item)
        save(items)
    }

    public static func clear() {
        save([])
    }

    public static func remove(id: String) {
        let items = load().filter { $0.id != id }
        save(items)
    }

    private static func save(_ items: [PendingRecipeImport]) {
        guard let defaults = UserDefaults(suiteName: appGroup),
              let data = try? JSONEncoder().encode(items) else { return }
        defaults.set(data, forKey: key)
    }
}
