import Foundation

/// US-359 / US-402: best-effort splitting of a recipe instructions blob into
/// numbered steps. Prefers explicit line/bullet/number delimiters; falls back
/// to Foundation's sentence tokenizer (which doesn't split on decimals like
/// "1.5" or abbreviations like "tbsp."). A single-blob instruction with no
/// real breaks stays one step.
enum RecipeStepParser {
    static func parse(_ raw: String?) -> [String] {
        guard let raw = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else {
            return []
        }
        let bullet = #"^\s*(\d+\.|[-*•])\s*"#
        let regex = try? NSRegularExpression(pattern: bullet)
        let lines = raw
            .components(separatedBy: .newlines)
            .map { line -> String in
                let nsLine = line as NSString
                let cleaned = regex?.stringByReplacingMatches(
                    in: line,
                    range: NSRange(location: 0, length: nsLine.length),
                    withTemplate: ""
                ) ?? line
                return cleaned.trimmingCharacters(in: .whitespaces)
            }
            .filter { !$0.isEmpty }
        if lines.count > 1 { return lines }

        let ns = raw as NSString
        var sentences: [String] = []
        ns.enumerateSubstrings(
            in: NSRange(location: 0, length: ns.length),
            options: .bySentences
        ) { substring, _, _, _ in
            if let s = substring?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty {
                sentences.append(s)
            }
        }
        return sentences.count > 1 ? sentences : [raw]
    }
}
