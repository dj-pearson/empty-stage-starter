import Foundation

/// US-295: Grocery lines captured by the share extension (Notes / Reminders
/// / any app that emits plain text) but not yet written to Supabase. The
/// extension enqueues these into App Group UserDefaults; the main app drains
/// them on launch when a full authenticated session is available.
///
/// Mirrors the recipe pattern in `PendingRecipeImport.swift` so the
/// drain-on-launch flow stays uniform.
///
/// We persist the lightweight `ParsedLine` shape rather than full
/// `ParsedGroceryItem` so the queue stays readable in a Plist (and the
/// extension doesn't need the rest of the AppState ceremony to enqueue).
public struct PendingGroceryImport: Codable, Identifiable, Equatable {
    public let id: String
    /// Pre-parsed lines the user reviewed and accepted in the share sheet.
    public let items: [ParsedLine]
    /// Free-text label describing the origin (e.g. "share:notes", "share:text").
    /// Stored on each materialised `GroceryItem.addedVia` for analytics.
    public let sourceLabel: String
    public let capturedAt: Date

    public struct ParsedLine: Codable, Equatable {
        public let name: String
        public let quantity: Double
        public let unit: String
        public let category: String

        public init(name: String, quantity: Double, unit: String, category: String) {
            self.name = name
            self.quantity = quantity
            self.unit = unit
            self.category = category
        }
    }

    public init(
        id: String = UUID().uuidString,
        items: [ParsedLine],
        sourceLabel: String,
        capturedAt: Date = .now
    ) {
        self.id = id
        self.items = items
        self.sourceLabel = sourceLabel
        self.capturedAt = capturedAt
    }
}

/// App Group UserDefaults queue for pending grocery imports.
public enum PendingGroceryImportQueue {
    public static let appGroup = "group.com.eatpal.app"
    public static let key = "pending_grocery_imports"

    public static func load() -> [PendingGroceryImport] {
        guard let defaults = UserDefaults(suiteName: appGroup),
              let data = defaults.data(forKey: key),
              let items = try? JSONDecoder().decode([PendingGroceryImport].self, from: data) else {
            return []
        }
        return items
    }

    public static func enqueue(_ item: PendingGroceryImport) {
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

    private static func save(_ items: [PendingGroceryImport]) {
        guard let defaults = UserDefaults(suiteName: appGroup),
              let data = try? JSONEncoder().encode(items) else { return }
        defaults.set(data, forKey: key)
    }
}
