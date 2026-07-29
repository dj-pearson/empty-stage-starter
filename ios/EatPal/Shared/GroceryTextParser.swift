import Foundation

/// Lightweight Swift port of `src/lib/parse-grocery-text.ts`.
/// Optimised for spoken input (voice-to-grocery, US-140), pasted free text
/// (screenshot OCR, US-141), and shared text from the iOS share sheet
/// (Notes / Reminders import, US-295). Outputs `ParsedGroceryItem` values
/// ready to be materialised into `GroceryItem` rows.
///
/// Lives under `Shared/` so both the main app and the share extension can
/// link it without duplicating the dictionaries.
///
/// US-592: this file owns only *list-level* concerns — how to split a blob into
/// phrases, how to dedupe/sum repeats, and which grocery category a name falls
/// into. Quantity/unit/name extraction is delegated to `IngredientTextParser`
/// (also in Shared/), so there is exactly ONE ingredient tokenizer on iOS. It
/// previously carried its own weaker copy — no ranges, no unicode fractions, no
/// parentheticals — purely because the extension target couldn't reach the
/// good one.
public struct ParsedGroceryItem: Equatable, Identifiable {
    public let id = UUID()
    public var name: String
    public var quantity: Double
    public var unit: String
    public var category: String  // FoodCategory.rawValue

    /// Approximate confidence in the parse, 0.0–1.0. Low confidence items can
    /// be surfaced with a review prompt before insert.
    public var confidence: Double

    public init(name: String, quantity: Double, unit: String, category: String, confidence: Double) {
        self.name = name
        self.quantity = quantity
        self.unit = unit
        self.category = category
        self.confidence = confidence
    }
}

public enum GroceryTextParser {
    // MARK: - Dictionaries

    private static let categoryKeywords: [(category: String, keywords: [String])] = [
        ("protein", [
            "chicken", "beef", "pork", "turkey", "salmon", "tuna", "shrimp", "fish",
            "steak", "ground beef", "bacon", "sausage", "ham", "lamb", "tofu",
            "eggs", "egg", "meatball", "hot dog", "deli", "jerky", "bison",
            "tilapia", "cod", "crab", "lobster", "scallop", "clam", "mussel"
        ]),
        ("dairy", [
            // US-591: closed compounds need their own entry, because
            // word-boundary matching correctly refuses to see "milk" inside
            // "buttermilk" (which is what stops "ham" matching "graham").
            "buttermilk",
            "milk", "cheese", "yogurt", "butter", "cream", "sour cream", "cottage cheese",
            "mozzarella", "cheddar", "parmesan", "ricotta", "cream cheese",
            "half and half", "ice cream", "gelato", "kefir", "ghee"
        ]),
        ("fruit", [
            "apple", "banana", "orange", "grape", "strawberr", "blueberr", "raspberr",
            "blackberr", "mango", "pineapple", "watermelon", "cantaloupe", "honeydew",
            "peach", "pear", "plum", "cherry", "kiwi", "lemon", "lime", "avocado",
            "coconut", "pomegranate", "fig", "papaya", "cranberr", "melon"
        ]),
        ("vegetable", [
            "broccoli", "carrot", "spinach", "kale", "lettuce", "tomato", "cucumber",
            "pepper", "onion", "garlic", "potato", "corn", "pea",
            "green bean", "celery", "mushroom", "zucchini", "squash", "cauliflower",
            "asparagus", "beet", "cabbage", "eggplant", "radish", "leek", "arugula",
            "cilantro", "parsley", "basil", "ginger", "scallion", "shallot", "salad"
        ]),
        ("carb", [
            "bread", "rice", "pasta", "noodle", "tortilla", "bagel", "roll", "bun",
            "cereal", "oat", "oatmeal", "granola", "flour", "cracker", "chip",
            "pita", "wrap", "couscous", "quinoa", "barley", "waffle",
            "english muffin", "croissant", "biscuit", "breadcrumb", "pretzel", "popcorn"
        ]),
        ("snack", [
            "cookie", "candy", "chocolate", "gummy", "granola bar", "pudding",
            "trail mix", "nut", "almond", "peanut butter", "almond butter",
            "jelly", "jam", "honey",
            "syrup", "ketchup", "mustard", "mayo", "ranch", "salsa", "hummus",
            "dressing", "sauce", "juice", "soda", "coffee", "tea", "kombucha",
            // US-591: seasonings must beat the bare "pepper" vegetable rule so
            // "salt and pepper to taste" isn't filed as produce.
            "salt and pepper", "black pepper", "ground pepper", "peppercorn",
            "salt", "sugar", "spice", "seasoning", "oil", "vinegar", "soy sauce"
        ])
    ]

    // MARK: - Public API

    /// Parse freeform text into grocery items. Accepts comma-separated, newline-separated,
    /// or spoken phrases joined by " and " / " also ".
    public static func parse(_ text: String) -> [ParsedGroceryItem] {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }

        // US-592: comma splitting used to be unconditional, so "2 cloves
        // garlic, minced" produced a phantom grocery item called "Minced" (and
        // "1 onion, diced" one called "Diced"). Match the TS parser's guard:
        // only comma-split a single-line list that has 2+ commas.
        let newlineCount = trimmed.filter(\.isNewline).count
        let commaCount = trimmed.filter { $0 == "," }.count
        let separators: CharacterSet = (commaCount >= 2 && newlineCount == 0)
            ? CharacterSet(charactersIn: "\n,;")
            : CharacterSet(charactersIn: "\n;")
        var phrases = trimmed.components(separatedBy: separators)

        // If we didn't split at all (single utterance), try word-level conjunctions.
        if phrases.count == 1 {
            var working = trimmed
                .replacingOccurrences(of: " and also ", with: ",")
                .replacingOccurrences(of: " and then ", with: ",")
            // US-592: a bare " and " is only a separator when it isn't sitting
            // inside a compound product name. "1 pint half and half" used to
            // split into "1 pint half" + "half", and "salt and pepper to taste"
            // into two items. Driven off the category dictionary itself, so
            // adding a compound keyword there automatically protects it.
            if !containsCompoundKeyword(trimmed) {
                working = working.replacingOccurrences(of: " and ", with: ",")
            }
            let connectorSplit = working
                .replacingOccurrences(of: " also ", with: ",")
                .replacingOccurrences(of: " plus ", with: ",")
                .components(separatedBy: ",")
            if connectorSplit.count > 1 {
                phrases = connectorSplit
            }
        }

        // US-589: repeated names are SUMMED, not dropped. The old `seenNames`
        // guard silently discarded the second mention, so "1/2 cup milk" then
        // "2 tbsp milk" kept only the half cup and lost the tablespoons.
        var items: [ParsedGroceryItem] = []
        var indexByName: [String: Int] = [:]

        for rawPhrase in phrases {
            guard let parsed = parsePhrase(rawPhrase) else { continue }
            let key = parsed.name.lowercased()
            guard let existingIndex = indexByName[key] else {
                indexByName[key] = items.count
                items.append(parsed)
                continue
            }
            // US-583/592: `UnitConverter` now lives in Shared/, so the
            // extension can combine unit-aware ("1/2 cup" + "2 tbsp" = 0.63
            // cup) instead of only summing identical labels. Incomparable
            // pairs keep the larger line rather than inventing a total.
            if let combined = UnitConverter.combine([
                (quantity: items[existingIndex].quantity, unit: items[existingIndex].unit),
                (quantity: parsed.quantity, unit: parsed.unit)
            ]) {
                items[existingIndex].quantity = combined.quantity
                items[existingIndex].unit = combined.unit
                items[existingIndex].confidence = min(
                    items[existingIndex].confidence, parsed.confidence
                )
            } else if parsed.quantity > items[existingIndex].quantity {
                items[existingIndex] = parsed
            }
        }

        return items
    }

    // MARK: - Phrase parser

    /// US-592: delegates quantity / unit / name extraction to
    /// `IngredientTextParser` rather than maintaining a second, weaker
    /// tokenizer. That parser already handles ranges ("2-3 lbs"), mixed
    /// numbers, unicode vulgar fractions, parentheticals, hyphenated size
    /// descriptors ("1 15-ounce can"), word-form numbers and filler words —
    /// none of which this file used to support, which is why the voice / paste
    /// / share-sheet path (the messiest input in the app) had the weakest
    /// parse. Moving `IngredientTextParser` into Shared/ is what made this
    /// possible; the share extension target links only `EatPalShare` + `Shared`.
    private static func parsePhrase(_ phrase: String) -> ParsedGroceryItem? {
        // Clean leading bullets / numbers / checkboxes so we handle pasted lists too.
        var cleaned = phrase.trimmingCharacters(in: .whitespacesAndNewlines)
        cleaned = stripListMarkers(cleaned)
        guard cleaned.count >= 2 else { return nil }

        let parsed = IngredientTextParser.parse(cleaned)
        let name = parsed.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard name.count >= 2 else { return nil }

        // Canonicalise through UnitConverter so this path emits exactly the
        // same unit spellings as the pantry defaults and the recipe importer
        // ("gallon" → "gal", "package" → "pack"). US-583.
        let rawUnit = parsed.unit ?? ""
        let unit = rawUnit.isEmpty
            ? ""
            : (UnitConverter.canonical(rawUnit) ?? UnitConverter.canonicalContainer(rawUnit) ?? rawUnit)

        let quantityMatched = parsed.quantity != nil
        let confidence: Double
        if quantityMatched && !unit.isEmpty {
            confidence = 0.85
        } else if quantityMatched {
            confidence = 0.8
        } else if name.split(separator: " ").count == 1 {
            confidence = 0.7
        } else {
            confidence = 0.6
        }

        return ParsedGroceryItem(
            name: titleCase(name),
            quantity: parsed.quantity ?? 1,
            unit: unit,
            category: inferCategory(name),
            confidence: confidence
        )
    }

    // MARK: - Helpers

    private static func stripListMarkers(_ input: String) -> String {
        var s = input

        // Leading bullets / dashes
        while let first = s.first, "-•*▪▸►◆☐☑✓✔".contains(first) {
            s.removeFirst()
        }

        // "1.", "1)"
        if let match = s.range(of: #"^\s*\d+[\.\)]\s*"#, options: .regularExpression) {
            s.removeSubrange(match)
        }

        // "[ ]" / "[x]"
        if let match = s.range(of: #"^\s*\[[ xX]?\]\s*"#, options: .regularExpression) {
            s.removeSubrange(match)
        }

        return s.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Flattened `(keyword, category)` rules ordered longest-keyword-first.
    ///
    /// US-591: length ordering is what makes "peanut butter" beat "butter" and
    /// "ground beef" beat "beef" without a hand-maintained priority column.
    private static let orderedCategoryRules: [(keyword: String, category: String)] = {
        var flat: [(keyword: String, category: String)] = []
        for (category, keywords) in categoryKeywords {
            for keyword in keywords { flat.append((keyword, category)) }
        }
        return flat.sorted { $0.keyword.count > $1.keyword.count }
    }()

    /// US-591: whole-word (not substring) keyword matching.
    ///
    /// `lower.contains(keyword)` filed "graham crackers" under protein (it
    /// contains "ham"), "hamburger buns" under protein, and "peanut butter"
    /// under dairy. Mirrors the word-boundary fix already applied to
    /// `UnitInference.infer` for "egg" vs "eggplant" (US-493).
    private static func inferCategory(_ name: String) -> String {
        let lower = name.lowercased()
        for rule in orderedCategoryRules where containsWord(lower, rule.keyword) {
            return rule.category
        }
        return "snack"
    }

    /// Category keywords that themselves contain " and " — the compound product
    /// names a bare " and " must not be split inside ("half and half",
    /// "salt and pepper"). Derived from `categoryKeywords` so the two can't
    /// drift apart.
    private static let compoundKeywords: [String] = orderedCategoryRules
        .map(\.keyword)
        .filter { $0.contains(" and ") }

    private static func containsCompoundKeyword(_ text: String) -> Bool {
        let lower = text.lowercased()
        return compoundKeywords.contains { lower.contains($0) }
    }

    /// True when `keyword` appears in `haystack` on word boundaries, allowing a
    /// trailing plural/`y` suffix so stems like "strawberr" still match
    /// "strawberry"/"strawberries" while "ham" does not match "graham".
    private static func containsWord(_ haystack: String, _ keyword: String) -> Bool {
        guard !keyword.isEmpty else { return false }
        var searchStart = haystack.startIndex
        while let range = haystack.range(of: keyword, range: searchStart..<haystack.endIndex) {
            let precededByLetter = range.lowerBound > haystack.startIndex
                && haystack[haystack.index(before: range.lowerBound)].isLetter
            if !precededByLetter {
                // Allow an optional plural / "y" suffix, then require a
                // non-letter (or end of string).
                var after = range.upperBound
                for suffix in ["ies", "es", "s", "y"] {
                    if haystack[after...].hasPrefix(suffix) {
                        after = haystack.index(after, offsetBy: suffix.count)
                        break
                    }
                }
                if after == haystack.endIndex || !haystack[after].isLetter {
                    return true
                }
            }
            searchStart = haystack.index(after: range.lowerBound)
            if searchStart >= haystack.endIndex { break }
        }
        return false
    }

    private static func titleCase(_ s: String) -> String {
        s.split(separator: " ")
            .map { $0.prefix(1).uppercased() + $0.dropFirst() }
            .joined(separator: " ")
    }
}
