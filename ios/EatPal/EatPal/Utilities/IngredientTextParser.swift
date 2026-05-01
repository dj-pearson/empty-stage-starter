import Foundation

/// Parses a free-text ingredient line like `"4 tablespoons vegetable oil"`
/// or `"1 whole red bell pepper (thinly sliced)"` into a clean
/// `(quantity, unit, name)` triple.
///
/// Used at three boundaries:
/// - `RecipeIngredientLegacyParser` when migrating the comma-string
///   `additional_ingredients` blob into structured rows.
/// - `GroceryGeneratorService.addStructuredIngredient` as a defensive
///   reparse so already-imported rows (where the whole line landed in
///   `name`) still produce a clean grocery-item display name.
/// - `GroceryGeneratorService.addLegacyName` for recipes that haven't
///   been re-saved yet and still serve grocery generation from the raw
///   comma-split string.
///
/// The parser is intentionally permissive: when it can't recognize a
/// quantity or unit, it just returns `(nil, nil, cleanedName)` — the
/// original text minus parens and known leading filler words. Callers
/// always get a usable `name` back, even on weird inputs.
enum IngredientTextParser {

    struct Parsed: Equatable {
        var quantity: Double?
        var unit: String?
        var name: String
    }

    static func parse(_ raw: String) -> Parsed {
        // 1. Strip parenthetical descriptors: "(thinly sliced)", "(optional)".
        var working = raw.removingParentheticals()
            .trimmingCharacters(in: .whitespacesAndNewlines)

        // 2. Drop trailing modifier clauses introduced by ", chopped" /
        //    ", to taste" / etc. We only consider the part before the
        //    first comma — the recipe-level comma split already handles
        //    multi-ingredient lines, so anything after a comma here is a
        //    descriptor we don't want in the grocery list name.
        if let commaIdx = working.firstIndex(of: ",") {
            working = String(working[..<commaIdx])
                .trimmingCharacters(in: .whitespacesAndNewlines)
        }

        guard !working.isEmpty else {
            return Parsed(quantity: nil, unit: nil, name: raw)
        }

        // 3. Pull off a leading quantity token. Handles plain numbers,
        //    decimals, ASCII fractions, mixed numbers, ranges, and the
        //    common Unicode vulgar fractions.
        var (quantity, afterQty) = extractQuantity(from: working)
        afterQty = afterQty.trimmingCharacters(in: .whitespacesAndNewlines)

        // 4. Pull off a leading unit token if recognised.
        var (unit, afterUnit) = extractUnit(from: afterQty)
        afterUnit = afterUnit.trimmingCharacters(in: .whitespacesAndNewlines)

        // 5. Strip leading filler words from the remaining name —
        //    "whole red bell pepper" → "red bell pepper".
        let cleanedName = stripLeadingFillers(afterUnit)
            .trimmingCharacters(in: .whitespacesAndNewlines)

        // If the cleanup left us with nothing usable, fall back to the
        // pre-cleanup `working` so callers always see *some* name.
        let finalName = cleanedName.isEmpty ? working : cleanedName

        // Don't attach a unit without a quantity (`unit "tablespoon"`
        // alone makes no sense as a grocery line). Drop one if both
        // didn't show up.
        if quantity == nil { unit = nil }

        return Parsed(quantity: quantity, unit: unit, name: finalName)
    }

    // MARK: - Quantity

    /// Vulgar-fraction characters mapped to their decimal value.
    private static let unicodeFractions: [Character: Double] = [
        "½": 0.5, "⅓": 1.0 / 3.0, "⅔": 2.0 / 3.0,
        "¼": 0.25, "¾": 0.75,
        "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8,
        "⅙": 1.0 / 6.0, "⅚": 5.0 / 6.0,
        "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875
    ]

    /// Scan from the start of `s` and consume any contiguous
    /// numeric / fraction / range tokens. Returns the parsed value
    /// (averaging ranges) and the remainder of the string.
    private static func extractQuantity(from s: String) -> (Double?, String) {
        var idx = s.startIndex
        var collected: [Double] = []
        var sawAny = false

        // Loop because "1 1/2" or "1-2" or "1 to 2" emits multiple tokens.
        while idx < s.endIndex {
            // Skip a single leading separator between number tokens
            // (space, hyphen, en/em dash, the literal " to ", or "-")
            // but only after we've already seen at least one number.
            if sawAny {
                let rest = s[idx...]
                if rest.hasPrefix(" to ") {
                    idx = s.index(idx, offsetBy: 4)
                    continue
                }
                let sep = s[idx]
                if sep == " " || sep == "-" || sep == "–" || sep == "—" {
                    idx = s.index(after: idx)
                    continue
                }
            }

            let ch = s[idx]

            // Unicode vulgar fraction: "½", "1½".
            if let frac = unicodeFractions[ch] {
                collected.append(frac)
                idx = s.index(after: idx)
                sawAny = true
                continue
            }

            guard ch.isNumber else { break }

            // Walk forward over digits and an optional decimal or
            // ascii-fraction suffix.
            var end = idx
            while end < s.endIndex, s[end].isNumber { end = s.index(after: end) }

            // Decimal: "1.5"
            if end < s.endIndex, s[end] == ".",
               s.index(after: end) < s.endIndex,
               s[s.index(after: end)].isNumber {
                end = s.index(after: end)
                while end < s.endIndex, s[end].isNumber { end = s.index(after: end) }
                if let val = Double(s[idx..<end]) {
                    collected.append(val)
                }
                idx = end
                sawAny = true
                continue
            }

            // Ascii fraction: "1/2"
            if end < s.endIndex, s[end] == "/",
               s.index(after: end) < s.endIndex,
               s[s.index(after: end)].isNumber {
                let numEnd = end
                var denomEnd = s.index(after: end)
                while denomEnd < s.endIndex, s[denomEnd].isNumber {
                    denomEnd = s.index(after: denomEnd)
                }
                if let num = Double(s[idx..<numEnd]),
                   let den = Double(s[s.index(after: end)..<denomEnd]),
                   den != 0 {
                    collected.append(num / den)
                }
                idx = denomEnd
                sawAny = true
                continue
            }

            // Plain integer
            if let val = Double(s[idx..<end]) {
                collected.append(val)
            }
            idx = end
            sawAny = true
        }

        guard !collected.isEmpty else { return (nil, s) }

        // For a range ("1 to 2", "1-2") we collected two numbers and
        // want their average. For mixed numbers ("1 1/2") we want the
        // sum. Heuristic: if every collected value is < 1, sum them
        // (likely a fraction sequence); otherwise if we collected more
        // than two we sum (mixed); for exactly two where the second is
        // larger than the first, average (range).
        let total: Double
        if collected.count == 2,
           collected[0] >= 1, collected[1] >= 1, collected[1] > collected[0] {
            total = (collected[0] + collected[1]) / 2.0
        } else {
            total = collected.reduce(0, +)
        }

        return (total, String(s[idx...]))
    }

    // MARK: - Unit

    /// Map of every recognised lowercase unit token (with and without
    /// trailing period, plural) to its canonical singular form.
    private static let unitTokens: [String: String] = {
        var map: [String: String] = [:]
        let groups: [(String, [String])] = [
            ("tbsp", ["tbsp", "tbsps", "tbsp.", "tablespoon", "tablespoons", "tbs", "T", "T."]),
            ("tsp", ["tsp", "tsps", "tsp.", "teaspoon", "teaspoons", "t", "t."]),
            ("cup", ["cup", "cups", "c", "c."]),
            ("oz", ["oz", "oz.", "ounce", "ounces", "fl oz", "fluid ounce", "fluid ounces"]),
            ("lb", ["lb", "lbs", "lb.", "lbs.", "pound", "pounds"]),
            ("g", ["g", "g.", "gram", "grams"]),
            ("kg", ["kg", "kg.", "kilogram", "kilograms"]),
            ("mg", ["mg", "mg.", "milligram", "milligrams"]),
            ("ml", ["ml", "ml.", "milliliter", "milliliters", "millilitre", "millilitres"]),
            ("l", ["l", "l.", "liter", "liters", "litre", "litres"]),
            ("pint", ["pint", "pints", "pt"]),
            ("quart", ["quart", "quarts", "qt"]),
            ("gallon", ["gallon", "gallons", "gal"]),
            ("clove", ["clove", "cloves"]),
            ("can", ["can", "cans"]),
            ("jar", ["jar", "jars"]),
            ("bottle", ["bottle", "bottles"]),
            ("package", ["package", "packages", "pkg", "pkgs", "pack", "packs"]),
            ("piece", ["piece", "pieces", "pc", "pcs"]),
            ("slice", ["slice", "slices"]),
            ("stalk", ["stalk", "stalks"]),
            ("head", ["head", "heads"]),
            ("bunch", ["bunch", "bunches"]),
            ("sprig", ["sprig", "sprigs"]),
            ("pinch", ["pinch", "pinches"]),
            ("dash", ["dash", "dashes"]),
            ("drop", ["drop", "drops"]),
            ("stick", ["stick", "sticks"]),
            ("loaf", ["loaf", "loaves"])
        ]
        for (canonical, variants) in groups {
            for v in variants { map[v.lowercased()] = canonical }
        }
        return map
    }()

    /// If the first whitespace-delimited token (or first two, for
    /// `"fl oz"` / `"fluid ounce"`) matches a known unit, peel it off.
    private static func extractUnit(from s: String) -> (String?, String) {
        guard !s.isEmpty else { return (nil, s) }
        let parts = s.split(separator: " ", omittingEmptySubsequences: true)
        guard let first = parts.first else { return (nil, s) }

        // Try a two-token unit first ("fl oz", "fluid ounce").
        if parts.count >= 2 {
            let two = "\(first) \(parts[1])".lowercased()
            if let canonical = unitTokens[two] {
                let rest = parts.dropFirst(2).joined(separator: " ")
                return (canonical, rest)
            }
        }
        let one = String(first).lowercased()
        if let canonical = unitTokens[one] {
            let rest = parts.dropFirst().joined(separator: " ")
            return (canonical, rest)
        }
        return (nil, s)
    }

    // MARK: - Filler words

    /// Adjective/descriptor tokens that should be stripped from the
    /// start of the name so the grocery list shows the noun, not the
    /// preparation. e.g. "whole red bell pepper" → "red bell pepper".
    private static let leadingFillers: Set<String> = [
        "whole", "fresh", "freshly", "ripe", "raw", "cooked",
        "large", "small", "medium", "extra", "x-large", "xl",
        "organic", "free-range", "free range",
        "boneless", "skinless", "lean",
        "frozen", "thawed",
        "chopped", "diced", "minced", "sliced", "shredded", "grated",
        "crushed", "ground", "peeled", "halved", "quartered",
        "softened", "melted", "cubed", "julienned"
    ]

    private static func stripLeadingFillers(_ s: String) -> String {
        var rest = s
        while true {
            let parts = rest.split(separator: " ", omittingEmptySubsequences: true)
            guard let first = parts.first else { return rest }
            if leadingFillers.contains(String(first).lowercased()) {
                rest = parts.dropFirst().joined(separator: " ")
            } else {
                return rest
            }
        }
    }
}

private extension String {
    /// Removes any `(...)` substrings (non-nested) and collapses any
    /// resulting double spaces.
    func removingParentheticals() -> String {
        var result = ""
        var depth = 0
        for ch in self {
            if ch == "(" {
                depth += 1
                continue
            }
            if ch == ")" {
                depth = max(0, depth - 1)
                continue
            }
            if depth == 0 {
                result.append(ch)
            }
        }
        // Collapse runs of whitespace introduced by the removal.
        return result.split(separator: " ", omittingEmptySubsequences: true)
            .joined(separator: " ")
    }
}
