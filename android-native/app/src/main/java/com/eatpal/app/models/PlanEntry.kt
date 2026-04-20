package com.eatpal.app.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Mirrors iOS `PlanEntry`. */
@Serializable
data class PlanEntry(
    val id: String,
    @SerialName("user_id") val userId: String,
    @SerialName("household_id") val householdId: String? = null,
    @SerialName("kid_id") val kidId: String,
    val date: String,
    @SerialName("meal_slot") val mealSlot: String,
    @SerialName("food_id") val foodId: String,
    @SerialName("recipe_id") val recipeId: String? = null,
    val result: String? = null,
    val notes: String? = null,
    @SerialName("is_primary_dish") val isPrimaryDish: Boolean? = null,
    @SerialName("food_attempt_id") val foodAttemptId: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
) {
    fun applying(u: PlanEntryUpdate): PlanEntry = copy(
        foodId = u.foodId ?: foodId,
        mealSlot = u.mealSlot ?: mealSlot,
        result = u.result ?: result,
        notes = u.notes ?: notes,
    )
}

@Serializable
data class PlanEntryUpdate(
    @SerialName("food_id") val foodId: String? = null,
    @SerialName("meal_slot") val mealSlot: String? = null,
    val result: String? = null,
    val notes: String? = null,
)

enum class MealSlot(val key: String, val displayName: String) {
    BREAKFAST("breakfast", "Breakfast"),
    LUNCH("lunch", "Lunch"),
    DINNER("dinner", "Dinner"),
    SNACK1("snack1", "Snack 1"),
    SNACK2("snack2", "Snack 2"),
    TRY_BITE("try_bite", "Try Bite");

    companion object {
        fun fromKey(key: String?): MealSlot? = entries.firstOrNull { it.key == key }
    }
}

enum class MealResult(val key: String) {
    ATE("ate"), TASTED("tasted"), REFUSED("refused");

    val displayName: String get() = key.replaceFirstChar(Char::titlecase)
}
