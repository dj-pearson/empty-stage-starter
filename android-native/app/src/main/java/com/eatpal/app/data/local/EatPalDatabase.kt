package com.eatpal.app.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import com.eatpal.app.data.local.dao.CacheDao
import com.eatpal.app.data.local.dao.PendingMutationDao
import com.eatpal.app.data.local.entities.CachedFood
import com.eatpal.app.data.local.entities.CachedGroceryItem
import com.eatpal.app.data.local.entities.CachedKid
import com.eatpal.app.data.local.entities.PendingMutation

@Database(
    entities = [
        CachedFood::class,
        CachedKid::class,
        CachedGroceryItem::class,
        PendingMutation::class,
    ],
    version = 1,
    exportSchema = false,
)
abstract class EatPalDatabase : RoomDatabase() {
    abstract fun cacheDao(): CacheDao
    abstract fun pendingMutationDao(): PendingMutationDao

    companion object {
        const val NAME = "eatpal_offline.db"
    }
}
