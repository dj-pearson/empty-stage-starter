package com.eatpal.app.models

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Tests for the `applying(update)` methods on every model. These power the
 * optimistic-update path in AppStateStore — a bug here corrupts the local
 * StateFlow view until the next realtime replay arrives.
 */
class ApplyingTest {

    @Test
    fun `Food applying overrides only set fields`() {
        val base = Food(
            id = "f1",
            userId = "u1",
            name = "Milk",
            category = "dairy",
            isSafe = true,
            isTryBite = false,
            allergens = listOf("lactose"),
            quantity = 2.0,
        )
        val updated = base.applying(FoodUpdate(name = "Whole milk", quantity = 3.0))
        assertEquals("Whole milk", updated.name)
        assertEquals(3.0, updated.quantity!!, 0.0)
        // Untouched fields preserved
        assertEquals("dairy", updated.category)
        assertEquals(listOf("lactose"), updated.allergens)
        assertEquals(true, updated.isSafe)
        assertEquals(base.id, updated.id)
        assertEquals(base.userId, updated.userId)
    }

    @Test
    fun `Food applying empty update is no-op`() {
        val base = Food(id = "f1", userId = "u1", name = "X", category = "carb")
        val updated = base.applying(FoodUpdate())
        assertEquals(base, updated)
    }

    @Test
    fun `Kid applying covers all 19 update fields`() {
        val base = Kid(id = "k1", userId = "u1", name = "Old")
        val update = KidUpdate(
            name = "New",
            age = 8,
            gender = "nb",
            allergens = listOf("peanut"),
            dietaryRestrictions = listOf("vegetarian"),
            pickinessLevel = "medium",
            notes = "Eats breakfast slowly",
            heightCm = 120.5,
            weightKg = 22.0,
            profilePictureUrl = "https://example.com/p.jpg",
            texturePreferences = listOf("crunchy"),
            textureDislikes = listOf("mushy"),
            flavorPreferences = listOf("salty"),
            favoriteFoods = listOf("apple"),
            dislikedFoods = listOf("broccoli"),
            behavioralNotes = "Distracted at dinner",
            healthGoals = listOf("grow"),
            nutritionConcerns = listOf("iron"),
            helpfulStrategies = listOf("plate colors"),
        )
        val u = base.applying(update)
        assertEquals("New", u.name)
        assertEquals(8, u.age)
        assertEquals("nb", u.gender)
        assertEquals(listOf("peanut"), u.allergens)
        assertEquals(listOf("vegetarian"), u.dietaryRestrictions)
        assertEquals("medium", u.pickinessLevel)
        assertEquals(120.5, u.heightCm!!, 0.0001)
        assertEquals(22.0, u.weightKg!!, 0.0001)
        assertEquals(listOf("crunchy"), u.texturePreferences)
        assertEquals(listOf("mushy"), u.textureDislikes)
        assertEquals(listOf("salty"), u.flavorPreferences)
        assertEquals(listOf("apple"), u.favoriteFoods)
        assertEquals(listOf("broccoli"), u.dislikedFoods)
        assertEquals("Distracted at dinner", u.behavioralNotes)
        assertEquals(listOf("grow"), u.healthGoals)
        assertEquals(listOf("iron"), u.nutritionConcerns)
        assertEquals(listOf("plate colors"), u.helpfulStrategies)
    }

    @Test
    fun `Recipe applying preserves untouched fields`() {
        val base = Recipe(
            id = "r1",
            userId = "u1",
            name = "Old",
            description = "keep",
            foodIds = listOf("a"),
            prepTime = "5 min",
        )
        val u = base.applying(RecipeUpdate(name = "New", cookTime = "20 min"))
        assertEquals("New", u.name)
        assertEquals("keep", u.description)
        assertEquals("20 min", u.cookTime)
        // Untouched
        assertEquals(listOf("a"), u.foodIds)
        assertEquals("5 min", u.prepTime)
    }

    @Test
    fun `PlanEntry applying swaps food_id and meal_slot`() {
        val base = PlanEntry(
            id = "p1",
            userId = "u1",
            kidId = "k1",
            date = "2026-04-22",
            mealSlot = "breakfast",
            foodId = "f1",
        )
        val u = base.applying(PlanEntryUpdate(foodId = "f2", mealSlot = "lunch", result = "ate"))
        assertEquals("f2", u.foodId)
        assertEquals("lunch", u.mealSlot)
        assertEquals("ate", u.result)
        assertEquals("k1", u.kidId) // kidId isn't in PlanEntryUpdate — preserved
    }

    @Test
    fun `GroceryItem applying toggles checked without losing metadata`() {
        val base = GroceryItem(
            id = "g1",
            userId = "u1",
            name = "Bread",
            category = "carb",
            quantity = 2.0,
            unit = "loaves",
            checked = false,
            aisle = "3",
            priority = "high",
        )
        val u = base.applying(GroceryItemUpdate(checked = true))
        assertEquals(true, u.checked)
        // Everything else preserved
        assertEquals("Bread", u.name)
        assertEquals(2.0, u.quantity, 0.0)
        assertEquals("3", u.aisle)
        assertEquals("high", u.priority)
    }
}
