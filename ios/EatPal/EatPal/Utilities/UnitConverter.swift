import Foundation

/// US-363 / US-351: best-effort conversion between the free-form unit strings
/// the app stores on `Food` and `GroceryItem` (e.g. "gal", "oz", "lb", "cup",
/// "tsp", "dozen", "count").
///
/// Used when crediting bought groceries into the pantry so a "2 gal milk"
/// purchase doesn't increment an existing pantry entry stored in a different
/// unit by a literal 2. When a conversion isn't possible the caller is expected
/// to fall back to adding the raw quantity and flagging a mismatch — we never
/// silently fabricate a number across incompatible units.
///
/// Scope of what converts:
///   * Volume:  ml, l, tsp, tbsp, fl oz, cup, pt, qt, gal
///   * Mass:    g, kg, oz, lb
///   * Count:   count, dozen
///
/// Container units the app also uses — pack, bag, box, jar, can, bottle, loaf,
/// bunch — carry no fixed real-world size, so converting them would invent
/// data. Those are intentionally unknown and `convert` returns nil for them.
///
/// Ambiguity note: a bare "oz" is treated as a *weight* ounce (the app uses it
/// for cheese / yogurt). Fluid ounces must be written "fl oz". This means a
/// volume↔mass pairing (e.g. gal → oz) is reported as non-convertible rather
/// than guessed — the safe outcome, since we can't know a product's density.
enum UnitConverter {

    enum Dimension: Equatable {
        case volume
        case mass
        case count
    }

    /// Canonical unit + its factor to the dimension's base unit
    /// (volume → ml, mass → g, count → each).
    private struct UnitDef {
        let dimension: Dimension
        let toBase: Double
    }

    /// Canonical-unit table. Aliases/plurals are mapped onto these keys in
    /// `canonical(_:)` before lookup.
    private static let table: [String: UnitDef] = [
        // Volume (base: ml)
        "ml": UnitDef(dimension: .volume, toBase: 1),
        "l": UnitDef(dimension: .volume, toBase: 1000),
        "tsp": UnitDef(dimension: .volume, toBase: 4.928922),
        "tbsp": UnitDef(dimension: .volume, toBase: 14.786765),
        "fl oz": UnitDef(dimension: .volume, toBase: 29.573530),
        "cup": UnitDef(dimension: .volume, toBase: 236.588236),
        "pt": UnitDef(dimension: .volume, toBase: 473.176473),
        "qt": UnitDef(dimension: .volume, toBase: 946.352946),
        "gal": UnitDef(dimension: .volume, toBase: 3785.411784),
        // Mass (base: g)
        "g": UnitDef(dimension: .mass, toBase: 1),
        "kg": UnitDef(dimension: .mass, toBase: 1000),
        "oz": UnitDef(dimension: .mass, toBase: 28.349523),
        "lb": UnitDef(dimension: .mass, toBase: 453.592370),
        // Count (base: each)
        "count": UnitDef(dimension: .count, toBase: 1),
        "dozen": UnitDef(dimension: .count, toBase: 12),
    ]

    /// Alias / plural / abbreviation → canonical key. Longer compound aliases
    /// (e.g. "fluid ounce") are resolved here so the main table stays flat.
    private static let aliases: [String: String] = [
        // Volume
        "milliliter": "ml", "milliliters": "ml", "millilitre": "ml", "millilitres": "ml",
        "liter": "l", "liters": "l", "litre": "l", "litres": "l",
        "teaspoon": "tsp", "teaspoons": "tsp", "tsp.": "tsp", "ts": "tsp",
        "tablespoon": "tbsp", "tablespoons": "tbsp", "tbsp.": "tbsp", "tbs": "tbsp", "tbl": "tbsp",
        "fluid ounce": "fl oz", "fluid ounces": "fl oz", "floz": "fl oz", "fl. oz": "fl oz", "fl oz.": "fl oz",
        "cups": "cup",
        "pint": "pt", "pints": "pt",
        "quart": "qt", "quarts": "qt",
        "gallon": "gal", "gallons": "gal",
        // Mass
        "gram": "g", "grams": "g", "gm": "g", "gms": "g",
        "kilogram": "kg", "kilograms": "kg", "kgs": "kg",
        "ounce": "oz", "ounces": "oz",
        "pound": "lb", "pounds": "lb", "lbs": "lb",
        // Count
        "counts": "count", "ct": "count", "each": "count", "ea": "count",
        "piece": "count", "pieces": "count", "pcs": "count", "pc": "count",
        "unit": "count", "units": "count", "item": "count", "items": "count",
        "dozens": "dozen", "doz": "dozen",
    ]

    /// Normalizes a raw unit string to a canonical key, or nil if unknown /
    /// non-convertible (container units, empty strings).
    static func canonical(_ raw: String) -> String? {
        let key = raw
            .lowercased()
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty else { return nil }
        if table[key] != nil { return key }
        if let aliased = aliases[key] { return aliased }
        return nil
    }

    /// The measurement dimension of a unit, or nil if unknown.
    static func dimension(of raw: String) -> Dimension? {
        guard let key = canonical(raw) else { return nil }
        return table[key]?.dimension
    }

    /// True when two units can be converted into one another.
    static func areCompatible(_ a: String, _ b: String) -> Bool {
        guard let da = dimension(of: a), let db = dimension(of: b) else { return false }
        return da == db
    }

    /// Converts `quantity` of unit `from` into unit `to`.
    ///
    /// Returns nil when either unit is unknown / non-convertible, or the two
    /// live in different dimensions (e.g. volume → mass). Identical units pass
    /// the quantity through unchanged.
    static func convert(_ quantity: Double, from: String, to: String) -> Double? {
        guard
            let fromKey = canonical(from),
            let toKey = canonical(to),
            let fromDef = table[fromKey],
            let toDef = table[toKey],
            fromDef.dimension == toDef.dimension
        else { return nil }

        if fromKey == toKey { return quantity }
        return quantity * fromDef.toBase / toDef.toBase
    }
}
