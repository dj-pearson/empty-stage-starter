import Foundation

/// US-364: the single, shared pantry dedup rule used by every add path
/// (manual add, barcode scan, receipt scan) so the pantry stops accumulating
/// duplicate rows. Pure and free-standing so it's unit-testable without an
/// AppState instance.
enum PantryDedup {
    /// Find an existing pantry food matching `barcode` (preferred when
    /// provided and present on a row) or a case-insensitive, trimmed `name`.
    static func match(name: String, barcode: String?, in foods: [Food]) -> Food? {
        if let barcode, !barcode.isEmpty,
           let byBarcode = foods.first(where: { ($0.barcode ?? "").isEmpty == false && $0.barcode == barcode }) {
            return byBarcode
        }
        let needle = name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !needle.isEmpty else { return nil }
        return foods.first { $0.name.lowercased() == needle }
    }
}
