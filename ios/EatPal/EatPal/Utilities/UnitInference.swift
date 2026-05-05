import Foundation

/// US-279: Smart unit + container inference for the grocery quick-add
/// flow. When the centralized catalog has no `default_unit` and the
/// user has no prior preference, we still want to default eggs to a
/// dozen, milk to a gallon, rice to a bag — not "1 count" of every
/// product on the planet.
///
/// Used as a tier-3.5 fallback in `SmartProductService.resolve` —
/// after the catalog miss but before the keyword-classifier fallback
/// returns "count, 1". The matching is name-substring-based so
/// "vanilla almond milk" hits the "milk" rule and "frozen rice bowl"
/// still hits the "rice" rule.
///
/// Keep entries lowercased and substring-friendly. Higher-priority
/// (more specific) terms come first; the first match wins.
enum UnitInference {

    /// One inference: the unit a shopper typically picks up + a
    /// reasonable starting quantity. Both are pre-fills the user can
    /// override before saving — the goal is to get the form 90% right
    /// before the keyboard pops up.
    struct Inference: Equatable {
        let unit: String
        let quantity: Double
    }

    /// Looks up an inference by name. Returns nil when no rule matches
    /// — caller falls back to keyword-classifier defaults ("count", 1).
    static func infer(name: String) -> Inference? {
        let needle = name
            .lowercased()
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !needle.isEmpty else { return nil }
        for (keywords, inference) in priorityOrderedRules {
            for kw in keywords where needle.contains(kw) {
                return inference
            }
        }
        return nil
    }

    /// Priority-ordered rule list. ~50 common products mapped to their
    /// usual unit + quantity. Order matters — compound and longer terms
    /// run first so "ice cream" doesn't match a generic "cream" rule.
    private static let priorityOrderedRules: [(keywords: [String], inference: Inference)] = [
        // Eggs almost always sold by the dozen.
        (["egg "], Inference(unit: "dozen", quantity: 1)),

        // Dairy beverages → gallon for milk, half-gallon for cream.
        (["whole milk", "skim milk", "almond milk", "oat milk", "soy milk", "coconut milk drink"],
         Inference(unit: "gal", quantity: 1)),
        (["milk"], Inference(unit: "gal", quantity: 1)),
        (["heavy cream", "half and half", "half-and-half"],
         Inference(unit: "pt", quantity: 1)),
        (["yogurt"], Inference(unit: "oz", quantity: 32)),
        (["cottage cheese", "ricotta"], Inference(unit: "oz", quantity: 16)),
        (["sour cream"], Inference(unit: "oz", quantity: 16)),

        // Cheeses by package.
        (["sliced cheese", "shredded cheese"], Inference(unit: "pack", quantity: 1)),
        (["block cheese", "cheddar", "mozzarella", "parmesan"],
         Inference(unit: "oz", quantity: 8)),

        // Butter.
        (["butter"], Inference(unit: "lb", quantity: 1)),

        // Proteins by weight.
        (["ground beef", "ground turkey", "ground pork", "ground chicken"],
         Inference(unit: "lb", quantity: 1)),
        (["chicken breast", "chicken thigh", "chicken leg"],
         Inference(unit: "lb", quantity: 2)),
        (["chicken wing"], Inference(unit: "lb", quantity: 2)),
        (["bacon"], Inference(unit: "pack", quantity: 1)),
        (["sausage", "hot dog", "bratwurst"], Inference(unit: "pack", quantity: 1)),
        (["salmon", "tuna steak", "cod", "tilapia", "halibut"],
         Inference(unit: "lb", quantity: 1)),
        (["shrimp"], Inference(unit: "lb", quantity: 1)),
        (["steak", "ribeye", "sirloin"], Inference(unit: "lb", quantity: 1)),

        // Bread + bakery.
        (["bread", "loaf"], Inference(unit: "loaf", quantity: 1)),
        (["bagel"], Inference(unit: "pack", quantity: 1)),
        (["english muffin", "tortilla", "pita"], Inference(unit: "pack", quantity: 1)),

        // Pantry staples.
        (["rice"], Inference(unit: "bag", quantity: 1)),
        (["flour", "sugar"], Inference(unit: "lb", quantity: 5)),
        (["pasta", "spaghetti", "penne", "macaroni", "lasagna noodle"],
         Inference(unit: "box", quantity: 1)),
        (["oats", "oatmeal", "cereal", "granola"],
         Inference(unit: "box", quantity: 1)),
        (["coffee beans", "ground coffee", "coffee"],
         Inference(unit: "bag", quantity: 1)),
        (["tea"], Inference(unit: "box", quantity: 1)),
        (["honey", "maple syrup", "syrup", "olive oil", "vegetable oil", "canola oil"],
         Inference(unit: "bottle", quantity: 1)),
        (["soy sauce", "vinegar", "ketchup", "mustard", "mayonnaise", "mayo", "hot sauce", "salsa"],
         Inference(unit: "bottle", quantity: 1)),
        (["peanut butter", "almond butter", "jam", "jelly", "preserves"],
         Inference(unit: "jar", quantity: 1)),

        // Canned goods.
        (["canned tomato", "diced tomato", "crushed tomato", "tomato sauce", "tomato paste"],
         Inference(unit: "can", quantity: 2)),
        (["black bean", "kidney bean", "chickpea", "garbanzo", "pinto bean", "white bean", "refried bean"],
         Inference(unit: "can", quantity: 2)),
        (["chicken stock", "beef stock", "vegetable stock", "broth"],
         Inference(unit: "can", quantity: 2)),
        (["coconut milk"], Inference(unit: "can", quantity: 1)),
        (["tuna can"], Inference(unit: "can", quantity: 2)),

        // Beverages.
        (["water bottle", "sparkling water", "soda", "soft drink"],
         Inference(unit: "pack", quantity: 1)),
        (["juice"], Inference(unit: "bottle", quantity: 1)),
        (["beer"], Inference(unit: "pack", quantity: 1)),
        (["wine"], Inference(unit: "bottle", quantity: 1)),

        // Snacks.
        (["chip", "cracker", "pretzel", "popcorn"],
         Inference(unit: "bag", quantity: 1)),
        (["cookie"], Inference(unit: "pack", quantity: 1)),
        (["candy bar", "chocolate bar"], Inference(unit: "pack", quantity: 1)),

        // Frozen.
        (["frozen pizza"], Inference(unit: "box", quantity: 1)),
        (["ice cream"], Inference(unit: "pt", quantity: 1)),
        (["frozen vegetable", "frozen fruit", "frozen berry"],
         Inference(unit: "bag", quantity: 1)),

        // Produce — most "by count" but a few exceptions.
        (["banana"], Inference(unit: "count", quantity: 6)),
        (["apple", "orange", "lemon", "lime", "pear", "peach", "plum"],
         Inference(unit: "count", quantity: 4)),
        (["potato", "onion", "garlic"], Inference(unit: "lb", quantity: 2)),
        (["lettuce", "spinach", "kale", "arugula"], Inference(unit: "bunch", quantity: 1)),
        (["tomato"], Inference(unit: "count", quantity: 4)),
        (["bell pepper", "cucumber", "zucchini", "eggplant"],
         Inference(unit: "count", quantity: 2)),

        // Household.
        (["paper towel"], Inference(unit: "pack", quantity: 1)),
        (["toilet paper"], Inference(unit: "pack", quantity: 1)),
        (["dish soap", "laundry detergent", "shampoo", "conditioner"],
         Inference(unit: "bottle", quantity: 1)),
    ]
}
