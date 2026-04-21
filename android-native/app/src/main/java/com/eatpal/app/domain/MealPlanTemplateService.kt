package com.eatpal.app.domain

import com.eatpal.app.data.remote.SupabaseClientProvider
import com.eatpal.app.models.PlanEntry
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Kotlin port of iOS `MealPlanTemplateService`. Same `meal_plan_templates`
 * table shape — templates created on iOS show up here and vice versa.
 */
@Singleton
class MealPlanTemplateService @Inject constructor(
    private val supabase: SupabaseClientProvider,
    private val appState: AppStateStore,
) {

    @Serializable
    data class MealPlanTemplate(
        val id: String,
        @SerialName("user_id") val userId: String,
        val name: String,
        val meals: List<TemplateMeal>,
        @SerialName("created_at") val createdAt: String? = null,
    )

    @Serializable
    data class TemplateMeal(
        @SerialName("day_index") val dayIndex: Int,
        @SerialName("meal_slot") val mealSlot: String,
        @SerialName("food_id") val foodId: String,
        @SerialName("food_name") val foodName: String,
    )

    // MARK: - Week copy

    /**
     * Copies plan entries from [source] week into [target] week for [kidId].
     * Skips silently when source week has no entries for that kid. Returns
     * the number of entries copied.
     */
    suspend fun copyWeek(source: LocalDate, target: LocalDate, kidId: String): Int {
        val sourceDates = weekDates(source)
        val plan = appState.planEntries.value
        val sourceEntries = plan.filter { it.kidId == kidId && it.date in sourceDates.map { d -> d.format(ISO) } }
        if (sourceEntries.isEmpty()) return 0

        for (entry in sourceEntries) {
            val srcDate = LocalDate.parse(entry.date, ISO)
            val offset = ChronoUnit.DAYS.between(source, srcDate)
            val newDate = target.plusDays(offset)
            appState.addPlanEntry(
                PlanEntry(
                    id = UUID.randomUUID().toString(),
                    userId = entry.userId,
                    kidId = kidId,
                    date = newDate.format(ISO),
                    mealSlot = entry.mealSlot,
                    foodId = entry.foodId,
                    recipeId = entry.recipeId,
                )
            )
        }
        return sourceEntries.size
    }

    /** Deletes all plan entries for [kidId] in the week beginning [weekStart]. */
    suspend fun deleteWeek(weekStart: LocalDate, kidId: String): Int {
        val dates = weekDates(weekStart).map { it.format(ISO) }.toSet()
        val plan = appState.planEntries.value
        val entries = plan.filter { it.kidId == kidId && it.date in dates }
        for (entry in entries) {
            appState.deletePlanEntry(entry.id)
        }
        return entries.size
    }

    // MARK: - Templates

    /** Saves the current week under [name]. Requires a signed-in user. */
    suspend fun saveAsTemplate(name: String, weekStart: LocalDate, kidId: String): Int {
        val dates = weekDates(weekStart)
        val plan = appState.planEntries.value
        val foods = appState.foods.value

        val meals = dates.flatMapIndexed { dayIndex, date ->
            val iso = date.format(ISO)
            plan.filter { it.kidId == kidId && it.date == iso }.map { entry ->
                TemplateMeal(
                    dayIndex = dayIndex,
                    mealSlot = entry.mealSlot,
                    foodId = entry.foodId,
                    foodName = foods.firstOrNull { it.id == entry.foodId }?.name ?: "Unknown",
                )
            }
        }

        val user = supabase.client.auth.currentUserOrNull()
            ?: throw IllegalStateException("Not signed in — cannot save template.")

        val template = MealPlanTemplate(
            id = UUID.randomUUID().toString(),
            userId = user.id.lowercase(),
            name = name,
            meals = meals,
        )
        supabase.client.postgrest.from("meal_plan_templates").insert(template)
        return meals.size
    }

    suspend fun fetchTemplates(): List<MealPlanTemplate> =
        supabase.client.postgrest.from("meal_plan_templates")
            .select { order("created_at", Order.DESCENDING) }
            .decodeList()

    /** Applies [template] to [targetWeek] for [kidId]. Returns count of entries created. */
    suspend fun applyTemplate(
        template: MealPlanTemplate,
        targetWeek: LocalDate,
        kidId: String,
    ): Int {
        for (meal in template.meals) {
            val date = targetWeek.plusDays(meal.dayIndex.toLong())
            appState.addPlanEntry(
                PlanEntry(
                    id = UUID.randomUUID().toString(),
                    userId = "",
                    kidId = kidId,
                    date = date.format(ISO),
                    mealSlot = meal.mealSlot,
                    foodId = meal.foodId,
                )
            )
        }
        return template.meals.size
    }

    private fun weekDates(weekStart: LocalDate): List<LocalDate> =
        (0..6).map { weekStart.plusDays(it.toLong()) }

    companion object {
        private val ISO: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE
    }
}
