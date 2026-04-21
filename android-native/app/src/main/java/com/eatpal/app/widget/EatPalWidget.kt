package com.eatpal.app.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.material3.ColorProviders
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import androidx.glance.Image
import androidx.glance.GlanceTheme
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.eatpal.app.data.local.WidgetSnapshotStore
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.first

/**
 * Glance widget showing today's meals + grocery / pantry counts. Reads
 * exclusively from [WidgetSnapshotStore] — no network, no Supabase. Matches
 * iOS EatPalWidget payload shape so the UX is identical.
 */
class EatPalWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val store = EntryPointAccessors
            .fromApplication(context, WidgetEntryPoint::class.java)
            .widgetSnapshotStore()
        val payload = store.snapshot.first()

        provideContent {
            GlanceTheme {
                WidgetContent(payload)
            }
        }
    }
}

@Composable
private fun WidgetContent(payload: WidgetSnapshotStore.Payload) {
    val padding = 12.dp
    Column(
        modifier = GlanceModifier.fillMaxSize().padding(padding),
    ) {
        Text(
            "Today",
            style = TextStyle(
                fontWeight = FontWeight.Bold,
                color = ColorProvider(Color.Black),
            ),
        )
        Spacer(modifier = GlanceModifier.height(8.dp))
        if (payload.meals.isEmpty()) {
            Text(
                "No meals planned.",
                style = TextStyle(color = ColorProvider(Color.Black)),
            )
        } else {
            payload.meals.take(3).forEach { meal ->
                Text(
                    "${meal.slot}: ${meal.foodName}",
                    style = TextStyle(color = ColorProvider(Color.Black)),
                )
            }
        }
        Spacer(modifier = GlanceModifier.height(8.dp))
        Row(modifier = GlanceModifier.fillMaxWidth()) {
            Text(
                "🛒 ${payload.groceryCount}",
                style = TextStyle(color = ColorProvider(Color.Black)),
            )
            Spacer(modifier = GlanceModifier.size(12.dp))
            Text(
                "📦 ${payload.pantryLowCount} low",
                style = TextStyle(color = ColorProvider(Color.Black)),
            )
        }
    }
}

class EatPalWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = EatPalWidget()
}

@EntryPoint
@InstallIn(SingletonComponent::class)
interface WidgetEntryPoint {
    fun widgetSnapshotStore(): WidgetSnapshotStore
}
