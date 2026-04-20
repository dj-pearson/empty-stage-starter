package com.eatpal.app.data.local.entities

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.util.UUID

/**
 * Mirrors iOS `PendingMutation`: an offline write awaiting replay against Supabase.
 * `operation` is one of "insert" / "update" / "delete".
 * `payload` is the JSON of the domain object or its update struct.
 */
@Entity(tableName = "pending_mutations")
data class PendingMutation(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val tableName: String,
    val operation: String,
    val entityId: String,
    val payload: String?,
    val createdAt: Long = System.currentTimeMillis(),
) {
    companion object {
        const val OP_INSERT = "insert"
        const val OP_UPDATE = "update"
        const val OP_DELETE = "delete"

        const val TBL_FOODS = "foods"
        const val TBL_KIDS = "kids"
        const val TBL_RECIPES = "recipes"
        const val TBL_PLAN_ENTRIES = "plan_entries"
        const val TBL_GROCERY_ITEMS = "grocery_items"
    }
}
