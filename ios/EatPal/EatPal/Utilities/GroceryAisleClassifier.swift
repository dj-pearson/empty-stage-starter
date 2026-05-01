import Foundation

/// Keyword-based name → `GroceryAisle` lookup, used when an ingredient
/// has no linked pantry food (so we can't read the food's aisle hint).
///
/// US-263 introduced 32 store-section aisles. Without this classifier,
/// every unlinked ingredient lands in `.other`, and the grocery list
/// renders one giant "Other" bucket. The map below covers the common
/// cooking ingredients well enough to put 80%+ of recipe imports in a
/// real aisle without per-item user work.
///
/// The lookup is intentionally name-substring-based, not exact-match —
/// "vegetable oil" and "olive oil" should both classify as `.condiments`
/// via the "oil" keyword. Higher-priority keywords run first so that
/// e.g. "tortilla chips" hits `.snacks` before "tortilla" → `.bread`.
extension GroceryAisle {

    /// Best-effort aisle for a free-text ingredient name. Falls back to
    /// `.other` only when no keyword matches.
    static func classify(_ rawName: String) -> GroceryAisle {
        let needle = rawName
            .lowercased()
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !needle.isEmpty else { return .other }

        // Iterate in priority order — first match wins. Earlier entries
        // are more specific (compound words, prefixed terms) so they
        // beat shorter substrings.
        for (aisle, keywords) in priorityOrderedKeywords {
            for kw in keywords where needle.contains(kw) {
                return aisle
            }
        }
        return .other
    }

    /// Ordered list (priority high → low). Each tuple is one aisle and
    /// the keyword fragments that should classify into it. Keep tokens
    /// lowercased and substring-friendly.
    private static let priorityOrderedKeywords: [(GroceryAisle, [String])] = [
        // High-priority compound terms first so they outrank looser hits.
        (.snacks, [
            "tortilla chip", "potato chip", "pita chip", "veggie chip"
        ]),
        (.frozenVeg, [
            "frozen vegetable", "frozen pea", "frozen corn", "frozen broccoli",
            "frozen spinach", "frozen mixed veg"
        ]),
        (.frozenMeals, [
            "frozen pizza", "frozen meal", "frozen dinner", "frozen burrito",
            "frozen lasagna"
        ]),
        (.frozenTreats, [
            "ice cream", "frozen yogurt", "popsicle", "sherbet", "sorbet",
            "frozen dessert"
        ]),
        (.bakery, [
            "croissant", "muffin", "scone", "donut", "doughnut", "danish",
            "cinnamon roll", "cake", "cupcake"
        ]),
        (.bread, [
            "bread", "baguette", "ciabatta", "bun", "roll", "tortilla",
            "pita", "naan", "bagel", "english muffin", "sourdough", "focaccia"
        ]),
        (.eggs, [
            "egg yolk", "egg white", "egg "
        ]),
        (.seafood, [
            "salmon", "tuna", "shrimp", "scallop", "crab", "lobster",
            "cod", "halibut", "tilapia", "trout", "bass", "mackerel",
            "sardine", "anchov", "mussel", "clam", "oyster", "calamari",
            "squid", "octopus", "haddock", "fish fillet", "fish "
        ]),
        (.meatDeli, [
            "chicken", "beef", "pork", "turkey", "lamb", "veal",
            "bacon", "prosciutto", "salami", "pepperoni", "pancetta",
            "ham", "sausage", "hot dog", "bratwurst", "chorizo",
            "ground beef", "ground turkey", "ground pork",
            "steak", "ribs", "brisket", "tenderloin", "roast",
            "deli meat", "lunch meat"
        ]),
        (.dairy, [
            "milk", "cream", "half-and-half", "half and half",
            "butter", "yogurt", "yoghurt", "sour cream",
            "cheese", "mozzarella", "parmesan", "cheddar", "feta",
            "ricotta", "mascarpone", "gouda", "brie", "swiss",
            "gruyere", "gruyère", "cottage", "buttermilk",
            "ghee"
        ]),
        (.pasta, [
            "spaghetti", "penne", "lasagna", "lasagne", "noodle",
            "macaroni", "fettuccine", "linguine", "ravioli", "ziti",
            "rigatoni", "orzo", "gnocchi", "ramen", "udon", "soba",
            "rotini", "fusilli", "angel hair", "vermicelli",
            "pasta "
        ]),
        (.riceGrains, [
            "rice", "quinoa", "oats", "oatmeal", "barley", "couscous",
            "bulgur", "polenta", "cornmeal", "farro", "millet", "amaranth"
        ]),
        (.canned, [
            "canned", "tomato sauce", "tomato paste", "diced tomato",
            "crushed tomato", "tomato puree", "marinara", "broth", "stock",
            "coconut milk", "evaporated milk", "condensed milk",
            "refried bean", "black bean", "kidney bean", "chickpea",
            "garbanzo", "cannellini", "pinto bean", "white bean"
        ]),
        (.baking, [
            "flour", "sugar", "brown sugar", "powdered sugar", "icing sugar",
            "baking soda", "baking powder", "yeast", "vanilla", "vanilla extract",
            "cocoa", "chocolate chip", "cornstarch", "corn starch",
            "almond extract", "food coloring", "sprinkle", "molasses",
            "shortening", "marshmallow", "graham cracker"
        ]),
        (.condiments, [
            "olive oil", "vegetable oil", "canola oil", "coconut oil",
            "sesame oil", "avocado oil", "peanut oil", "oil",
            "vinegar", "balsamic", "soy sauce", "tamari",
            "ketchup", "mustard", "mayonnaise", "mayo",
            "hot sauce", "sriracha", "tabasco",
            "honey", "maple syrup", "syrup",
            "salt", "pepper", "cinnamon", "nutmeg", "paprika",
            "cumin", "chili powder", "garlic powder", "onion powder",
            "italian seasoning", "bay leaf", "thyme", "rosemary",
            "oregano", "sage", "dried basil", "dried parsley",
            "dressing", "jam", "jelly", "preserves",
            "peanut butter", "almond butter", "tahini", "nutella",
            "worcestershire", "fish sauce", "hoisin", "oyster sauce",
            "rice vinegar", "miso", "gochujang"
        ]),
        (.breakfast, [
            "cereal", "granola", "pancake mix", "waffle mix",
            "instant oatmeal"
        ]),
        (.crackers, [
            "cracker", "saltine", "ritz", "wheat thin"
        ]),
        (.snacks, [
            "chip", "pretzel", "popcorn", "trail mix", "nut bar", "granola bar",
            "jerky"
        ]),
        (.candy, [
            "candy", "gummy", "gummies", "lollipop", "chocolate bar",
            "m&m", "skittles"
        ]),
        (.beverages, [
            "water", "sparkling water", "juice", "coffee", "tea",
            "soda", "lemonade", "kombucha", "energy drink"
        ]),
        (.alcohol, [
            "wine", "beer", "vodka", "whiskey", "whisky", "rum", "tequila",
            "gin", "bourbon", "champagne", "prosecco", "cider"
        ]),
        (.ethnicMexican, [
            "salsa", "enchilada sauce", "taco seasoning", "queso",
            "chipotle", "adobo", "masa"
        ]),
        (.ethnicAsian, [
            "kimchi", "wasabi", "nori", "panko", "mirin", "sake",
            "dashi", "sambal"
        ]),
        // Produce — keep last among foods because fruit/veg names are
        // short and could otherwise gobble compound matches above.
        (.produce, [
            "bell pepper", "red pepper", "green pepper", "yellow pepper",
            "jalapeño", "jalapeno", "serrano", "poblano", "habanero",
            "onion", "garlic", "ginger", "carrot", "celery", "lettuce",
            "spinach", "kale", "cucumber", "zucchini", "broccoli",
            "cauliflower", "mushroom", "potato", "sweet potato", "yam",
            "lemon", "lime", "orange", "apple", "banana", "avocado",
            "cilantro", "parsley", "basil", "mint", "thyme", "rosemary",
            "scallion", "green onion", "leek", "shallot",
            "tomato", "chili", "chile",
            "cabbage", "asparagus", "eggplant", "squash", "beet",
            "radish", "fennel", "artichoke", "brussels sprout",
            "pea", "corn", "berry", "berries", "strawberr", "blueberr",
            "raspberr", "blackberr", "grape", "peach", "pear", "plum",
            "cherry", "cherries", "kiwi", "mango", "pineapple",
            "watermelon", "melon", "papaya", "fig", "date",
            "pomegranate", "rhubarb", "okra", "turnip", "parsnip"
        ]),
        // Non-food household items.
        (.paperGoods, [
            "paper towel", "toilet paper", "tissue", "napkin", "paper plate"
        ]),
        (.cleaning, [
            "detergent", "bleach", "dish soap", "all-purpose cleaner",
            "sponge", "scrub", "trash bag", "garbage bag"
        ]),
        (.personalCare, [
            "shampoo", "conditioner", "soap", "toothpaste", "deodorant",
            "lotion"
        ]),
        (.baby, [
            "diaper", "baby wipe", "baby formula", "baby food"
        ]),
        (.pet, [
            "cat food", "dog food", "pet food", "kitty litter", "litter box"
        ])
    ]
}
