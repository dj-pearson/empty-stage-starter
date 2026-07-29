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
/// Intentionally simpler than the TS original — regex-heavy quantity parsing
/// isn't needed for the speech path because SFSpeechRecognizer already
/// normalises numerals ("two pounds of chicken" → "2 pounds of chicken").
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

    /// US-583: canonical form is the SINGULAR noun, matching
    /// `IngredientTextParser.unitTokens`, `UnitInference` and
    /// `src/lib/parse-grocery-text.ts`. This map used to emit plurals ("lbs",
    /// "cans") while the pantry stored singulars, so `UnitConverter` treated
    /// two quantities of the same unit as incomparable and grocery amounts
    /// never stacked.
    private static let unitMap: [String: String] = [
        "lb": "lb", "lbs": "lb", "pound": "lb", "pounds": "lb",
        "oz": "oz", "ounce": "oz", "ounces": "oz",
        "g": "g", "gram": "g", "grams": "g",
        "kg": "kg", "kilo": "kg", "kilos": "kg", "kilogram": "kg", "kilograms": "kg",
        "gal": "gal", "gallon": "gal", "gallons": "gal",
        "qt": "qt", "quart": "qt", "quarts": "qt",
        "pt": "pt", "pint": "pt", "pints": "pt",
        "cup": "cup", "cups": "cup",
        "tbsp": "tbsp", "tablespoon": "tbsp", "tablespoons": "tbsp",
        "tsp": "tsp", "teaspoon": "tsp", "teaspoons": "tsp",
        "l": "l", "liter": "l", "liters": "l",
        "ml": "ml", "milliliter": "ml", "milliliters": "ml",
        "bunch": "bunch", "bunches": "bunch",
        "bag": "bag", "bags": "bag",
        "box": "box", "boxes": "box",
        "can": "can", "cans": "can",
        "jar": "jar", "jars": "jar",
        "bottle": "bottle", "bottles": "bottle",
        "pack": "pack", "packs": "pack", "package": "pack", "packages": "pack",
        "dozen": "dozen",
        "loaf": "loaf", "loaves": "loaf",
        "stick": "stick", "sticks": "stick",
        "clove": "clove", "cloves": "clove",
        "slice": "slice", "slices": "slice",
        "head": "head", "heads": "head",
        "container": "container", "containers": "container",
        "carton": "carton", "cartons": "carton",
        "ct": "count", "count": "count", "piece": "count", "pieces": "count"
    ]

    /// Word-form numbers commonly produced by SFSpeechRecognizer.
    private static let numberWords: [String: Double] = [
        "a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
        "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
        "eleven": 11, "twelve": 12, "half": 0.5, "quarter": 0.25
    ]

    /// Filler dropped from the front of a name so the grocery list shows the
    /// noun rather than the preparation or a connective.
    ///
    /// US-590/592: articles ("a", "the") and size/prep adjectives used to
    /// survive, so "half a cup of milk" produced the name "A Cup Of Milk" and
    /// "3 large eggs" produced "Large Eggs". Note that "ground" is deliberately
    /// absent — see the matching note in `IngredientTextParser.leadingFillers`.
    private static let sentinelTokens: Set<String> = [
        "of", "and", "also", "plus", "some", "a", "an", "the",
        "whole", "fresh", "freshly", "ripe", "raw", "cooked",
        "large", "small", "medium", "extra", "jumbo",
        "organic", "boneless", "skinless", "lean", "frozen", "thawed",
        "chopped", "diced", "minced", "sliced", "shredded", "grated",
        "crushed", "peeled", "halved", "quartered",
        "softened", "melted", "cubed", "julienned"
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
            let connectorSplit = trimmed
                .replacingOccurrences(of: " and also ", with: ",")
                .replacingOccurrences(of: " and then ", with: ",")
                .replacingOccurrences(of: " and ", with: ",")
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
            // Only combine when the units agree; otherwise keep the larger
            // quantity's line rather than inventing a cross-unit total (the
            // share extension can't link UnitConverter — see project.yml).
            if items[existingIndex].unit.caseInsensitiveCompare(parsed.unit) == .orderedSame {
                items[existingIndex].quantity += parsed.quantity
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

    private static func parsePhrase(_ phrase: String) -> ParsedGroceryItem? {
        // Clean leading bullets / numbers / checkboxes so we handle pasted lists too.
        var cleaned = phrase.trimmingCharacters(in: .whitespacesAndNewlines)
        cleaned = stripListMarkers(cleaned)
        // US-592: drop parentheticals so "1 (14.5 oz) can diced tomatoes" no
        // longer yields a name beginning "(14.5".
        cleaned = stripParentheticals(cleaned)
        guard cleaned.count >= 2 else { return nil }

        var tokens = cleaned
            .lowercased()
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }

        guard !tokens.isEmpty else { return nil }

        var quantity: Double = 1
        var quantityMatched = false
        var unit = ""
        var confidence: Double = 0.6

        // 1) First token: numeric quantity or number word.
        if let firstNumeric = parseNumber(tokens[0]) {
            quantity = firstNumeric
            quantityMatched = true
            tokens.removeFirst()
            confidence = 0.8
        }

        // 2) Drop common filler like "of", "some".
        while let first = tokens.first, sentinelTokens.contains(first) {
            tokens.removeFirst()
        }

        // 3) Next token might be a unit.
        if let first = tokens.first, let normalizedUnit = unitMap[first] {
            unit = normalizedUnit
            tokens.removeFirst()
            if !quantityMatched { quantity = 1 }
            confidence = max(confidence, 0.85)
        }

        // 4) Drop filler again ("two pounds OF chicken").
        while let first = tokens.first, sentinelTokens.contains(first) {
            tokens.removeFirst()
        }

        guard !tokens.isEmpty else { return nil }

        let name = tokens.joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard name.count >= 2 else { return nil }

        let category = inferCategory(name)

        // If we never matched quantity or unit and the name is short, drop confidence.
        if !quantityMatched && unit.isEmpty && name.split(separator: " ").count == 1 {
            confidence = 0.7
        }

        return ParsedGroceryItem(
            name: titleCase(name),
            quantity: quantity,
            unit: unit,
            category: category,
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

    /// Vulgar-fraction characters mapped to their decimal value. Kept in sync
    /// with `IngredientTextParser.unicodeFractions`.
    private static let unicodeFractions: [Character: Double] = [
        "½": 0.5, "⅓": 1.0 / 3.0, "⅔": 2.0 / 3.0,
        "¼": 0.25, "¾": 0.75,
        "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8,
        "⅙": 1.0 / 6.0, "⅚": 5.0 / 6.0,
        "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875
    ]

    private static func parseNumber(_ token: String) -> Double? {
        // Plain number / decimal
        if let value = Double(token), value > 0 { return value }

        // Word form
        if let value = numberWords[token] { return value }

        // US-592: unicode vulgar fractions — "½ cup milk" used to leave the
        // glyph stranded on the front of the ingredient name.
        if token.count == 1, let first = token.first, let value = unicodeFractions[first] {
            return value
        }
        // Mixed unicode form: "1½".
        if let last = token.last, let fraction = unicodeFractions[last],
           let whole = Double(token.dropLast()), whole > 0 {
            return whole + fraction
        }

        // Fraction "1/2", "3/4"
        let parts = token.split(separator: "/")
        if parts.count == 2,
           let num = Double(parts[0]),
           let den = Double(parts[1]),
           den > 0 {
            return num / den
        }

        return nil
    }

    /// Removes `(...)` groups (non-nested) and collapses the resulting spaces.
    private static func stripParentheticals(_ input: String) -> String {
        var result = ""
        var depth = 0
        for ch in input {
            if ch == "(" { depth += 1; continue }
            if ch == ")" { depth = max(0, depth - 1); continue }
            if depth == 0 { result.append(ch) }
        }
        return result
            .split(separator: " ", omittingEmptySubsequences: true)
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
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
