package com.eatpal.app.data.local.entities

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.eatpal.app.models.Food

/** Room equivalent of iOS `CachedFood` (SwiftData). */
@Entity(tableName = "cached_foods")
data class CachedFood(
    @PrimaryKey val id: String,
    val name: String,
    val category: String,
    val isSafe: Boolean,
    val isTryBite: Boolean,
    val allergensCsv: String?,
    val barcode: String?,
    val lastSyncedAt: Long,
) {
    fun toFood(userId: String): Food = Food(
        id = id,
        userId = userId,
        name = name,
        category = category,
        isSafe = isSafe,
        isTryBite = isTryBite,
        allergens = allergensCsv?.takeIf { it.isNotBlank() }?.split("|"),
        barcode = barcode,
    )

    companion object {
        fun from(food: Food): CachedFood = CachedFood(
            id = food.id,
            name = food.name,
            category = food.category,
            isSafe = food.isSafe,
            isTryBite = food.isTryBite,
            allergensCsv = food.allergens?.joinToString("|"),
            barcode = food.barcode,
            lastSyncedAt = System.currentTimeMillis(),
        )
    }
}
