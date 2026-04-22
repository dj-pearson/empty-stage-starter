package com.eatpal.app.data.remote

import com.eatpal.app.models.Food
import com.eatpal.app.models.Kid
import com.eatpal.app.models.MealSlot
import com.eatpal.app.models.PlanEntry
import io.github.jan.supabase.functions.functions
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Kotlin port of iOS `AIMealService`. Invokes the `generate-meal-suggestions`
 * edge function with the exact same payload shape (snake_case keys match iOS
 * `CodingKeys`) so the server doesn't need a separate branch for Android.
 *
 * On edge-function failure we fall back to a local shuffle of safe foods so
 * the UI stays useful — matches the iOS `generateLocalFallback` behaviour.
 */
@Singleton
class AIMealService @Inject constructor(
    private val supabase: SupabaseClientProvider,
    private val json: Json,
) {

    @Serializable
    data class MealSuggestion(
        val id: String,
        @SerialName("meal_slot") val mealSlot: String,
        @SerialName("food_name") val foodName: String,
        @SerialName("food_id") val foodId: String? = null,
        val reasoning: String,
        @SerialName("nutrition_note") val nutritionNote: String? = null,
    )

    @Serializable
    private data class FoodSummary(
        val id: String,
        val name: String,
        val category: String,
    )

    @Serializable
    private data class MealSummary(
        val date: String,
        val slot: String,
        @SerialName("food_name") val foodName: String,
        val result: String? = null,
    )

    @Serializable
    private data class KidPreferences(
        val name: String,
        val age: Int? = null,
        @SerialName("pickiness_level") val pickinessLevel: String? = null,
        val allergens: List<String>? = null,
        @SerialName("texture_preferences") val texturePreferences: List<String>? = null,
        @SerialName("flavor_preferences") val flavorPreferences: List<String>? = null,
    )

    @Serializable
    private data class SuggestionRequest(
        @SerialName("kid_id") val kidId: String,
        val date: String,
        @SerialName("safe_foods") val safeFoods: List<FoodSummary>,
        @SerialName("try_bite_foods") val tryBiteFoods: List<FoodSummary>,
        @SerialName("recent_meals") val recentMeals: List<MealSummary>,
        val preferences: KidPreferences,
    )

    /**
     * Suggests one meal per slot for [date] against [kid]'s pantry + recent
     * history. Returns the suggestion list plus an optional error string so
     * the UI can distinguish "we fell back to local" from "the network was
     * fine, here are fresh AI picks".
     */
    data class Result(val suggestions: List<MealSuggestion>, val error: String? = null)

    suspend fun generate(
        kid: Kid,
        date: String,
        foods: List<Food>,
        recentEntries: List<PlanEntry>,
        allFoods: List<Food>,
    ): Result {
        val safe = foods.filter { it.isSafe }
            .map { FoodSummary(it.id, it.name, it.category) }
        val tryBite = foods.filter { it.isTryBite }
            .map { FoodSummary(it.id, it.name, it.category) }
        val recent = recentEntries.take(21).map { entry ->
            val foodName = allFoods.firstOrNull { it.id == entry.foodId }?.name ?: "Unknown"
            MealSummary(
                date = entry.date,
                slot = entry.mealSlot,
                foodName = foodName,
                result = entry.result,
            )
        }

        val request = SuggestionRequest(
            kidId = kid.id,
            date = date,
            safeFoods = safe,
            tryBiteFoods = tryBite,
            recentMeals = recent,
            preferences = KidPreferences(
                name = kid.name,
                age = kid.age,
                pickinessLevel = kid.pickinessLevel,
                allergens = kid.allergens,
                texturePreferences = kid.texturePreferences,
                flavorPreferences = kid.flavorPreferences,
            ),
        )

        return runCatching {
            val response = supabase.client.functions.invoke("generate-meal-suggestions") {
                contentType(ContentType.Application.Json)
                setBody(request)
            }
            val text = response.bodyAsText()
            val list = json.decodeFromString(ListSerializer(MealSuggestion.serializer()), text)
            Result(suggestions = list)
        }.getOrElse { t ->
            Result(
                suggestions = localFallback(foods.filter { it.isSafe }),
                error = t.message ?: "Couldn't reach the AI service.",
            )
        }
    }

    private fun localFallback(safe: List<Food>): List<MealSuggestion> {
        val shuffled = safe.shuffled()
        return MealSlot.entries.mapIndexedNotNull { index, slot ->
            val food = shuffled.getOrNull(index) ?: return@mapIndexedNotNull null
            MealSuggestion(
                id = UUID.randomUUID().toString(),
                mealSlot = slot.key,
                foodName = food.name,
                foodId = food.id,
                reasoning = "Based on ${food.name} being a safe food in your pantry.",
                nutritionNote = null,
            )
        }
    }
}
