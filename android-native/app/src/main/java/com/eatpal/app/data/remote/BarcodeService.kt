package com.eatpal.app.data.remote

import com.eatpal.app.models.FoodCategory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.double
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Kotlin port of iOS `BarcodeService`. Hits Open Food Facts v2 public API and
 * maps the (often messy) response onto our Food model shape. No-auth service
 * so we use HttpURLConnection directly — no supabase-kt dep.
 */
@Singleton
class BarcodeService @Inject constructor(
    private val json: Json,
) {
    data class ProductResult(
        val name: String,
        val category: String,
        val barcode: String,
        val allergens: List<String>,
        val nutrition: NutritionLookup?,
    )

    data class NutritionLookup(
        val calories: Double?,
        val fat: Double?,
        val carbs: Double?,
        val protein: Double?,
        val fiber: Double?,
        val sugar: Double?,
        val sodium: Double?,
    )

    suspend fun lookup(barcode: String): ProductResult? = withContext(Dispatchers.IO) {
        val encoded = URLEncoder.encode(barcode, StandardCharsets.UTF_8.name())
        if (encoded.isBlank()) return@withContext null
        val url = URL("$BASE_URL/$encoded.json")
        val conn = (url.openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 15_000
            requestMethod = "GET"
            setRequestProperty("User-Agent", "EatPal Android App - https://tryeatpal.com")
            setRequestProperty("Accept", "application/json")
        }
        try {
            if (conn.responseCode != 200) return@withContext null
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            val root = json.parseToJsonElement(body).jsonObject
            val status = root["status"]?.jsonPrimitive?.intOrNull
            if (status != 1) return@withContext null
            val product = root["product"]?.jsonObject ?: return@withContext null

            val name = product["product_name"]?.jsonPrimitive?.contentOrNull
                ?: product["product_name_en"]?.jsonPrimitive?.contentOrNull
                ?: "Unknown Product"

            val categoryTags = product["categories_tags"]
                ?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull }
                ?: emptyList()
            val category = mapCategory(categoryTags)

            val allergens = product["allergens_tags"]
                ?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull }
                ?.mapNotNull { tag ->
                    // Tags come like "en:milk" — strip the locale prefix.
                    tag.substringAfterLast(':').takeIf { it.isNotBlank() }?.replaceFirstChar(Char::titlecase)
                }
                ?: emptyList()

            val nutriments = product["nutriments"]?.jsonObject
            val nutrition = nutriments?.let { n ->
                NutritionLookup(
                    calories = n["energy-kcal_100g"]?.jsonPrimitive?.doubleOrNull,
                    fat = n["fat_100g"]?.jsonPrimitive?.doubleOrNull,
                    carbs = n["carbohydrates_100g"]?.jsonPrimitive?.doubleOrNull,
                    protein = n["proteins_100g"]?.jsonPrimitive?.doubleOrNull,
                    fiber = n["fiber_100g"]?.jsonPrimitive?.doubleOrNull,
                    sugar = n["sugars_100g"]?.jsonPrimitive?.doubleOrNull,
                    sodium = n["sodium_100g"]?.jsonPrimitive?.doubleOrNull,
                )
            }

            ProductResult(
                name = name,
                category = category,
                barcode = barcode,
                allergens = allergens,
                nutrition = nutrition,
            )
        } catch (_: Exception) {
            null
        } finally {
            conn.disconnect()
        }
    }

    private fun mapCategory(tags: List<String>): String {
        val joined = tags.joinToString(" ").lowercase()
        return when {
            "meat" in joined || "fish" in joined || "poultry" in joined ||
                "egg" in joined || "seafood" in joined -> FoodCategory.PROTEIN.key
            "dairy" in joined || "milk" in joined || "cheese" in joined ||
                "yogurt" in joined -> FoodCategory.DAIRY.key
            "fruit" in joined || "juice" in joined -> FoodCategory.FRUIT.key
            "vegetable" in joined || "salad" in joined ||
                "legume" in joined -> FoodCategory.VEGETABLE.key
            "bread" in joined || "cereal" in joined || "pasta" in joined ||
                "rice" in joined || "grain" in joined -> FoodCategory.CARB.key
            else -> FoodCategory.SNACK.key
        }
    }

    companion object {
        private const val BASE_URL = "https://world.openfoodfacts.org/api/v2/product"
    }
}
