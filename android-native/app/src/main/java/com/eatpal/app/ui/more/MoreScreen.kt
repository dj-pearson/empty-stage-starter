package com.eatpal.app.ui.more

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.navigation.NavHostController
import com.eatpal.app.ui.nav.Routes
import com.eatpal.app.ui.theme.Spacing

/**
 * Routes to iOS `MoreView` destinations. Each row pushes onto the nav stack
 * so the bottom bar hides (see MainBottomBar top-level guard).
 */
@Composable
fun MoreScreen(navController: NavHostController) {
    val items = listOf(
        "Kids" to Routes.KIDS,
        "Pantry" to Routes.PANTRY,
        "AI Coach" to Routes.AI_COACH,
        "AI Meal Plan" to Routes.AI_MEAL_PLAN,
        "Progress" to Routes.PROGRESS,
        "Food Chaining" to Routes.FOOD_CHAINING,
        "Picky Eater Quiz" to Routes.PICKY_QUIZ,
        "Settings" to Routes.SETTINGS,
        "Subscription" to Routes.PAYWALL,
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.sm),
    ) {
        Text(
            "More",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
        )
        items.forEachIndexed { i, (label, route) ->
            ListItem(
                headlineContent = { Text(label) },
                trailingContent = {
                    Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null)
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { navController.navigate(route) },
            )
            if (i < items.lastIndex) HorizontalDivider()
        }
    }
}
