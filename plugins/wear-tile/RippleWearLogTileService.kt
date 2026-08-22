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
 * Ripple Wear OS tile — LOG face (1B in the mockup).
 *
 * Shows the water count vs goal front and center. Tapping the water region
 * launches the Log activity where the user can add a glass (message goes to
 * the phone, which does the API call) or pick a mood. The tile itself can't
 * host real interactive controls beyond click-launches — Wear tiles only
 * accept LaunchAction / LoadAction on click regions.
 */
class RippleWearLogTileService : TileService() {

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
        val openLog = ModifiersBuilders.Clickable.Builder()
            .setId("log")
            .setOnClick(
                ActionBuilders.LaunchAction.Builder()
                    .setAndroidActivity(
                        ActionBuilders.AndroidActivity.Builder()
                            .setPackageName(context.packageName)
                            .setClassName(RippleWearLogActivity::class.java.name)
                            .build()
                    )
                    .build()
            )
            .build()

        // Parse "4 / 8" from cache — the phone pushes "count/goal" for water
        val water = cache.water
        val parts = water.split("/").map { it.trim() }
        val count = parts.getOrNull(0) ?: "--"
        val goal = parts.getOrNull(1) ?: ""
        val frac = try {
            val c = parts[0].trim().toFloat()
            val g = parts.getOrNull(1)?.trim()?.toFloat() ?: 8f
            if (g > 0) (c / g).coerceIn(0f, 1f) else 0f
        } catch (_: Exception) { 0f }

        val col = Column.Builder()
            .setWidth(expand())
            .setHorizontalAlignment(HORIZONTAL_ALIGN_CENTER)

        // Header line — normally "RIPPLE", but for ~10s after a log
        // finishes we flip it to a green "✓ LOGGED" or red "✗ TRY AGAIN"
        // so the wearer sees the outcome without opening the app.
        val flashMs = System.currentTimeMillis() - cache.lastLogStatusAt
        val flash = when {
            cache.lastLogStatusAt > 0 && flashMs in 0..10_000 && cache.lastLogStatus == "ok"   -> Pair("✓ LOGGED", 0xFF2ECC71.toInt())
            cache.lastLogStatusAt > 0 && flashMs in 0..10_000 && cache.lastLogStatus == "fail" -> Pair("✗ TRY AGAIN", 0xFFFF5252.toInt())
            else -> null
        }
        if (flash != null) {
            col.addContent(text(flash.first, 11, flash.second, bold = true))
        } else {
            col.addContent(text("RIPPLE", 10, TEAL.toInt(), bold = true))
        }
        col.addContent(Spacer.Builder().setHeight(dp(4f)).build())
        col.addContent(text("WATER — GLASSES", 9, LABEL_GRAY.toInt(), bold = true))
        col.addContent(Spacer.Builder().setHeight(dp(2f)).build())

        // Big count / goal
        col.addContent(
            Row.Builder()
                .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_BOTTOM)
                .addContent(text(count, 44, BLUE.toInt(), bold = true))
                .addContent(Spacer.Builder().setWidth(dp(4f)).build())
                .addContent(text(if (goal.isNotEmpty()) "/ $goal" else "", 14, LABEL_GRAY.toInt(), bold = true))
                .build()
        )
        col.addContent(Spacer.Builder().setHeight(dp(2f)).build())
        col.addContent(text("${(frac * 100).toInt()}% OF GOAL", 9, BLUE.toInt(), bold = true))

        col.addContent(Spacer.Builder().setHeight(dp(10f)).build())
        col.addContent(logGlassPill(context))
        col.addContent(Spacer.Builder().setHeight(dp(6f)).build())
        col.addContent(text("TAP TO LOG", 8, LABEL_GRAY.toInt(), bold = true))
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
                    .setClickable(openLog)
                    .build()
            )
            .addContent(col.build())
            .build()
    }

    private fun logGlassPill(context: Context): LayoutElementBuilders.LayoutElement {
        val click = ModifiersBuilders.Clickable.Builder()
            .setId("logglass")
            .setOnClick(
                ActionBuilders.LaunchAction.Builder()
                    .setAndroidActivity(
                        ActionBuilders.AndroidActivity.Builder()
                            .setPackageName(context.packageName)
                            .setClassName(RippleWearLogActivity::class.java.name)
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
                            .setColor(argb(BLUE.toInt()))
                            .setCorner(ModifiersBuilders.Corner.Builder().setRadius(dp(999f)).build())
                            .build()
                    )
                    .setPadding(
                        ModifiersBuilders.Padding.Builder()
                            .setStart(dp(16f)).setEnd(dp(16f))
                            .setTop(dp(6f)).setBottom(dp(6f))
                            .build()
                    )
                    .setClickable(click)
                    .build()
            )
            .addContent(text("+ LOG GLASS", 11, 0xFF0B1018.toInt(), bold = true))
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
        private const val BLUE = 0xFF5EA0F0
        private const val LABEL_GRAY = 0xFF8A93A0
    }
}
