import Foundation
import CoreTransferable
import UniformTypeIdentifiers

/// A lightweight value object used for SwiftUI drag-and-drop of foods between
/// Pantry, Grocery, and Meal Planner (US-136). Keeps only the fields the drop
/// handlers need, so the drag payload stays small and stable across app states.
///
/// Usage:
///   .draggable(FoodTransferable(food: food))
///   .dropDestination(for: FoodTransferable.self) { items, _ in /* handle */ }
struct FoodTransferable: Codable, Transferable {
    let id: String
    let name: String
    let category: String
    let unit: String?

    init(id: String, name: String, category: String, unit: String?) {
        self.id = id
        self.name = name
        self.category = category
        self.unit = unit
    }

    init(food: Food) {
        self.id = food.id
        self.name = food.name
        self.category = food.category
        self.unit = food.unit
    }

    static var transferRepresentation: some TransferRepresentation {
        // Intra-app drag uses JSON-encoded plain text. We also export a plain
        // name so users dragging out to Messages / Notes get a readable string.
        CodableRepresentation(contentType: .utf8PlainText)
        ProxyRepresentation(exporting: \.name)
    }
}
