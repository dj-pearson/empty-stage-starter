package com.eatpal.app.data.local.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.eatpal.app.data.local.entities.PendingMutation
import kotlinx.coroutines.flow.Flow

@Dao
interface PendingMutationDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun add(mutation: PendingMutation)

    @Query("SELECT * FROM pending_mutations ORDER BY createdAt ASC")
    suspend fun getAll(): List<PendingMutation>

    /** Observable count so UI (offline banner, settings diagnostics) can surface it. */
    @Query("SELECT COUNT(*) FROM pending_mutations")
    fun observeCount(): Flow<Int>

    @Delete
    suspend fun remove(mutation: PendingMutation)

    @Query("DELETE FROM pending_mutations")
    suspend fun clear()
}
