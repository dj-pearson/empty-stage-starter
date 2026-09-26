import Foundation

/// The allergen comparison the web planner and the edge functions use
/// (supabase/functions/_shared/allergens.ts), ported so iOS agrees with them.
///
/// iOS compared kid and food allergens as exact lowercase strings, so
/// "Peanuts" vs "peanut", "en:tree-nuts" vs "tree nuts" and "dairy" vs "milk"
/// all read as safe, and a food tagged "almonds" never hit a tree-nut allergy.
/// Both sides now go through `canonical` (prefix, separators, plural,
/// synonyms) and the one-way family map before they are compared, and a food
/// with no tags is still caught by its name ("Almond butter").
///
/// Keep the tables in step with allergens.ts; AllergenMatcherTests pins the
/// same variants the Deno and vitest suites do.
enum AllergenMatcher {

    // MARK: - Normalizing

    /// Lowercase, drop a language prefix ("en:"), unify separators, singularize.
    static func normalize(_ value: String) -> String {
        var s = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        s = dropLanguagePrefix(s)
        s = s.replacingOccurrences(of: "_", with: " ").replacingOccurrences(of: "-", with: " ")
        s = s.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
        return singularize(s)
    }

    /// normalize, then fold known synonyms onto the kid picker's word.
    static func canonical(_ value: String) -> String {
        let n = normalize(value)
        return synonyms[n] ?? n
    }

    private static func dropLanguagePrefix(_ s: String) -> String {
        let chars = Array(s)
        guard chars.count >= 3, chars[2] == ":",
              chars[0].isASCII, chars[0].isLetter,
              chars[1].isASCII, chars[1].isLetter else { return s }
        return String(chars.dropFirst(3))
    }

    /// "strawberries" -> "strawberry", "tomatoes" -> "tomato",
    /// "peaches" -> "peach", then a bare trailing "s". Only the end of the
    /// string is touched, which is the last word of a phrase.
    private static func singularize(_ s: String) -> String {
        let n = s.count
        if n > 4 && s.hasSuffix("ies") { return String(s.dropLast(3)) + "y" }
        if n > 4 && s.hasSuffix("oes") { return String(s.dropLast(2)) }
        if n > 5 && (s.hasSuffix("ches") || s.hasSuffix("shes")) { return String(s.dropLast(2)) }
        if n > 3 && s.hasSuffix("s") && !s.hasSuffix("ss") { return String(s.dropLast()) }
        return s
    }

    // MARK: - Tables (mirror allergens.ts)

    private static let synonyms: [String: String] = [
        "sesame seed": "sesame",
        "soybean": "soy",
        "soya": "soy",
        "gluten": "wheat",
        "nut": "tree nut",
        "crustacean": "shellfish",
        "mollusc": "shellfish",
        "mollusk": "shellfish",
        "dairy": "milk",
        "lactose": "milk",
    ]

    /// One way only: the family catches its members, a member does not catch
    /// the family. See allergens.ts for why coconut and pine nut are out.
    private static let families: [String: [String]] = [
        "tree nut": [
            "almond", "cashew", "walnut", "pecan", "pistachio", "hazelnut", "filbert",
            "macadamia", "brazil nut", "chestnut", "marzipan", "praline",
        ],
        "shellfish": [
            "shrimp", "crab", "lobster", "prawn", "crayfish", "crawfish", "langoustine",
            "scallop", "clam", "mussel", "oyster", "squid", "calamari", "octopus",
        ],
        "fish": [
            "salmon", "tuna", "cod", "tilapia", "trout", "halibut", "haddock", "pollock",
            "sardine", "anchovy", "anchovie", "mackerel", "catfish", "snapper", "swordfish",
            "herring", "flounder", "mahi mahi", "sea bass", "whitefish",
        ],
        "milk": [
            "cheese", "butter", "buttermilk", "yogurt", "yoghurt", "cream", "whey", "casein",
            "caseinate", "ghee", "kefir", "mozzarella", "cheddar", "parmesan", "ricotta", "feta",
        ],
        "wheat": [
            "spelt", "semolina", "durum", "farina", "farro", "kamut", "einkorn", "emmer",
            "bulgur", "couscous", "seitan", "triticale",
        ],
        "egg": ["egg white", "egg yolk", "meringue", "mayonnaise"],
        "soy": ["tofu", "edamame", "tempeh", "miso"],
        "sesame": ["tahini"],
    ]

    /// normalized member -> family key.
    private static let familyOf: [String: String] = {
        var out: [String: String] = [:]
        for (family, members) in families {
            for m in members { out[normalize(m)] = family }
        }
        return out
    }()

    private static func hitsKey(_ foodCanonical: String, kid: Set<String>) -> String? {
        if kid.contains(foodCanonical) { return foodCanonical }
        if let family = familyOf[foodCanonical], kid.contains(family) { return family }
        return nil
    }

    // MARK: - Free-text scan

    /// Guard phrases are tokenized once here; the scan runs for every row
    /// on every render.
    private struct TextTerm {
        let words: [String]
        let key: String
        var notAfter: [[String]] = []
        var notBefore: [[String]] = []
    }

    private static let plantPrefixes = [
        "almond", "oat", "soy", "soya", "rice", "coconut", "cashew", "hemp", "pea", "flax",
        "macadamia", "hazelnut", "pecan", "walnut", "pistachio", "peanut", "sunflower",
        "pumpkin", "sesame", "seed", "nut", "apple", "cocoa", "cacao", "shea", "vegan",
    ]

    /// Lowercase letters only, split to words, each singularized.
    private static func tokenize(_ text: String) -> [String] {
        let lowered = dropLanguagePrefix(text.lowercased())
        let spaced = String(lowered.map { ($0.isASCII && $0.isLetter) ? $0 : " " })
        return spaced.split(separator: " ").map { singularize(String($0)) }
    }

    private static let textTerms: [TextTerm] = {
        var terms: [TextTerm] = []
        func add(_ phrase: String, notAfter: [String] = [], notBefore: [String] = []) {
            terms.append(TextTerm(
                words: tokenize(phrase),
                key: canonical(phrase),
                notAfter: notAfter.map(tokenize),
                notBefore: notBefore.map(tokenize)
            ))
        }
        add("peanut")
        add("tree nut")
        add("nut", notAfter: ["pea", "ground", "tiger", "water", "dough", "coco"])
        add("milk", notAfter: plantPrefixes.filter { !["cocoa", "cacao", "shea"].contains($0) })
        add("dairy")
        add("lactose")
        add("egg", notBefore: ["plant"])
        add("fish", notAfter: ["swedish", "gold", "star", "jelly", "cuttle"])
        add("shellfish")
        add("crustacean")
        add("mollusc")
        add("mollusk")
        add("soy")
        add("soya")
        add("soybean")
        add("wheat")
        add("gluten")
        add("sesame")
        add("sesame seed")
        let guarded: [String: (notAfter: [String], notBefore: [String])] = [
            "chestnut": (["water"], []),
            "butter": (plantPrefixes, ["bean", "lettuce", "squash", "nut"]),
            "cream": (["coconut", "cashew", "oat", "soy", "vegan"], ["of tartar"]),
            "yogurt": (plantPrefixes, []),
            "yoghurt": (plantPrefixes, []),
            "cheese": (["vegan", "cashew", "plant"], []),
            "crab": ([], ["apple"]),
            "mayonnaise": (["vegan", "eggless"], []),
        ]
        // Sorted so the scan order is stable between runs.
        for family in families.keys.sorted() {
            for m in families[family] ?? [] {
                let g = guarded[m]
                add(m, notAfter: g?.notAfter ?? [], notBefore: g?.notBefore ?? [])
            }
        }
        return terms
    }()

    private static func termKeys(_ key: String) -> [String] {
        if let family = familyOf[key] { return [key, family] }
        return [key]
    }

    private static let vocabularyKeys: Set<String> = Set(textTerms.flatMap { termKeys($0.key) })

    private static let wordKeys: [String: Set<String>] = {
        var out: [String: Set<String>] = [:]
        for term in textTerms where term.words.count == 1 {
            out[term.words[0], default: []].formUnion(termKeys(term.key))
        }
        return out
    }()

    private static let negatingBefore: Set<String> = ["no", "non", "without"]

    private static func sequenceAt(_ tokens: [String], _ at: Int, _ words: [String]) -> Bool {
        guard at >= 0, !words.isEmpty, at + words.count <= tokens.count else { return false }
        for j in 0..<words.count where tokens[at + j] != words[j] { return false }
        return true
    }

    private static func token(_ tokens: [String], _ i: Int) -> String? {
        (i >= 0 && i < tokens.count) ? tokens[i] : nil
    }

    private static func termAt(_ tokens: [String], _ i: Int, _ term: TextTerm) -> Bool {
        let n = term.words.count
        for j in 0..<n where token(tokens, i + j) != term.words[j] { return false }
        let prev = token(tokens, i - 1)
        // "nut-free", "dairy free"; "free-range" is not "free".
        if token(tokens, i + n) == "free" && token(tokens, i + n + 1) != "range" { return false }
        // "non-dairy", "no nuts", "without eggs".
        if let prev, negatingBefore.contains(prev) { return false }
        // "dairy-free cheese": the free-of word covers this term.
        if prev == "free", let freeWord = token(tokens, i - 2), let freeOf = wordKeys[freeWord],
           termKeys(term.key).contains(where: { freeOf.contains($0) }) {
            return false
        }
        for phrase in term.notAfter where sequenceAt(tokens, i - phrase.count, phrase) {
            return false
        }
        for phrase in term.notBefore where sequenceAt(tokens, i + n, phrase) {
            return false
        }
        return true
    }

    /// Canonical allergens a piece of free text names, plus the family of any
    /// member ("Almond flour" -> ["almond", "tree nut"]). Whole words only, so
    /// "butternut squash", "nutmeg", "coconut" and "eggplant" name nothing.
    static func allergensInText(_ text: String) -> Set<String> {
        let tokens = tokenize(text)
        var out: Set<String> = []
        guard !tokens.isEmpty else { return out }
        for term in textTerms where term.words.count <= tokens.count {
            for i in 0...(tokens.count - term.words.count) where termAt(tokens, i, term) {
                out.formUnion(termKeys(term.key))
                break
            }
        }
        return out
    }

    /// A kid's custom allergen ("kiwi") named as whole words. Keys the
    /// vocabulary covers are left to its guarded terms.
    private static func textNamesKey(_ tokens: [String], _ key: String) -> Bool {
        if vocabularyKeys.contains(key) { return false }
        let words = tokenize(key)
        guard !words.isEmpty, words.count <= tokens.count else { return false }
        let term = TextTerm(words: words, key: key)
        for i in 0...(tokens.count - words.count) where termAt(tokens, i, term) { return true }
        return false
    }

    // MARK: - Matching

    private static func kidKeys(_ kidAllergens: [String]?) -> Set<String> {
        Set(orderedKidKeys(kidAllergens))
    }

    /// Kid keys in the order the parent entered them, as the TS Set iterates,
    /// so with two hits iOS reports the same one the web does.
    private static func orderedKidKeys(_ kidAllergens: [String]?) -> [String] {
        var seen: Set<String> = []
        var out: [String] = []
        for key in (kidAllergens ?? []).map(canonical) where !key.isEmpty && !seen.contains(key) {
            seen.insert(key)
            out.append(key)
        }
        return out
    }

    /// First allergen in the food's tag list the child reacts to (kid-side
    /// canonical key), or nil.
    static func matching(kidAllergens: [String]?, foodAllergens: [String]?) -> String? {
        let kid = kidKeys(kidAllergens)
        guard !kid.isEmpty else { return nil }
        for a in foodAllergens ?? [] {
            let n = canonical(a)
            if n.isEmpty { continue }
            if let hit = hitsKey(n, kid: kid) { return hit }
        }
        return nil
    }

    /// `matching` over the whole food: its tags, then the words of each tag
    /// ("Peanut Oil") and of the food's name ("Almond butter" with no tags).
    static func matching(kidAllergens: [String]?, foodName: String, foodAllergens: [String]?) -> String? {
        let kid = orderedKidKeys(kidAllergens)
        guard !kid.isEmpty else { return nil }
        if let direct = matching(kidAllergens: kidAllergens, foodAllergens: foodAllergens) {
            return direct
        }
        for text in (foodAllergens ?? []) + [foodName] {
            let named = allergensInText(text)
            for key in kid where named.contains(key) { return key }
            let tokens = tokenize(text)
            for key in kid where textNamesKey(tokens, key) { return key }
        }
        return nil
    }

    /// The allergen `food` carries for `kid`, or nil when it is clear.
    static func hit(for kid: Kid, food: Food) -> String? {
        matching(kidAllergens: kid.allergens, foodName: food.name, foodAllergens: food.allergens)
    }

    /// The recorded severity for a kid-side key, matched canonically, or nil.
    static func recordedSeverity(for kid: Kid, key: String) -> String? {
        guard let map = kid.allergenSeverity else { return nil }
        let want = canonical(key)
        for (k, v) in map where canonical(k) == want {
            let level = v.lowercased()
            if ["mild", "moderate", "severe"].contains(level) { return level }
        }
        return nil
    }
}
