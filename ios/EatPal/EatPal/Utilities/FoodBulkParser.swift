import Foundation

/// US-244: Parses free-form pasted text into a list of foods to bulk-add.
/// Supports three input shapes (auto-detected per line):
///   1. `name, category`         — explicit category
///   2. `2 cups milk`            — quantity + unit + name
///   3. `milk`                   — bare name
/// Lines that the parser can't make sense of are dropped silently.
enum FoodBulkParser {

    struct ParsedRow: Identifiable, Equatable {
        let id = UUID()
        var name: String
        var category: FoodCategory
        var quantity: Double?
        var unit: String?
    }

    /// Parse pasted text into a list of editable rows.
    static func parse(_ raw: String) -> [ParsedRow] {
        let lines = raw
            .split(whereSeparator: { $0.isNewline })
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }

        return lines.compactMap { parseLine($0) }
    }

    /// Parse a single line into a row. Returns nil if the line is unusable.
    static func parseLine(_ rawLine: String) -> ParsedRow? {
        // Shape 1: explicit "name, category" — comma followed by a token.
        if let commaIndex = rawLine.lastIndex(of: ",") {
            let namePart = rawLine[..<commaIndex].trimmingCharacters(in: .whitespaces)
            let categoryPart = rawLine[rawLine.index(after: commaIndex)...]
                .trimmingCharacters(in: .whitespaces)
                .lowercased()

            if !namePart.isEmpty,
               let category = FoodCategory(rawValue: categoryPart) {
                // The name part may still carry a leading quantity/unit
                // ("2 cups milk, dairy") — pull those off so "2 cups" doesn't
                // pollute the food name.
                var name = namePart
                var quantity: Double?
                var unit: String?
                if let lead = leadingQuantity(namePart) {
                    let remainder = String(namePart[lead.tail...])
                        .trimmingCharacters(in: .whitespaces)
                    if !remainder.isEmpty {
                        let (strippedUnit, strippedName) = stripLeadingUnit(remainder)
                        if !strippedName.isEmpty {
                            quantity = lead.value
                            unit = strippedUnit
                            name = strippedName
                        }
                    }
                }
                return ParsedRow(
                    name: name,
                    category: category,
                    quantity: quantity,
                    unit: unit
                )
            }
        }

        // Shape 2: "<qty> <unit?> <name>" — leading number.
        if let leadingMatch = leadingQuantity(rawLine) {
            let remainder = String(rawLine[leadingMatch.tail...]).trimmingCharacters(in: .whitespaces)
            guard !remainder.isEmpty else { return nil }

            let (unit, name) = stripLeadingUnit(remainder)
            guard !name.isEmpty else { return nil }

            return ParsedRow(
                name: name,
                category: guessCategory(for: name),
                quantity: leadingMatch.value,
                unit: unit
            )
        }

        // Shape 3: bare name.
        return ParsedRow(
            name: rawLine,
            category: guessCategory(for: rawLine),
            quantity: nil,
            unit: nil
        )
    }

    // MARK: - Category guessing

    private static let categoryKeywords: [(FoodCategory, [String])] = [
        (.dairy, ["milk", "cheese", "yogurt", "butter", "cream", "kefir"]),
        (.protein, [
            "chicken", "beef", "pork", "turkey", "fish", "salmon", "tuna",
            "egg", "tofu", "lentil", "bean", "lamb", "shrimp", "sausage", "bacon"
        ]),
        (.carb, [
            "bread", "rice", "pasta", "noodle", "quinoa", "oat", "tortilla",
            "cracker", "cereal", "bagel", "muffin", "bun"
        ]),
        (.fruit, [
            "apple", "banana", "berry", "orange", "grape", "melon", "peach",
            "pear", "plum", "mango", "pineapple", "kiwi", "strawberry",
            "blueberry", "raspberry"
        ]),
        (.vegetable, [
            "broccoli", "carrot", "lettuce", "spinach", "kale", "tomato",
            "potato", "onion", "pepper", "cucumber", "celery", "zucchini",
            "squash", "pea", "corn", "mushroom", "asparagus", "cauliflower",
            "eggplant"
        ]),
        (.snack, [
            "chip", "candy", "chocolate", "cookie", "popcorn", "pretzel",
            "granola", "bar"
        ]),
    ]

    /// Compound phrases checked before single-word keywords. "peanut butter"
    /// must not classify as dairy (contains "butter") or vegetable (contains
    /// "pea") — it's a nut/protein spread.
    private static let compoundKeywords: [(FoodCategory, [String])] = [
        (.protein, ["peanut butter", "almond butter", "nut butter", "peanut"]),
    ]

    static func guessCategory(for name: String) -> FoodCategory {
        let normalized = name.lowercased()

        for (category, phrases) in compoundKeywords
        where phrases.contains(where: { normalized.contains($0) }) {
            return category
        }

        // Whole-word, plural-aware matching so "egg" doesn't match "eggplant"
        // and "pea" doesn't match "peanut", while "eggs"/"oats"/"beans" still
        // match their singular keyword.
        let tokens = Set(
            normalized
                .components(separatedBy: CharacterSet.alphanumerics.inverted)
                .filter { !$0.isEmpty }
                .map(singularize)
        )
        for (category, keywords) in categoryKeywords
        where keywords.contains(where: { tokens.contains(singularize($0)) }) {
            return category
        }
        return .snack
    }

    /// Naive English singularization mirroring RecipeMatcher: -ies→-y,
    /// -es→stem for -o/-x/-s/-z/-ch/-sh stems, else drop a trailing -s.
    private static func singularize(_ word: String) -> String {
        guard word.count > 3 else { return word }
        if word.count > 4, word.hasSuffix("ies") {
            return String(word.dropLast(3)) + "y"
        }
        if word.count > 4, word.hasSuffix("es") {
            let stem = String(word.dropLast(2))
            if let last = stem.last,
               "oxsz".contains(last) || stem.hasSuffix("ch") || stem.hasSuffix("sh") {
                return stem
            }
        }
        if word.hasSuffix("s") {
            return String(word.dropLast())
        }
        return word
    }

    // MARK: - Quantity / unit helpers

    private struct LeadingQuantity {
        let value: Double
        /// Index in the source string of the first character AFTER the
        /// quantity token (already past trailing whitespace).
        let tail: String.Index
    }

    private static func leadingQuantity(_ line: String) -> LeadingQuantity? {
        let pattern = #"^\s*(\d+(?:\.\d+)?(?:\s+\d+/\d+)?|\d+/\d+)\s+"#
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(
                in: line,
                range: NSRange(line.startIndex..<line.endIndex, in: line)
              ),
              let numberRange = Range(match.range(at: 1), in: line),
              let fullRange = Range(match.range, in: line) else {
            return nil
        }

        let token = String(line[numberRange])
        guard let value = parseQuantity(token) else { return nil }
        return LeadingQuantity(value: value, tail: fullRange.upperBound)
    }

    private static let knownUnits: Set<String> = [
        "cup", "cups", "tbsp", "tsp", "oz", "lb", "lbs", "g", "gram", "grams",
        "kg", "ml", "l", "liter", "liters", "pint", "pints", "quart", "quarts",
        "gallon", "gallons", "can", "cans", "jar", "jars", "pack", "packs",
        "box", "boxes", "bag", "bags", "bottle", "bottles", "stick", "sticks",
        "slice", "slices", "piece", "pieces"
    ]

    /// If the first whitespace-delimited token of `text` is a known unit,
    /// strip and normalize it; otherwise return ("count", text) unchanged.
    private static func stripLeadingUnit(_ text: String) -> (unit: String?, name: String) {
        let parts = text.split(separator: " ", maxSplits: 1, omittingEmptySubsequences: true)
        guard parts.count == 2 else { return (nil, text) }

        let candidate = String(parts[0]).lowercased()
        if knownUnits.contains(candidate) {
            return (candidate, String(parts[1]).trimmingCharacters(in: .whitespaces))
        }
        return (nil, text)
    }

    private static func parseQuantity(_ raw: String) -> Double? {
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        if trimmed.contains("/") {
            let parts = trimmed.split(separator: " ")
            if parts.count == 2,
               let whole = Double(parts[0]),
               let frac = parseFraction(String(parts[1])) {
                return whole + frac
            }
            if parts.count == 1 {
                return parseFraction(trimmed)
            }
        }
        return Double(trimmed)
    }

    private static func parseFraction(_ raw: String) -> Double? {
        let parts = raw.split(separator: "/")
        guard parts.count == 2,
              let n = Double(parts[0]),
              let d = Double(parts[1]),
              d != 0 else { return nil }
        return n / d
    }
}
