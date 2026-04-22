package com.eatpal.app.ui.nav

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.LocalGroceryStore
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.RestaurantMenu
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import com.eatpal.app.ui.theme.Spacing
import com.eatpal.app.ui.dashboard.DashboardScreen
import com.eatpal.app.ui.grocery.GroceryScreen
import com.eatpal.app.ui.kids.KidsScreen
import com.eatpal.app.ui.mealplan.MealPlanScreen
import com.eatpal.app.ui.more.MoreScreen
import com.eatpal.app.ui.pantry.PantryScreen
import com.eatpal.app.ui.recipes.RecipesScreen
import com.eatpal.app.ui.settings.SettingsScreen

/**
 * iOS `MainTabView` equivalent. NavHost hosts the full graph; the 5-item
 * bottom NavigationBar surfaces the top-level tabs. More-menu destinations
 * push onto the same back stack so Back returns through the tab they opened.
 */
@Composable
fun MainNavigation(navController: NavHostController) {
    NavHost(navController = navController, startDestination = Routes.DASHBOARD) {
        composable(Routes.DASHBOARD) { DashboardScreen() }
        composable(Routes.MEAL_PLAN) { MealPlanScreen() }
        composable(Routes.GROCERY) { GroceryScreen() }
        composable(Routes.RECIPES) { RecipesScreen() }
        composable(Routes.MORE) { MoreScreen(navController) }

        // More-menu destinations
        composable(Routes.KIDS) { KidsScreen() }
        composable(Routes.PANTRY) { PantryScreen() }
        composable(Routes.SETTINGS) { SettingsScreen() }
        composable(Routes.PAYWALL) { com.eatpal.app.ui.paywall.PaywallScreen() }
        composable(Routes.AI_COACH) { com.eatpal.app.ui.aicoach.AICoachScreen() }
        composable(Routes.PROGRESS) { com.eatpal.app.ui.progress.ProgressScreen() }
        composable(Routes.FOOD_CHAINING) { com.eatpal.app.ui.foodchaining.FoodChainingScreen() }
        composable(Routes.PICKY_QUIZ) { com.eatpal.app.ui.quiz.PickyQuizScreen() }
    }
}

data class BottomTab(val route: String, val label: String, val icon: ImageVector)

private val BottomTabs = listOf(
    BottomTab(Routes.DASHBOARD, "Home", Icons.Default.Dashboard),
    BottomTab(Routes.MEAL_PLAN, "Meals", Icons.Default.RestaurantMenu),
    BottomTab(Routes.GROCERY, "Grocery", Icons.Default.LocalGroceryStore),
    BottomTab(Routes.RECIPES, "Recipes", Icons.AutoMirrored.Filled.MenuBook),
    BottomTab(Routes.MORE, "More", Icons.Default.Menu),
)

/**
 * The bottom nav only renders when we're on a top-level tab — nested
 * destinations (like Kids from More) hide it so the pushed screen gets
 * the full height, matching iOS NavigationStack behavior.
 */
@Composable
fun MainBottomBar(navController: NavHostController) {
    val entry by navController.currentBackStackEntryAsState()
    val currentRoute = entry?.destination?.route
    val isTopLevel = BottomTabs.any { it.route == currentRoute }
    if (!isTopLevel) return

    NavigationBar {
        BottomTabs.forEach { tab ->
            val selected = entry?.destination?.hierarchy?.any { it.route == tab.route } == true
            NavigationBarItem(
                selected = selected,
                icon = { Icon(tab.icon, contentDescription = tab.label) },
                label = { Text(tab.label) },
                onClick = {
                    navController.navigate(tab.route) {
                        popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                },
            )
        }
    }
}

@Composable
fun PlaceholderScreen(title: String) {
    Column(
        modifier = Modifier.fillMaxSize().padding(Spacing.xl),
        verticalArrangement = Arrangement.spacedBy(Spacing.sm),
    ) {
        Text(title)
        Text("Coming soon — see prd.json.")
    }
}
