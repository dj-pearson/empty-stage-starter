package com.eatpal.app.data.remote

import com.eatpal.app.models.Food
import com.eatpal.app.models.FoodUpdate
import com.eatpal.app.models.GroceryItem
import com.eatpal.app.models.GroceryItemUpdate
import com.eatpal.app.models.GroceryList
import com.eatpal.app.models.Kid
import com.eatpal.app.models.KidUpdate
import com.eatpal.app.models.PlanEntry
import com.eatpal.app.models.PlanEntryUpdate
import com.eatpal.app.models.Recipe
import com.eatpal.app.models.RecipeUpdate
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Kotlin port of iOS `DataService.swift`. Each method maps 1:1 to the iOS
 * call (fetch*, insert*, update*, delete*) and sends the same columns in the
 * same shape. Uses postgrest-kt, which the Supabase team ships as the Kotlin
 * sibling of supabase-swift's `.from("table").select()` builder.
 *
 * Mirrors two iOS guardrails:
 *   1. `ensureUserId` — never send an empty user_id; Postgres would reject
 *      it as "invalid input syntax for type uuid".
 *   2. plan_entries `kid_id` / `food_id` must be valid UUIDs before insert.
 */
@Singleton
class DataService @Inject constructor(
    private val supabase: SupabaseClientProvider,
) {
    private val client get() = supabase.client
    private val db get() = client.postgrest

    // MARK: - Auth helpers (same guardrail as iOS)

    /** Returns the signed-in user's UUID as a lowercase string. Throws when no session. */
    private fun currentUserId(): String {
        val user = client.auth.currentUserOrNull()
            ?: throw IllegalStateException("No authenticated session — sign in before writing.")
        return user.id.lowercase()
    }

    /** Falls back to the authenticated user when `existing` is blank or not a UUID. */
    private fun ensureUserId(existing: String): String {
        val trimmed = existing.trim()
        return if (UUID_REGEX.matches(trimmed)) trimmed else currentUserId()
    }

    // MARK: - Foods

    suspend fun fetchFoods(): List<Food> =
        db.from("foods").select { order("name", Order.ASCENDING) }.decodeList()

    suspend fun insertFood(food: Food) {
        val payload = food.copy(userId = ensureUserId(food.userId))
        db.from("foods").insert(payload)
    }

    suspend fun updateFood(id: String, updates: FoodUpdate) {
        db.from("foods").update(updates) {
            filter { eq("id", id) }
        }
    }

    suspend fun deleteFood(id: String) {
        db.from("foods").delete { filter { eq("id", id) } }
    }

    // MARK: - Kids

    suspend fun fetchKids(): List<Kid> =
        db.from("kids").select { order("name", Order.ASCENDING) }.decodeList()

    suspend fun insertKid(kid: Kid) {
        val payload = kid.copy(userId = ensureUserId(kid.userId))
        db.from("kids").insert(payload)
    }

    suspend fun updateKid(id: String, updates: KidUpdate) {
        db.from("kids").update(updates) { filter { eq("id", id) } }
    }

    suspend fun deleteKid(id: String) {
        db.from("kids").delete { filter { eq("id", id) } }
    }

    // MARK: - Recipes

    suspend fun fetchRecipes(): List<Recipe> =
        db.from("recipes").select { order("name", Order.ASCENDING) }.decodeList()

    suspend fun insertRecipe(recipe: Recipe) {
        val payload = recipe.copy(userId = ensureUserId(recipe.userId))
        db.from("recipes").insert(payload)
    }

    suspend fun updateRecipe(id: String, updates: RecipeUpdate) {
        db.from("recipes").update(updates) { filter { eq("id", id) } }
    }

    suspend fun deleteRecipe(id: String) {
        db.from("recipes").delete { filter { eq("id", id) } }
    }

    // MARK: - Plan entries

    suspend fun fetchPlanEntries(): List<PlanEntry> {
        // iOS window: 30 days back, 90 days forward.
        val today = LocalDate.now()
        val past = today.minusDays(30).format(DateTimeFormatter.ISO_LOCAL_DATE)
        val future = today.plusDays(90).format(DateTimeFormatter.ISO_LOCAL_DATE)
        return db.from("plan_entries").select {
            filter {
                gte("date", past)
                lte("date", future)
            }
            order("date", Order.ASCENDING)
        }.decodeList()
    }

    suspend fun insertPlanEntry(entry: PlanEntry) {
        val payload = entry.copy(userId = ensureUserId(entry.userId))

        // Same guardrail as iOS — plan_entries.kid_id and food_id are NOT NULL
        // UUIDs; surface a friendly error instead of letting Postgres reject it.
        require(UUID_REGEX.matches(payload.kidId)) { "Select a child profile first." }
        require(UUID_REGEX.matches(payload.foodId)) { "Pick a food before adding it to the plan." }

        db.from("plan_entries").insert(payload)
    }

    suspend fun updatePlanEntry(id: String, updates: PlanEntryUpdate) {
        db.from("plan_entries").update(updates) { filter { eq("id", id) } }
    }

    suspend fun deletePlanEntry(id: String) {
        db.from("plan_entries").delete { filter { eq("id", id) } }
    }

    // MARK: - Grocery items

    suspend fun fetchGroceryItems(): List<GroceryItem> =
        db.from("grocery_items").select {
            order("created_at", Order.DESCENDING)
        }.decodeList()

    suspend fun insertGroceryItem(item: GroceryItem) {
        val payload = item.copy(userId = ensureUserId(item.userId))
        db.from("grocery_items").insert(payload)
    }

    suspend fun updateGroceryItem(id: String, updates: GroceryItemUpdate) {
        db.from("grocery_items").update(updates) { filter { eq("id", id) } }
    }

    suspend fun deleteGroceryItem(id: String) {
        db.from("grocery_items").delete { filter { eq("id", id) } }
    }

    // MARK: - Grocery lists

    suspend fun fetchGroceryLists(): List<GroceryList> =
        db.from("grocery_lists").select {
            order("created_at", Order.DESCENDING)
        }.decodeList()

    companion object {
        private val UUID_REGEX =
            Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
    }
}

class DataServiceException(message: String) : Exception(message)
