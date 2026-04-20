package com.eatpal.app.di

import android.content.Context
import androidx.room.Room
import com.eatpal.app.data.local.EatPalDatabase
import com.eatpal.app.data.local.dao.CacheDao
import com.eatpal.app.data.local.dao.PendingMutationDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DataModule {

    @Provides
    @Singleton
    fun provideJson(): Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        coerceInputValues = true
    }

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): EatPalDatabase =
        Room.databaseBuilder(context, EatPalDatabase::class.java, EatPalDatabase.NAME)
            .fallbackToDestructiveMigration()
            .build()

    @Provides
    fun provideCacheDao(db: EatPalDatabase): CacheDao = db.cacheDao()

    @Provides
    fun providePendingMutationDao(db: EatPalDatabase): PendingMutationDao = db.pendingMutationDao()
}
