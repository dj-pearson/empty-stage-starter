package com.eatpal.app.domain

import java.util.UUID

/**
 * Kotlin port of iOS `GroceryTextParser`. Same dictionaries, same split
 * strategy, same confidence heuristics — designed for voice-to-grocery and
 * pasted OCR text. Shared output shape so iOS / Android review UIs stay
 * identical.
 */
object GroceryTextParser {

    data class ParsedItem(
        val id: String = UUID.randomUUID().toString(),
        val name: String,
        val quantity: Double,
        val unit: String,
        val category: String,
        val confidence: Double,
    )

    private val categoryKeywords: List<Pair<String, List<String>>> = listOf(
        "protein" to listOf(
            "chicken", "beef", "pork", "turkey", "salmon", "tuna", "shrimp", "fish",
            "steak", "ground beef", "bacon", "sausage", "ham", "lamb", "tofu",
            "eggs", "egg", "meatball", "hot dog", "deli", "jerky", "bison",
            "tilapia", "cod", "crab", "lobster", "scallop", "clam", "mussel",
        ),
        "dairy" to listOf(
            "milk", "cheese", "yogurt", "butter", "cream", "sour cream", "cottage cheese",
            "mozzarella", "cheddar", "parmesan", "ricotta", "cream cheese",
            "half and half", "ice cream", "gelato", "kefir", "ghee",
        ),
        "fruit" to listOf(
            "apple", "banana", "orange", "grape", "strawberr", "blueberr", "raspberr",
            "blackberr", "mango", "pineapple", "watermelon", "cantaloupe", "honeydew",
            "peach", "pear", "plum", "cherry", "kiwi", "lemon", "lime", "avocado",
            "coconut", "pomegranate", "fig", "papaya", "cranberr", "melon",
        ),
        "vegetable" to listOf(
            "broccoli", "carrot", "spinach", "kale", "lettuce", "tomato", "cucumber",
            "pepper", "onion", "garlic", "potato", "corn", "pea",
            "green bean", "celery", "mushroom", "zucchini", "squash", "cauliflower",
            "asparagus", "beet", "cabbage", "eggplant", "radish", "leek", "arugula",
            "cilantro", "parsley", "basil", "ginger", "scallion", "shallot", "salad",
        ),
        "carb" to listOf(
            "bread", "rice", "pasta", "noodle", "tortilla", "bagel", "roll", "bun",
            "cereal", "oat", "oatmeal", "granola", "flour", "cracker", "chip",
            "pita", "wrap", "couscous", "quinoa", "barley", "waffle",
            "english muffin", "croissant", "biscuit", "breadcrumb", "pretzel", "popcorn",
        ),
        "snack" to listOf(
            "cookie", "candy", "chocolate", "gummy", "granola bar", "pudding",
            "trail mix", "nut", "almond", "peanut butter", "jelly", "jam", "honey",
            "syrup", "ketchup", "mustard", "mayo", "ranch", "salsa", "hummus",
            "dressing", "sauce", "juice", "soda", "coffee", "tea", "kombucha",
        ),
    )

    private val unitMap: Map<String, String> = mapOf(
        "lb" to "lbs", "lbs" to "lbs", "pound" to "lbs", "pounds" to "lbs",
        "oz" to "oz", "ounce" to "oz", "ounces" to "oz",
        "g" to "g", "gram" to "g", "grams" to "g",
        "kg" to "kg", "kilo" to "kg", "kilos" to "kg", "kilogram" to "kg", "kilograms" to "kg",
        "gal" to "gal", "gallon" to "gal", "gallons" to "gal",
        "qt" to "qt", "quart" to "qt", "quarts" to "qt",
        "pt" to "pt", "pint" to "pt", "pints" to "pt",
        "cup" to "cups", "cups" to "cups",
        "tbsp" to "tbsp", "tablespoon" to "tbsp", "tablespoons" to "tbsp",
        "tsp" to "tsp", "teaspoon" to "tsp", "teaspoons" to "tsp",
        "l" to "L", "liter" to "L", "liters" to "L",
        "ml" to "ml", "milliliter" to "ml", "milliliters" to "ml",
        "bunch" to "bunch", "bunches" to "bunch",
        "bag" to "bags", "bags" to "bags",
        "box" to "boxes", "boxes" to "boxes",
        "can" to "cans", "cans" to "cans",
        "jar" to "jars", "jars" to "jars",
        "bottle" to "bottles", "bottles" to "bottles",
        "pack" to "packs", "packs" to "packs", "package" to "packs", "packages" to "packs",
        "dozen" to "dozen",
        "loaf" to "loaves", "loaves" to "loaves",
        "stick" to "sticks", "sticks" to "sticks",
    )

    private val numberWords: Map<String, Double> = mapOf(
        "a" to 1.0, "an" to 1.0, "one" to 1.0, "two" to 2.0, "three" to 3.0, "four" to 4.0,
        "five" to 5.0, "six" to 6.0, "seven" to 7.0, "eight" to 8.0, "nine" to 9.0, "ten" to 10.0,
        "eleven" to 11.0, "twelve" to 12.0, "half" to 0.5, "quarter" to 0.25,
    )

    private val sentinelTokens = setOf("of", "and", "also", "plus", "some")

    fun parse(text: String): List<ParsedItem> {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return emptyList()

        var phrases = trimmed.split('\n', ',', ';').map { it.trim() }.filter { it.isNotBlank() }
        if (phrases.size == 1) {
            val connectorSplit = trimmed
                .replace(" and also ", ",")
                .replace(" and then ", ",")
                .replace(" and ", ",")
                .replace(" also ", ",")
                .replace(" plus ", ",")
                .split(',').map { it.trim() }.filter { it.isNotBlank() }
            if (connectorSplit.size > 1) phrases = connectorSplit
        }

        val seen = mutableSetOf<String>()
        val items = mutableListOf<ParsedItem>()
        for (raw in phrases) {
            val parsed = parsePhrase(raw) ?: continue
            val key = parsed.name.lowercase()
            if (key in seen) continue
            seen += key
            items += parsed
        }
        return items
    }

    private fun parsePhrase(phrase: String): ParsedItem? {
        var cleaned = stripListMarkers(phrase.trim())
        if (cleaned.length < 2) return null

        val tokens = cleaned.lowercase().split(Regex("\\s+")).filter { it.isNotBlank() }.toMutableList()
        if (tokens.isEmpty()) return null

        var quantity = 1.0
        var quantityMatched = false
        var unit = ""
        var confidence = 0.6

        parseNumber(tokens.first())?.let {
            quantity = it
            quantityMatched = true
            tokens.removeAt(0)
            confidence = 0.8
        }

        while (tokens.isNotEmpty() && tokens.first() in sentinelTokens) tokens.removeAt(0)

        tokens.firstOrNull()?.let { first ->
            unitMap[first]?.let {
                unit = it
                tokens.removeAt(0)
                if (!quantityMatched) quantity = 1.0
                confidence = maxOf(confidence, 0.85)
            }
        }

        while (tokens.isNotEmpty() && tokens.first() in sentinelTokens) tokens.removeAt(0)
        if (tokens.isEmpty()) return null

        val name = tokens.joinToString(" ").trim()
        if (name.length < 2) return null

        if (!quantityMatched && unit.isEmpty() && name.split(" ").size == 1) confidence = 0.7

        return ParsedItem(
            name = titleCase(name),
            quantity = quantity,
            unit = unit,
            category = inferCategory(name),
            confidence = confidence,
        )
    }

    private fun stripListMarkers(input: String): String {
        var s = input
        while (s.isNotEmpty() && s.first() in "-•*▪▸►◆☐☑✓✔") s = s.substring(1)
        s = s.replace(Regex("^\\s*\\d+[.)]\\s*"), "")
        s = s.replace(Regex("^\\s*\\[[ xX]?]\\s*"), "")
        return s.trim()
    }

    private fun parseNumber(token: String): Double? {
        token.toDoubleOrNull()?.let { if (it > 0) return it }
        numberWords[token]?.let { return it }
        val parts = token.split("/")
        if (parts.size == 2) {
            val num = parts[0].toDoubleOrNull()
            val den = parts[1].toDoubleOrNull()
            if (num != null && den != null && den > 0) return num / den
        }
        return null
    }

    private fun inferCategory(name: String): String {
        val lower = name.lowercase()
        for ((category, keywords) in categoryKeywords) {
            if (keywords.any { lower.contains(it) }) return category
        }
        return "snack"
    }

    private fun titleCase(s: String): String =
        s.split(" ").joinToString(" ") { w -> w.replaceFirstChar { it.titlecase() } }
}
