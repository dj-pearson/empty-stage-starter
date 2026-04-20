package com.eatpal.app.data.local.entities

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.eatpal.app.models.Kid

/** Room equivalent of iOS `CachedKid`. */
@Entity(tableName = "cached_kids")
data class CachedKid(
    @PrimaryKey val id: String,
    val name: String,
    val age: Int?,
    val pickinessLevel: String?,
    val lastSyncedAt: Long,
) {
    companion object {
        fun from(kid: Kid): CachedKid = CachedKid(
            id = kid.id,
            name = kid.name,
            age = kid.age,
            pickinessLevel = kid.pickinessLevel,
            lastSyncedAt = System.currentTimeMillis(),
        )
    }
}
