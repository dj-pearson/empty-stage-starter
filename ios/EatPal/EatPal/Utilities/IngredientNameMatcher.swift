import Foundation

/// US-360: match a pantry food name against a recipe ingredient line without
/// the raw-substring false positives (e.g. "oil" matching "broil"/"spoil").
///
/// Strategy:
///   1. Strip the leading quantity/unit off the ingredient line via
///      `IngredientTextParser` so "2 cloves garlic" → "garlic".
///   2. Tokenize both the (normalized) ingredient and the food name into
///      whole words and require the food name's words to be a subset of the
///      ingredient's words — i.e. word-boundary matching, not substring.
enum IngredientNameMatcher {

    /// Whole-word tokens of `text`, lowercased, punctuation/whitespace split.
    static func tokens(of text: String) -> Set<String> {
        Set(
            text.lowercased()
                .components(separatedBy: CharacterSet.alphanumerics.inverted)
                .filter { !$0.isEmpty }
        )
    }

    /// Tokens of an ingredient *line* after the parser removes quantity/unit.
    static func ingredientTokens(of line: String) -> Set<String> {
        tokens(of: IngredientTextParser.parse(line).name)
    }

    /// True when every word of `foodName` appears as a whole word in the
    /// ingredient line. "garlic" matches "2 cloves garlic"; "oil" does not
    /// match "broiled chicken".
    static func matches(foodName: String, ingredientLine: String) -> Bool {
        let foodTokens = tokens(of: foodName)
        guard !foodTokens.isEmpty else { return false }
        return foodTokens.isSubset(of: ingredientTokens(of: ingredientLine))
    }
}
