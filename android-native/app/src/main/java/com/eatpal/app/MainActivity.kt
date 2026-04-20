package com.eatpal.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.eatpal.app.ui.RootScreen
import com.eatpal.app.ui.theme.EatPalTheme
import dagger.hilt.android.AndroidEntryPoint

/**
 * Single-activity host. Navigation lives inside Compose via Navigation-Compose —
 * mirrors the iOS `RootView` which picks between Auth and MainTabView.
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            EatPalTheme {
                RootScreen()
            }
        }
    }
}
