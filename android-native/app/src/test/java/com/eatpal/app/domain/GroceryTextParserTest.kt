package com.eatpal.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GroceryTextParserTest {

    @Test
    fun `parses comma-separated list`() {
        val items = GroceryTextParser.parse("milk, bread, eggs")
        assertEquals(3, items.size)
        assertEquals("Milk", items[0].name)
        assertEquals("dairy", items[0].category)
        assertEquals("Bread", items[1].name)
        assertEquals("carb", items[1].category)
    }

    @Test
    fun `parses quantity + unit`() {
        val items = GroceryTextParser.parse("2 lbs chicken, 1 gallon milk")
        val chicken = items.first { it.name == "Chicken" }
        assertEquals(2.0, chicken.quantity, 0.0)
        assertEquals("lbs", chicken.unit)
        assertEquals("protein", chicken.category)

        val milk = items.first { it.name == "Milk" }
        assertEquals(1.0, milk.quantity, 0.0)
        assertEquals("gal", milk.unit)
    }

    @Test
    fun `parses 'and'-joined utterance`() {
        val items = GroceryTextParser.parse("apples and bananas and cheese")
        assertEquals(3, items.size)
        assertEquals(setOf("Apples", "Bananas", "Cheese"), items.map { it.name }.toSet())
    }

    @Test
    fun `handles word-form numbers`() {
        val items = GroceryTextParser.parse("two pounds of ground beef")
        assertEquals(1, items.size)
        assertEquals(2.0, items[0].quantity, 0.0)
        assertEquals("lbs", items[0].unit)
        assertEquals("Ground Beef", items[0].name)
    }

    @Test
    fun `strips list markers`() {
        val items = GroceryTextParser.parse("- milk\n* bread\n1. eggs\n[ ] apples")
        assertEquals(4, items.size)
    }

    @Test
    fun `dedupes case-insensitively`() {
        val items = GroceryTextParser.parse("Milk, milk, MILK")
        assertEquals(1, items.size)
    }

    @Test
    fun `low-confidence on bare single-word input`() {
        val items = GroceryTextParser.parse("chicken")
        assertEquals(1, items.size)
        assertTrue("single-word no-qty should have confidence <= 0.7", items[0].confidence <= 0.7)
    }

    @Test
    fun `fraction quantity`() {
        val items = GroceryTextParser.parse("1/2 cup rice")
        assertEquals(0.5, items[0].quantity, 0.0)
        assertEquals("cups", items[0].unit)
        assertEquals("Rice", items[0].name)
    }

    @Test
    fun `empty input returns empty`() {
        assertEquals(emptyList<Any>(), GroceryTextParser.parse(""))
        assertEquals(emptyList<Any>(), GroceryTextParser.parse("   \n  "))
    }

    @Test
    fun `returns at least an item for unknown names`() {
        val items = GroceryTextParser.parse("specialingredient")
        assertEquals(1, items.size)
        assertNotNull(items[0].name)
    }
}
