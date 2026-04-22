package com.eatpal.app.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Must match the iOS PasswordValidator rule set exactly — the 4 platforms
 * (web, iOS, Android, server-side) need to agree on what counts as a valid
 * password or users see confusing divergence across logins.
 */
class PasswordValidatorTest {

    @Test
    fun `blessed password passes`() {
        val result = PasswordValidator.validate("GoodPass123!abc")
        assertTrue(result.isValid)
        assertEquals(emptyList<String>(), result.failures)
    }

    @Test
    fun `too short fails with length failure`() {
        val result = PasswordValidator.validate("Ab1!")
        assertFalse(result.isValid)
        assertTrue(result.failures.any { "12 characters" in it })
    }

    @Test
    fun `missing uppercase fails`() {
        val result = PasswordValidator.validate("lowercase1234!")
        assertFalse(result.isValid)
        assertTrue(result.failures.any { it.contains("uppercase", ignoreCase = true) })
    }

    @Test
    fun `missing lowercase fails`() {
        val result = PasswordValidator.validate("UPPERCASE1234!")
        assertFalse(result.isValid)
        assertTrue(result.failures.any { it.contains("lowercase", ignoreCase = true) })
    }

    @Test
    fun `missing digit fails`() {
        val result = PasswordValidator.validate("NoDigitsHere!!!")
        assertFalse(result.isValid)
        assertTrue(result.failures.any { it.contains("number", ignoreCase = true) })
    }

    @Test
    fun `missing special char fails`() {
        val result = PasswordValidator.validate("NoSpecialChar123")
        assertFalse(result.isValid)
        assertTrue(result.failures.any { it.contains("special", ignoreCase = true) })
    }

    @Test
    fun `accepts various special chars`() {
        val specials = "!@#$%^&*()_+-=[]{};':\"\\|,.<>/?`~"
        for (s in specials) {
            val pw = "GoodPassword1${s}Abc"
            val result = PasswordValidator.validate(pw)
            assertTrue("should accept special '$s'", result.isValid)
        }
    }
}
