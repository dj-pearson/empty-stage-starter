package com.eatpal.app.data.local.entities

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.eatpal.app.models.GroceryItem

/** Room equivalent of iOS `CachedGroceryItem`. */
@Entity(tableName = "cached_grocery_items")
data class CachedGroceryItem(
    @PrimaryKey val id: String,
    val name: String,
    val category: String,
    val quantity: Double,
    val unit: String,
    val checked: Boolean,
    val lastSyncedAt: Long,
) {
    companion object {
        fun from(item: GroceryItem): CachedGroceryItem = CachedGroceryItem(
            id = item.id,
            name = item.name,
            category = item.category,
            quantity = item.quantity,
            unit = item.unit,
            checked = item.checked,
            lastSyncedAt = System.currentTimeMillis(),
        )
    }
}
