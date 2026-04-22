package com.eatpal.app.util

import android.content.Intent
import android.net.Uri
import com.eatpal.app.ui.nav.Routes

/**
 * Maps a `tryeatpal://` or `https://tryeatpal.com/...` URI onto a Compose
 * route the nav graph knows about. Kept framework-light so MainActivity can
 * call it in onCreate/onNewIntent without dragging in Compose.
 */
object DeepLinkHandler {

    /** Returns the route to navigate to, or null if the intent is irrelevant. */
    fun resolve(intent: Intent?): String? {
        val uri = intent?.data ?: return null
        return when (uri.scheme) {
            "tryeatpal" -> hostToRoute(uri.host, uri)
            "https", "http" -> {
                if (uri.host != "tryeatpal.com") return null
                // Strip the leading slash so /grocery → "grocery" → Routes.GROCERY
                val first = uri.pathSegments.firstOrNull().orEmpty()
                hostToRoute(first, uri)
            }
            else -> null
        }
    }

    private fun hostToRoute(host: String?, uri: Uri): String? = when (host) {
        "dashboard" -> Routes.DASHBOARD
        "meal_plan", "meals" -> Routes.MEAL_PLAN
        "grocery" -> Routes.GROCERY
        "recipes" -> Routes.RECIPES
        "more" -> Routes.MORE
        "kids" -> Routes.KIDS
        "pantry" -> Routes.PANTRY
        "settings" -> Routes.SETTINGS
        "paywall", "subscribe" -> Routes.PAYWALL
        "ai_coach", "coach" -> Routes.AI_COACH
        "ai_meal_plan" -> Routes.AI_MEAL_PLAN
        "progress" -> Routes.PROGRESS
        "food_chaining" -> Routes.FOOD_CHAINING
        "picky_quiz" -> Routes.PICKY_QUIZ
        else -> null
    }.also {
        // Silence the unused-parameter warning and reserve a hook for callers
        // that want to pull query params (e.g., ?trip=start).
        @Suppress("UNUSED_EXPRESSION") uri
    }
}
