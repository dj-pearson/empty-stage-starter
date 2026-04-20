package com.eatpal.app.models

import java.util.UUID

/** Mirrors iOS `ChatMessage`. Used by AICoachService — not a DB row. */
data class ChatMessage(
    val id: String = UUID.randomUUID().toString(),
    val role: Role,
    val content: String,
    val timestamp: Long = System.currentTimeMillis(),
) {
    enum class Role { USER, ASSISTANT, SYSTEM }
}
