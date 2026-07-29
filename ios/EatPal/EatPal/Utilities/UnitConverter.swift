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
        // US-583: the mobile unit picker offers "½ gal" for milk/cream.
        "half gal": UnitDef(dimension: .volume, toBase: 1892.705892),
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
        // US-583: spellings the parsers emit that had no alias here, so a
        // perfectly ordinary "2 tbsps" or "½ gal" resolved to nil.
        "tbsps": "tbsp", "tsps": "tsp", "cs": "cup",
        "½ gal": "half gal", "½ gallon": "half gal", "half gallon": "half gal",
    ]

    /// Container ("package") units. These carry no fixed real-world size, so
    /// they never convert into another unit — but two quantities of the SAME
    /// container unit must still add up ("2 cans" + "1 can" = "3 can").
    ///
    /// US-583: before this, `canonical("cans")` returned nil, so the grocery
    /// generator could not even sum a unit with itself and fell back to adding
    /// bare numbers under whichever label it happened to see first.
    private static let containerCanonicals: Set<String> = [
        "pack", "bag", "jar", "bottle", "can", "box", "loaf", "bunch", "head",
        "roll", "sleeve", "tube", "tray", "carton", "sachet", "stick",
        "container", "case", "block", "fillet", "slice", "clove", "stalk",
        "sprig", "pinch", "dash", "drop", "serving",
    ]

    private static let containerAliases: [String: String] = [
        "packs": "pack", "package": "pack", "packages": "pack", "pkg": "pack", "pkgs": "pack",
        "bags": "bag", "jars": "jar", "bottles": "bottle", "btl": "bottle", "btls": "bottle",
        "cans": "can", "boxes": "box", "loaves": "loaf", "bunches": "bunch", "heads": "head",
        "rolls": "roll", "sleeves": "sleeve", "tubes": "tube", "trays": "tray",
        "cartons": "carton", "sachets": "sachet", "sticks": "stick",
        "containers": "container", "tub": "container", "tubs": "container",
        "cases": "case", "blocks": "block",
        "fillets": "fillet", "filet": "fillet", "filets": "fillet",
        "slices": "slice", "cloves": "clove", "stalks": "stalk", "sprigs": "sprig",
        "pinches": "pinch", "dashes": "dash", "drops": "drop", "servings": "serving",
    ]

    /// The canonical container noun for `raw`, or nil when `raw` isn't a
    /// container unit. Used to decide whether two non-convertible units are at
    /// least the *same* unit and can therefore be added.
    static func canonicalContainer(_ raw: String) -> String? {
        let key = normalizedKey(raw)
        guard !key.isEmpty else { return nil }
        if containerCanonicals.contains(key) { return key }
        return containerAliases[key]
    }

    /// Lowercase, trim, drop trailing periods ("tbsp." → "tbsp") and collapse
    /// internal whitespace so lookups don't miss on formatting alone.
    private static func normalizedKey(_ raw: String) -> String {
        raw.lowercased()
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: ".", with: "")
            .split(separator: " ", omittingEmptySubsequences: true)
            .joined(separator: " ")
    }

    /// Add up `parts` (quantity, unit) into a single total.
    ///
    /// US-586: returns nil when the parts are genuinely incomparable (2 cup vs
    /// 1 bag) so the caller can keep them as separate grocery lines rather than
    /// fabricating a sum. When they ARE comparable the total is expressed in
    /// the most frequently occurring unit, so "2 cup + 1 gal milk" reads back
    /// as gallons rather than as the meaningless "3 cup".
    static func combine(_ parts: [(quantity: Double, unit: String)]) -> (quantity: Double, unit: String)? {
        let usable = parts.filter { $0.quantity.isFinite }
        guard let first = usable.first else { return nil }
        if usable.count == 1 { return (first.quantity, first.unit) }

        let target = dominantUnit(of: usable)

        // Measured units: convert everything into the target unit.
        if canonical(target) != nil {
            var total: Double = 0
            for part in usable {
                guard let converted = convert(part.quantity, from: part.unit, to: target) else {
                    return nil
                }
                total += converted
            }
            return (total, target)
        }

        // Container units: only summable when every part is the same container.
        if let targetContainer = canonicalContainer(target) {
            for part in usable where canonicalContainer(part.unit) != targetContainer {
                return nil
            }
            return (usable.reduce(0) { $0 + $1.quantity }, targetContainer)
        }

        // Unit-less / unrecognised: sum only when every label agrees.
        let labels = Set(usable.map { normalizedKey($0.unit) })
        guard labels.count == 1 else { return nil }
        return (usable.reduce(0) { $0 + $1.quantity }, target)
    }

    /// Most frequently occurring unit label, preferring a real unit over an
    /// empty one on ties so a labelled quantity wins over a bare number.
    private static func dominantUnit(of parts: [(quantity: Double, unit: String)]) -> String {
        var counts: [String: Int] = [:]
        for part in parts {
            counts[part.unit, default: 0] += 1
        }
        var best = parts[0].unit
        var bestCount = -1
        for part in parts {
            let count = counts[part.unit] ?? 0
            if count > bestCount || (count == bestCount && best.isEmpty && !part.unit.isEmpty) {
                best = part.unit
                bestCount = count
            }
        }
        return best
    }

    /// Normalizes a raw unit string to a canonical key, or nil if unknown /
    /// non-convertible (container units, empty strings).
    static func canonical(_ raw: String) -> String? {
        let key = normalizedKey(raw)
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
