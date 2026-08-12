package com.kellehs.wellness.wear

import android.content.Context
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.DimensionBuilders.dp
import androidx.wear.protolayout.DimensionBuilders.expand
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.LayoutElementBuilders.Box
import androidx.wear.protolayout.LayoutElementBuilders.Column
import androidx.wear.protolayout.LayoutElementBuilders.FontStyle
import androidx.wear.protolayout.LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER
import androidx.wear.protolayout.LayoutElementBuilders.Row
import androidx.wear.protolayout.LayoutElementBuilders.Spacer
import androidx.wear.protolayout.LayoutElementBuilders.Text
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/**
 * Ripple Wear OS tile — BREATHE face (1C in the mockup).
 *
 * Shows the mindfulness streak, today's minutes, and a full-width BREATHE
 * button. Tapping anywhere launches the breathing activity where the user
 * picks a pace (box 4-4-4-4 or relax 4-7-8) and the activity guides the
 * session with an animated circle + haptic phase changes.
 */
class RippleWearBreatheTileService : TileService() {

    override fun onTileRequest(
        requestParams: RequestBuilders.TileRequest
    ): ListenableFuture<TileBuilders.Tile> {
        val cache = WearCache.read(this)

        val tile = TileBuilders.Tile.Builder()
            .setResourcesVersion(RESOURCES_VERSION)
            .setTileTimeline(
                TimelineBuilders.Timeline.Builder()
                    .addTimelineEntry(
                        TimelineBuilders.TimelineEntry.Builder()
                            .setLayout(
                                LayoutElementBuilders.Layout.Builder()
                                    .setRoot(buildRoot(this, cache))
                                    .build()
                            )
                            .build()
                    )
                    .build()
            )
            .setFreshnessIntervalMillis(15 * 60 * 1000L)
            .build()

        return Futures.immediateFuture(tile)
    }

    override fun onTileResourcesRequest(
        requestParams: RequestBuilders.ResourcesRequest
    ): ListenableFuture<ResourceBuilders.Resources> {
        return Futures.immediateFuture(
            ResourceBuilders.Resources.Builder().setVersion(RESOURCES_VERSION).build()
        )
    }

    private fun buildRoot(context: Context, cache: WearCache.Snapshot): LayoutElementBuilders.LayoutElement {
        val open = ModifiersBuilders.Clickable.Builder()
            .setId("breathe")
            .setOnClick(
                ActionBuilders.LaunchAction.Builder()
                    .setAndroidActivity(
                        ActionBuilders.AndroidActivity.Builder()
                            .setPackageName(context.packageName)
                            .setClassName(RippleWearBreathingActivity::class.java.name)
                            .build()
                    )
                    .build()
            )
            .build()

        // Mindfulness day-streak pushed from the phone in WearCache.mindStreak.
        // 0 is a valid state (nothing logged yet) — render "—" so the tile
        // reads as "no data" rather than lying about a zero streak.
        val streak = if (cache.mindStreak > 0) cache.mindStreak.toString() else "—"

        val col = Column.Builder()
            .setWidth(expand())
            .setHorizontalAlignment(HORIZONTAL_ALIGN_CENTER)

        col.addContent(text("RIPPLE", 10, TEAL.toInt(), bold = true))
        col.addContent(Spacer.Builder().setHeight(dp(4f)).build())
        col.addContent(text("MINDFULNESS", 9, LABEL_GRAY.toInt(), bold = true))
        col.addContent(Spacer.Builder().setHeight(dp(2f)).build())

        col.addContent(
            Row.Builder()
                .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_BOTTOM)
                .addContent(text(streak, 44, WHITE.toInt(), bold = true))
                .addContent(Spacer.Builder().setWidth(dp(6f)).build())
                .addContent(text("DAY STREAK", 10, LABEL_GRAY.toInt(), bold = true))
                .build()
        )

        col.addContent(Spacer.Builder().setHeight(dp(12f)).build())
        col.addContent(breathePill(context))
        col.addContent(Spacer.Builder().setHeight(dp(6f)).build())
        col.addContent(text("HAPTIC-GUIDED · TWO PACES", 8, LABEL_GRAY.toInt(), bold = true))
        col.addContent(Spacer.Builder().setHeight(dp(2f)).build())
        val stamp = if (cache.updatedAt.isNotEmpty()) "Updated ${cache.updatedAt}" else "Open Ripple to sync"
        col.addContent(text(stamp, 7, LABEL_GRAY.toInt()))

        return Box.Builder()
            .setWidth(expand())
            .setHeight(expand())
            .setModifiers(
                ModifiersBuilders.Modifiers.Builder()
                    .setBackground(
                        ModifiersBuilders.Background.Builder()
                            .setColor(argb(BG.toInt()))
                            .build()
                    )
                    .setClickable(open)
                    .build()
            )
            .addContent(col.build())
            .build()
    }

    private fun breathePill(context: Context): LayoutElementBuilders.LayoutElement {
        val click = ModifiersBuilders.Clickable.Builder()
            .setId("breathegogo")
            .setOnClick(
                ActionBuilders.LaunchAction.Builder()
                    .setAndroidActivity(
                        ActionBuilders.AndroidActivity.Builder()
                            .setPackageName(context.packageName)
                            .setClassName(RippleWearBreathingActivity::class.java.name)
                            .build()
                    )
                    .build()
            )
            .build()

        return Box.Builder()
            .setModifiers(
                ModifiersBuilders.Modifiers.Builder()
                    .setBackground(
                        ModifiersBuilders.Background.Builder()
                            .setColor(argb(TEAL.toInt()))
                            .setCorner(ModifiersBuilders.Corner.Builder().setRadius(dp(999f)).build())
                            .build()
                    )
                    .setPadding(
                        ModifiersBuilders.Padding.Builder()
                            .setStart(dp(20f)).setEnd(dp(20f))
                            .setTop(dp(8f)).setBottom(dp(8f))
                            .build()
                    )
                    .setClickable(click)
                    .build()
            )
            .addContent(text("BREATHE →", 13, 0xFF0B1018.toInt(), bold = true))
            .build()
    }

    private fun text(value: String, size: Int, color: Int, bold: Boolean = false): Text {
        val style = FontStyle.Builder()
            .setSize(sp(size))
            .setColor(argb(color))
        if (bold) style.setWeight(LayoutElementBuilders.FONT_WEIGHT_BOLD)
        return Text.Builder().setText(value).setFontStyle(style.build()).build()
    }

    private fun sp(size: Int) = androidx.wear.protolayout.DimensionBuilders.sp(size.toFloat())

    companion object {
        private const val RESOURCES_VERSION = "1"
        private const val BG = 0xFF10141A
        private const val TEAL = 0xFF4ECDC4
        private const val LABEL_GRAY = 0xFF8A93A0
        private const val WHITE = 0xFFF2F4F7
    }
}
