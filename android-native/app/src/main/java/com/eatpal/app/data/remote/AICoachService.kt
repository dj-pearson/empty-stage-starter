package com.eatpal.app.data.remote

import com.eatpal.app.models.ChatMessage
import com.eatpal.app.models.Food
import com.eatpal.app.models.Kid
import io.github.jan.supabase.functions.functions
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Kotlin port of iOS `AICoachService`. Invokes the `ai-coach-chat` edge
 * function with the same payload contract — messages array, optional
 * kidContext, maxTokens. Falls back to a canned response on network / auth
 * errors just like iOS.
 */
@Singleton
class AICoachService @Inject constructor(
    private val supabase: SupabaseClientProvider,
    private val json: Json,
) {

    @Serializable
    private data class CoachResponse(@SerialName("message") val message: String)

    /**
     * Sends [userText] to the coach. [history] is the recent conversation
     * (last 20 messages iOS caps); the edge function appends its own reply to
     * the returned value.
     */
    suspend fun send(
        userText: String,
        history: List<ChatMessage>,
        kid: Kid?,
        foods: List<Food>,
    ): String {
        val payload = buildPayload(history, userText, kid, foods)
        return runCatching {
            val response = supabase.client.functions.invoke("ai-coach-chat") {
                contentType(ContentType.Application.Json)
                setBody(payload)
            }
            val text = response.bodyAsText()
            json.decodeFromString(CoachResponse.serializer(), text).message
        }.getOrElse { fallbackResponse(userText, kid) }
    }

    private fun buildPayload(
        history: List<ChatMessage>,
        latest: String,
        kid: Kid?,
        foods: List<Food>,
    ): JsonObject = buildJsonObject {
        val tail = (history.takeLast(19) + ChatMessage(role = ChatMessage.Role.USER, content = latest))
        val messages: JsonArray = buildJsonArray {
            for (m in tail) {
                add(buildJsonObject {
                    put("role", m.role.name.lowercase())
                    put("content", m.content)
                })
            }
        }
        put("messages", messages)
        put("maxTokens", 2000)
        if (kid != null) {
            val kidContext: JsonElement = buildJsonObject {
                put("name", kid.name)
                kid.age?.let { put("age", it) }
                kid.allergens?.let { list ->
                    put("allergens", buildJsonArray { list.forEach { add(JsonPrimitive(it)) } })
                }
                kid.pickinessLevel?.let { put("pickinessLevel", it) }
                put("safeFoodsCount", foods.count { it.isSafe })
                put("tryBiteFoodsCount", foods.count { it.isTryBite })
            }
            put("kidContext", kidContext)
        }
    }

    // Mirrors iOS fallback copy verbatim so the UX is identical on outage.
    private fun fallbackResponse(input: String, kid: Kid?): String {
        val kidName = kid?.name ?: "your child"
        val lowered = input.lowercase()
        return when {
            "picky" in lowered || "won't eat" in lowered || "refuse" in lowered -> """
                Picky eating is very common! Here are some strategies for $kidName:

                1. Offer new foods alongside familiar favorites
                2. Let them explore food with all senses - touching and smelling count as progress
                3. Try food chaining - start with foods they like and gradually introduce similar ones
                4. Keep portions tiny for new foods (1-2 bites)
                5. Avoid pressure - keep mealtimes positive
            """.trimIndent()
            "breakfast" in lowered || "lunch" in lowered || "dinner" in lowered || "meal idea" in lowered -> """
                Here are some balanced meal ideas for $kidName:

                - **Breakfast**: Whole grain toast with nut butter + banana slices
                - **Lunch**: Roll-ups with turkey, cheese, and veggies
                - **Dinner**: Mini meatballs with pasta and hidden veggie sauce
                - **Snack**: Apple slices with yogurt dip

                Would you like more specific ideas based on their safe foods?
            """.trimIndent()
            "nutrition" in lowered || "vitamin" in lowered || "nutrient" in lowered -> """
                Great question about nutrition for $kidName! Key nutrients for growing kids include:

                - **Iron**: Found in lean meats, beans, fortified cereals
                - **Calcium**: Dairy, fortified alternatives, leafy greens
                - **Fiber**: Fruits, vegetables, whole grains
                - **Protein**: Meat, eggs, dairy, legumes

                Would you like me to suggest foods rich in a specific nutrient?
            """.trimIndent()
            else -> """
                That's a great question! Here are some general tips for feeding $kidName:

                - Keep introducing new foods - it can take 10-15 exposures
                - Model healthy eating habits
                - Involve them in meal prep when possible
                - Make food fun with different shapes and colors

                Would you like more specific advice? Tell me about any particular challenges you're facing.
            """.trimIndent()
        }
    }
}
