import Foundation

/// US-224: Helpers for scaling a recipe's serving count and the ingredient
/// quantities embedded in its free-form `additionalIngredients` string.
enum RecipeScaling {

    /// Parse the leading integer in a servings string like "4", "Serves 4-6",
    /// or "about 2". Falls back to 1 when no number is found.
    static func parseOriginalServings(_ raw: String?) -> Int {
        guard let raw, !raw.isEmpty else { return 1 }
        let pattern = #"(\d+)"#
        if let match = raw.range(of: pattern, options: .regularExpression),
           let value = Int(raw[match]),
           value > 0 {
            return value
        }
        return 1
    }

    /// Scale every comma-delimited ingredient line in `text`.
    /// Each line is scanned for a leading quantity token (integer, decimal, or
    /// unicode fraction like `½`) which is multiplied by `scale` and replaced.
    /// Lines without a quantity are left verbatim.
    static func scaleIngredientsText(_ text: String, scale: Double) -> String {
        let parts = text
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        let scaled = parts.map { scaleIngredientLine($0, scale: scale) }
        return scaled.joined(separator: ", ")
    }

    /// Scale a single ingredient phrase by rewriting a leading quantity
    /// (if present). `1 cup milk` × 2.0 → `2 cup milk`.
    static func scaleIngredientLine(_ line: String, scale: Double) -> String {
        guard scale != 1.0 else { return line }

        // Match: optional whole int + optional fraction ASCII, OR a unicode
        // vulgar fraction, OR a decimal number. We deliberately keep this
        // tolerant — unparseable lines pass through.
        let pattern = #"^\s*((\d+\s+\d+/\d+)|(\d+/\d+)|(\d*\.?\d+)|([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]))\s*"#

        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(
                in: line,
                range: NSRange(line.startIndex..<line.endIndex, in: line)
              ),
              let numberRange = Range(match.range(at: 1), in: line) else {
            return line
        }

        let quantityToken = String(line[numberRange])
        guard let originalValue = parseQuantity(quantityToken) else {
            return line
        }

        let scaled = originalValue * scale
        let replacement = formatQuantity(scaled)
        let remainder = line[numberRange.upperBound...].trimmingCharacters(in: .whitespaces)
        return remainder.isEmpty ? replacement : "\(replacement) \(remainder)"
    }

    // MARK: - Quantity parsing / formatting

    private static let vulgarFractions: [Character: Double] = [
        "½": 0.5, "⅓": 1.0/3, "⅔": 2.0/3,
        "¼": 0.25, "¾": 0.75,
        "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8,
        "⅙": 1.0/6, "⅚": 5.0/6,
        "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
    ]

    private static func parseQuantity(_ raw: String) -> Double? {
        let trimmed = raw.trimmingCharacters(in: .whitespaces)

        if trimmed.count == 1, let value = vulgarFractions[trimmed.first!] {
            return value
        }

        // Mixed form "1 1/2"
        let parts = trimmed.split(separator: " ")
        if parts.count == 2,
           let whole = Double(parts[0]),
           let frac = parseSimpleFraction(String(parts[1])) {
            return whole + frac
        }

        if trimmed.contains("/"), let frac = parseSimpleFraction(trimmed) {
            return frac
        }

        return Double(trimmed)
    }

    private static func parseSimpleFraction(_ raw: String) -> Double? {
        let parts = raw.split(separator: "/")
        guard parts.count == 2,
              let numerator = Double(parts[0]),
              let denominator = Double(parts[1]),
              denominator != 0 else {
            return nil
        }
        return numerator / denominator
    }

    /// Render a double as a friendly quantity string. Prefers common vulgar
    /// fractions, falls back to a trimmed decimal.
    static func formatQuantity(_ value: Double) -> String {
        guard value > 0 else { return "0" }

        let whole = floor(value)
        let fraction = value - whole
        let wholePart = Int(whole)

        if fraction < 0.02 {
            return "\(wholePart)"
        }

        // Map a small set of common fractions back to unicode glyphs.
        let commonFractions: [(Double, String)] = [
            (0.125, "⅛"), (0.25, "¼"), (1.0/3, "⅓"),
            (0.375, "⅜"), (0.5, "½"), (0.625, "⅝"),
            (2.0/3, "⅔"), (0.75, "¾"), (0.875, "⅞"),
        ]

        for (target, glyph) in commonFractions where abs(fraction - target) < 0.03 {
            return wholePart == 0 ? glyph : "\(wholePart) \(glyph)"
        }

        let formatter = NumberFormatter()
        formatter.maximumFractionDigits = 2
        formatter.minimumFractionDigits = 0
        return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
    }
}
