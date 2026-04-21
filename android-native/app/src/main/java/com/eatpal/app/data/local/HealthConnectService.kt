package com.eatpal.app.data.local

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Mass
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import javax.inject.Inject
import javax.inject.Singleton

private val Context.healthDataStore by preferencesDataStore(name = "eatpal_health")

/**
 * Kotlin port of iOS `HealthKitService`. Writes eaten meals as `NutritionRecord`
 * rows into Health Connect. Opt-in only — distinct from the Health Connect
 * grant itself, which the user controls via Android settings.
 */
@Singleton
class HealthConnectService @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val enabledKey = booleanPreferencesKey("enabled")

    /** User's opt-in preference. Defaults to false, same as iOS. */
    val isEnabled: Flow<Boolean> = context.healthDataStore.data.map { it[enabledKey] ?: false }

    suspend fun setEnabled(value: Boolean) {
        context.healthDataStore.edit { it[enabledKey] = value }
    }

    /** Whether the Health Connect app is available on this device. */
    val isAvailable: Boolean
        get() = HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE

    /** Permissions we request — write-only, matches iOS HealthKit writeTypes. */
    val permissions: Set<String> = setOf(
        HealthPermission.getWritePermission(NutritionRecord::class),
    )

    private val client: HealthConnectClient? by lazy {
        if (isAvailable) HealthConnectClient.getOrCreate(context) else null
    }

    suspend fun hasAllPermissions(): Boolean {
        val c = client ?: return false
        return c.permissionController.getGrantedPermissions().containsAll(permissions)
    }

    /**
     * Writes a single meal as a `NutritionRecord`. Mirrors iOS
     * `HealthKitService.writeMeal` — the four macros iOS writes are the only
     * ones we set here, everything else stays null so Health Connect doesn't
     * display bogus zero values.
     */
    suspend fun writeMeal(
        calories: Double?,
        proteinGrams: Double?,
        carbsGrams: Double?,
        fatGrams: Double?,
        mealDate: LocalDate,
        mealName: String,
    ) {
        val c = client ?: return
        // Pin the record at noon on the meal's date so sorting is stable —
        // iOS does the same with a Calendar.startOfDay + 12h offset.
        val start = LocalDateTime.of(mealDate, java.time.LocalTime.NOON)
            .atZone(ZoneId.systemDefault())
            .toInstant()
        val end = start.plusSeconds(60)

        val record = NutritionRecord(
            startTime = start,
            startZoneOffset = null,
            endTime = end,
            endZoneOffset = null,
            name = mealName,
            energy = calories?.let { Energy.kilocalories(it) },
            protein = proteinGrams?.let { Mass.grams(it) },
            totalCarbohydrate = carbsGrams?.let { Mass.grams(it) },
            totalFat = fatGrams?.let { Mass.grams(it) },
        )
        c.insertRecords(listOf(record))
    }
}
