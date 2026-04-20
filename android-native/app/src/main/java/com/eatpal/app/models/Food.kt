package com.eatpal.app.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Mirrors iOS `Food` (ios/EatPal/EatPal/Models/Food.swift).
 * Field names use snake_case SerialNames so Supabase row-shape is identical
 * to iOS — this is the on-the-wire contract that lets realtime changes from
 * either platform decode on the other.
 */
@Serializable
data class Food(
    val id: String,
    @SerialName("user_id") val userId: String,
    @SerialName("household_id") val householdId: String? = null,
    val name: String,
    val category: String,
    @SerialName("is_safe") val isSafe: Boolean = true,
    @SerialName("is_try_bite") val isTryBite: Boolean = false,
    val allergens: List<String>? = null,
    val barcode: String? = null,
    val aisle: String? = null,
    val quantity: Double? = null,
    val unit: String? = null,
    @SerialName("servings_per_container") val servingsPerContainer: Double? = null,
    @SerialName("package_quantity") val packageQuantity: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
) {
    fun applying(updates: FoodUpdate): Food = copy(
        name = updates.name ?: name,
        category = updates.category ?: category,
        isSafe = updates.isSafe ?: isSafe,
        isTryBite = updates.isTryBite ?: isTryBite,
        allergens = updates.allergens ?: allergens,
        barcode = updates.barcode ?: barcode,
        aisle = updates.aisle ?: aisle,
        quantity = updates.quantity ?: quantity,
        unit = updates.unit ?: unit,
    )
}

@Serializable
data class FoodUpdate(
    val name: String? = null,
    val category: String? = null,
    @SerialName("is_safe") val isSafe: Boolean? = null,
    @SerialName("is_try_bite") val isTryBite: Boolean? = null,
    val allergens: List<String>? = null,
    val barcode: String? = null,
    val aisle: String? = null,
    val quantity: Double? = null,
    val unit: String? = null,
)

enum class FoodCategory(val key: String, val icon: String) {
    PROTEIN("protein", "🥩"),
    CARB("carb", "🍞"),
    DAIRY("dairy", "🥛"),
    FRUIT("fruit", "🍎"),
    VEGETABLE("vegetable", "🥦"),
    SNACK("snack", "🍪");

    val displayName: String get() = key.replaceFirstChar(Char::titlecase)
}
