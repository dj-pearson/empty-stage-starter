import Foundation

/// Lightweight Swift port of `src/lib/parse-grocery-text.ts`.
/// Optimised for spoken input (voice-to-grocery, US-140) and pasted free text
/// (screenshot OCR, US-141). Outputs `ParsedGroceryItem` values ready to be
/// materialised into `GroceryItem` rows.
///
/// Intentionally simpler than the TS original — regex-heavy quantity parsing
/// isn't needed for the speech path because SFSpeechRecognizer already
/// normalises numerals ("two pounds of chicken" → "2 pounds of chicken").
struct ParsedGroceryItem: Equatable, Identifiable {
    let id = UUID()
    var name: String
    var quantity: Double
    var unit: String
    var category: String  // FoodCategory.rawValue

    /// Approximate confidence in the parse, 0.0–1.0. Low confidence items can
    /// be surfaced with a review prompt before insert.
    var confidence: Double
}

enum GroceryTextParser {
    // MARK: - Dictionaries

    private static let categoryKeywords: [(category: String, keywords: [String])] = [
        ("protein", [
            "chicken", "beef", "pork", "turkey", "salmon", "tuna", "shrimp", "fish",
            "steak", "ground beef", "bacon", "sausage", "ham", "lamb", "tofu",
            "eggs", "egg", "meatball", "hot dog", "deli", "jerky", "bison",
            "tilapia", "cod", "crab", "lobster", "scallop", "clam", "mussel"
        ]),
        ("dairy", [
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
            "trail mix", "nut", "almond", "peanut butter", "jelly", "jam", "honey",
            "syrup", "ketchup", "mustard", "mayo", "ranch", "salsa", "hummus",
            "dressing", "sauce", "juice", "soda", "coffee", "tea", "kombucha"
        ])
    ]

    private static let unitMap: [String: String] = [
        "lb": "lbs", "lbs": "lbs", "pound": "lbs", "pounds": "lbs",
        "oz": "oz", "ounce": "oz", "ounces": "oz",
        "g": "g", "gram": "g", "grams": "g",
        "kg": "kg", "kilo": "kg", "kilos": "kg", "kilogram": "kg", "kilograms": "kg",
        "gal": "gal", "gallon": "gal", "gallons": "gal",
        "qt": "qt", "quart": "qt", "quarts": "qt",
        "pt": "pt", "pint": "pt", "pints": "pt",
        "cup": "cups", "cups": "cups",
        "tbsp": "tbsp", "tablespoon": "tbsp", "tablespoons": "tbsp",
        "tsp": "tsp", "teaspoon": "tsp", "teaspoons": "tsp",
        "l": "L", "liter": "L", "liters": "L",
        "ml": "ml", "milliliter": "ml", "milliliters": "ml",
        "bunch": "bunch", "bunches": "bunch",
        "bag": "bags", "bags": "bags",
        "box": "boxes", "boxes": "boxes",
        "can": "cans", "cans": "cans",
        "jar": "jars", "jars": "jars",
        "bottle": "bottles", "bottles": "bottles",
        "pack": "packs", "packs": "packs", "package": "packs", "packages": "packs",
        "dozen": "dozen",
        "loaf": "loaves", "loaves": "loaves",
        "stick": "sticks", "sticks": "sticks"
    ]

    /// Word-form numbers commonly produced by SFSpeechRecognizer.
    private static let numberWords: [String: Double] = [
        "a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
        "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
        "eleven": 11, "twelve": 12, "half": 0.5, "quarter": 0.25
    ]

    private static let sentinelTokens: Set<String> = ["of", "and", "also", "plus", "some"]

    // MARK: - Public API

    /// Parse freeform text into grocery items. Accepts comma-separated, newline-separated,
    /// or spoken phrases joined by " and " / " also ".
    static func parse(_ text: String) -> [ParsedGroceryItem] {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }

        // Split on common separators. Prefer newlines > commas > " and " / " also ".
        let separators: CharacterSet = CharacterSet(charactersIn: "\n,;")
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

        var items: [ParsedGroceryItem] = []
        var seenNames: Set<String> = []

        for rawPhrase in phrases {
            guard let parsed = parsePhrase(rawPhrase) else { continue }
            let key = parsed.name.lowercased()
            if seenNames.contains(key) { continue }
            seenNames.insert(key)
            items.append(parsed)
        }

        return items
    }

    // MARK: - Phrase parser

    private static func parsePhrase(_ phrase: String) -> ParsedGroceryItem? {
        // Clean leading bullets / numbers / checkboxes so we handle pasted lists too.
        var cleaned = phrase.trimmingCharacters(in: .whitespacesAndNewlines)
        cleaned = stripListMarkers(cleaned)
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

    private static func parseNumber(_ token: String) -> Double? {
        // Plain number / decimal
        if let value = Double(token), value > 0 { return value }

        // Word form
        if let value = numberWords[token] { return value }

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

    private static func inferCategory(_ name: String) -> String {
        let lower = name.lowercased()
        for (category, keywords) in categoryKeywords {
            if keywords.contains(where: { lower.contains($0) }) {
                return category
            }
        }
        return "snack"
    }

    private static func titleCase(_ s: String) -> String {
        s.split(separator: " ")
            .map { $0.prefix(1).uppercased() + $0.dropFirst() }
            .joined(separator: " ")
    }
}
