package com.eatpal.app.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.eatpal.app.data.local.entities.CachedFood
import com.eatpal.app.data.local.entities.CachedGroceryItem
import com.eatpal.app.data.local.entities.CachedKid

@Dao
interface CacheDao {
    // Foods
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertFoods(foods: List<CachedFood>)

    @Query("SELECT * FROM cached_foods ORDER BY name")
    suspend fun getFoods(): List<CachedFood>

    @Query("DELETE FROM cached_foods")
    suspend fun clearFoods()

    // Kids
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertKids(kids: List<CachedKid>)

    @Query("SELECT * FROM cached_kids ORDER BY name")
    suspend fun getKids(): List<CachedKid>

    @Query("DELETE FROM cached_kids")
    suspend fun clearKids()

    // Grocery items
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertGroceryItems(items: List<CachedGroceryItem>)

    @Query("SELECT * FROM cached_grocery_items")
    suspend fun getGroceryItems(): List<CachedGroceryItem>

    @Query("DELETE FROM cached_grocery_items")
    suspend fun clearGroceryItems()
}
