package com.eatpal.app.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class NutritionInfo(
    val calories: Double? = null,
    @SerialName("protein_g") val proteinG: Double? = null,
    @SerialName("carbs_g") val carbsG: Double? = null,
    @SerialName("fat_g") val fatG: Double? = null,
    @SerialName("fiber_g") val fiberG: Double? = null,
    @SerialName("calcium_mg") val calciumMg: Double? = null,
    @SerialName("iron_mg") val ironMg: Double? = null,
)

/** Mirrors iOS `Recipe`. */
@Serializable
data class Recipe(
    val id: String,
    @SerialName("user_id") val userId: String,
    @SerialName("household_id") val householdId: String? = null,
    val name: String,
    val description: String? = null,
    val instructions: String? = null,
    @SerialName("food_ids") val foodIds: List<String> = emptyList(),
    val category: String? = null,
    @SerialName("prep_time") val prepTime: String? = null,
    @SerialName("cook_time") val cookTime: String? = null,
    @SerialName("total_time_minutes") val totalTimeMinutes: Int? = null,
    val servings: String? = null,
    @SerialName("servings_min") val servingsMin: Int? = null,
    @SerialName("servings_max") val servingsMax: Int? = null,
    @SerialName("default_servings") val defaultServings: Int? = null,
    @SerialName("additional_ingredients") val additionalIngredients: String? = null,
    val tips: String? = null,
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("source_url") val sourceUrl: String? = null,
    @SerialName("source_type") val sourceType: String? = null,
    val tags: List<String>? = null,
    val rating: Double? = null,
    @SerialName("times_made") val timesMade: Int? = null,
    @SerialName("last_made_date") val lastMadeDate: String? = null,
    @SerialName("difficulty_level") val difficultyLevel: String? = null,
    @SerialName("kid_friendly_score") val kidFriendlyScore: Double? = null,
    @SerialName("nutrition_info") val nutritionInfo: NutritionInfo? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
) {
    fun applying(u: RecipeUpdate): Recipe = copy(
        name = u.name ?: name,
        description = u.description ?: description,
        instructions = u.instructions ?: instructions,
        foodIds = u.foodIds ?: foodIds,
        category = u.category ?: category,
        prepTime = u.prepTime ?: prepTime,
        cookTime = u.cookTime ?: cookTime,
        servings = u.servings ?: servings,
        tags = u.tags ?: tags,
        rating = u.rating ?: rating,
        difficultyLevel = u.difficultyLevel ?: difficultyLevel,
        imageUrl = u.imageUrl ?: imageUrl,
        additionalIngredients = u.additionalIngredients ?: additionalIngredients,
        tips = u.tips ?: tips,
    )
}

@Serializable
data class RecipeUpdate(
    val name: String? = null,
    val description: String? = null,
    val instructions: String? = null,
    @SerialName("food_ids") val foodIds: List<String>? = null,
    val category: String? = null,
    @SerialName("prep_time") val prepTime: String? = null,
    @SerialName("cook_time") val cookTime: String? = null,
    val servings: String? = null,
    val tags: List<String>? = null,
    val rating: Double? = null,
    @SerialName("difficulty_level") val difficultyLevel: String? = null,
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("additional_ingredients") val additionalIngredients: String? = null,
    val tips: String? = null,
)
