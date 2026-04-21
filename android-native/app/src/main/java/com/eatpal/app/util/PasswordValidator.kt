package com.eatpal.app.util

/**
 * Mirrors iOS `PasswordValidator`. Same rule set so web / iOS / Android all
 * share the same password policy: 12+ chars, upper, lower, digit, special.
 */
object PasswordValidator {
    private const val MIN_LENGTH = 12
    private val SPECIAL = Regex("[!@#\$%^&*()_+\\-=\\[\\]{};':\"\\\\|,.<>/?`~]")

    data class Result(
        val isValid: Boolean,
        val failures: List<String>,
    )

    fun validate(password: String): Result {
        val failures = buildList {
            if (password.length < MIN_LENGTH) add("At least $MIN_LENGTH characters")
            if (!password.any { it.isUpperCase() }) add("An uppercase letter")
            if (!password.any { it.isLowerCase() }) add("A lowercase letter")
            if (!password.any { it.isDigit() }) add("A number")
            if (!SPECIAL.containsMatchIn(password)) add("A special character")
        }
        return Result(isValid = failures.isEmpty(), failures = failures)
    }
}
