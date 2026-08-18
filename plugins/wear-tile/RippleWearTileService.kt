package com.kellehs.wellness.wear

import android.content.Context
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.DimensionBuilders.degrees
import androidx.wear.protolayout.DimensionBuilders.dp
import androidx.wear.protolayout.DimensionBuilders.expand
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.LayoutElementBuilders.ARC_ANCHOR_START
import androidx.wear.protolayout.LayoutElementBuilders.Arc
import androidx.wear.protolayout.LayoutElementBuilders.ArcLine
import androidx.wear.protolayout.LayoutElementBuilders.Box
import androidx.wear.protolayout.LayoutElementBuilders.Column
import androidx.wear.protolayout.LayoutElementBuilders.FontStyle
import androidx.wear.protolayout.LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER
import androidx.wear.protolayout.LayoutElementBuilders.Row
import androidx.wear.protolayout.LayoutElementBuilders.Spacer
import androidx.wear.protolayout.LayoutElementBuilders.TEXT_OVERFLOW_ELLIPSIZE_END
import androidx.wear.protolayout.LayoutElementBuilders.Text
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import kotlin.math.min

/**
 * Ripple Wear OS tile — full-face dashboard rendered from the values the phone
 * pushes over the Wearable Data Layer (see [WearDataListenerService]/[WearCache]).
 *
 * Design: dark face, steps ring (teal, outer) + water ring (blue, inner) around
 * the rim, big color-coded glucose in the center, 2x2 grid of steps/heart/water/
 * sleep, one insight line, and the updated-at stamp. Tapping anywhere opens the
 * watch app.
 */
class RippleWearTileService : TileService() {

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
            // Refresh once every 15 min so the tile stays fresh even without a phone push
            .setFreshnessIntervalMillis(15 * 60 * 1000L)
            .build()

        return Futures.immediateFuture(tile)
    }

    override fun onTileResourcesRequest(
        requestParams: RequestBuilders.ResourcesRequest
    ): ListenableFuture<ResourceBuilders.Resources> {
        return Futures.immediateFuture(
            ResourceBuilders.Resources.Builder()
                .setVersion(RESOURCES_VERSION)
                .build()
        )
    }

    companion object {
        private const val RESOURCES_VERSION = "1"

        // Palette (tuned for the dark watch face)
        private const val BG = 0xFF10141A
        private const val TEAL = 0xFF4ECDC4
        private const val TEAL_DIM = 0x334ECDC4
        private const val BLUE = 0xFF5EA0F0
        private const val BLUE_DIM = 0x335EA0F0
        private const val CORAL = 0xFFFF7A6B
        private const val LAVENDER = 0xFFB79CFF
        private const val LABEL_GRAY = 0xFF8A93A0
        private const val STAMP_GRAY = 0xFF5E6772
        private const val WHITE = 0xFFF2F4F7

        private const val STEPS_GOAL = 10000f  // No steps goal pushed over Data Layer; constant used here

        // Wellness score colors
        private const val SCORE_GREEN  = 0xFF2ECC71  // >= 75
        private const val SCORE_AMBER  = 0xFFF5A623  // >= 50
        private const val SCORE_RED    = 0xFFFF5252  // < 50
        private const val SCORE_GRAY   = 0xFF8A93A0  // "--" / unknown

        internal fun buildRoot(context: Context, cache: WearCache.Snapshot): LayoutElementBuilders.LayoutElement {
            val openApp = ModifiersBuilders.Clickable.Builder()
                .setId("open")
                .setOnClick(
                    ActionBuilders.LaunchAction.Builder()
                        .setAndroidActivity(
                            ActionBuilders.AndroidActivity.Builder()
                                .setPackageName(context.packageName)
                                .setClassName(RippleWearMainActivity::class.java.name)
                                .build()
                        )
                        .build()
                )
                .build()

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
                        .setClickable(openApp)
                        .build()
                )
                // Outer ring: steps progress vs 10k goal
                .addContent(ring(TEAL_DIM.toInt(), 360f))
                .addContent(ring(TEAL.toInt(), stepsSweep(cache.steps)))
                // Inner ring: water glasses vs goal, inset from the rim
                .addContent(inset(ring(BLUE_DIM.toInt(), 360f), 7f))
                .addContent(inset(ring(BLUE.toInt(), waterSweep(cache.water)), 7f))
                .addContent(centerContent(context, cache))
                .build()
        }

        /** Small tappable chip that launches the haptic breathing activity. */
        private fun breatheChip(context: Context): LayoutElementBuilders.LayoutElement {
            val launchBreathing = ModifiersBuilders.Clickable.Builder()
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

            return Box.Builder()
                .setModifiers(
                    ModifiersBuilders.Modifiers.Builder()
                        .setBackground(
                            ModifiersBuilders.Background.Builder()
                                .setColor(argb(TEAL_DIM.toInt()))
                                .setCorner(
                                    ModifiersBuilders.Corner.Builder()
                                        .setRadius(dp(10f))
                                        .build()
                                )
                                .build()
                        )
                        .setPadding(
                            ModifiersBuilders.Padding.Builder()
                                .setStart(dp(10f))
                                .setEnd(dp(10f))
                                .setTop(dp(3f))
                                .setBottom(dp(3f))
                                .build()
                        )
                        .setClickable(launchBreathing)
                        .build()
                )
                .addContent(text("🫁 BREATHE", 9, TEAL.toInt(), bold = true))
                .build()
        }

        /** Full-bleed arc starting at 12 o'clock, sweeping clockwise. */
        private fun ring(color: Int, sweepDegrees: Float): LayoutElementBuilders.LayoutElement =
            Arc.Builder()
                .setAnchorAngle(degrees(0f))
                .setAnchorType(ARC_ANCHOR_START)
                .addContent(
                    ArcLine.Builder()
                        .setLength(degrees(sweepDegrees.coerceIn(0f, 360f)))
                        .setThickness(dp(4f))
                        .setColor(argb(color))
                        .build()
                )
                .build()

        private fun inset(inner: LayoutElementBuilders.LayoutElement, padding: Float): LayoutElementBuilders.LayoutElement =
            Box.Builder()
                .setWidth(expand())
                .setHeight(expand())
                .setModifiers(
                    ModifiersBuilders.Modifiers.Builder()
                        .setPadding(
                            ModifiersBuilders.Padding.Builder()
                                .setAll(dp(padding))
                                .build()
                        )
                        .build()
                )
                .addContent(inner)
                .build()

        private fun centerContent(context: Context, cache: WearCache.Snapshot): LayoutElementBuilders.LayoutElement {
            val col = Column.Builder()
                .setWidth(expand())
                .setHorizontalAlignment(HORIZONTAL_ALIGN_CENTER)

            col.addContent(text("RIPPLE WELLNESS", 8, TEAL.toInt(), bold = true))
            col.addContent(Spacer.Builder().setHeight(dp(1f)).build())

            // Wellness score — compact "SCORE 78" chip colored by value
            col.addContent(
                Row.Builder()
                    .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
                    .addContent(text("SCORE ", 8, LABEL_GRAY.toInt(), bold = false))
                    .addContent(text(cache.wellnessScore, 10, wellnessScoreColor(cache.wellnessScore), bold = true))
                    .build()
            )
            col.addContent(Spacer.Builder().setHeight(dp(2f)).build())

            // Glucose hero — big number with the trend arrow beside it, and
            // the state label ("IN RANGE" / "ELEVATED" / "RISING HIGH" /
            // "STALE 32M" / etc.) directly below. Color escalates to red when
            // the reading is out of range OR trending into trouble (elevated
            // + rising, or dropping + falling), so the wearer sees "act now"
            // at a glance without reading the label.
            val gluCol = glucoseColor(cache)
            val gluText = cache.glucose.ifEmpty { "--" }
            if (cache.glucoseArrow.isNotEmpty()) {
                col.addContent(
                    Row.Builder()
                        .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_BOTTOM)
                        .addContent(text(gluText, 30, gluCol, bold = true))
                        .addContent(Spacer.Builder().setWidth(dp(4f)).build())
                        .addContent(text(cache.glucoseArrow, 18, gluCol, bold = true))
                        .build()
                )
            } else {
                col.addContent(text(gluText, 30, gluCol, bold = true))
            }
            val label = cache.glucoseLabel.ifEmpty { "mg/dL" }
            val labelColor = if (cache.glucoseLabel.isEmpty()) LABEL_GRAY.toInt() else gluCol
            col.addContent(text(label, 8, labelColor, bold = cache.glucoseLabel.isNotEmpty()))
            col.addContent(Spacer.Builder().setHeight(dp(4f)).build())

            // 2x2 metric grid
            col.addContent(
                gridRow(
                    stat("STEPS", cache.steps, TEAL.toInt()),
                    stat("HEART", heartDisplay(cache.heart), heartColor(cache.heart))
                )
            )
            col.addContent(Spacer.Builder().setHeight(dp(3f)).build())
            col.addContent(
                gridRow(
                    stat("WATER", cache.water, BLUE.toInt()),
                    stat("SLEEP", cache.sleep, LAVENDER.toInt())
                )
            )

            col.addContent(Spacer.Builder().setHeight(dp(4f)).build())
            col.addContent(breatheChip(context))

            // Insight (only when the phone has pushed one)
            if (cache.insight.isNotBlank()) {
                col.addContent(Spacer.Builder().setHeight(dp(4f)).build())
                col.addContent(
                    Box.Builder()
                        .setWidth(dp(132f))
                        .addContent(
                            Text.Builder()
                                .setText(cache.insight)
                                .setMaxLines(2)
                                .setOverflow(TEXT_OVERFLOW_ELLIPSIZE_END)
                                .setFontStyle(
                                    FontStyle.Builder()
                                        .setSize(sp(8))
                                        .setColor(argb(WHITE.toInt()))
                                        .build()
                                )
                                .build()
                        )
                        .build()
                )
            }

            col.addContent(Spacer.Builder().setHeight(dp(3f)).build())
            val stampText = if (cache.updatedAt.isNotEmpty()) "Updated ${cache.updatedAt}" else "Open Ripple to sync"
            col.addContent(text(stampText, 7, STAMP_GRAY.toInt()))

            return Box.Builder()
                .setWidth(expand())
                .setHeight(expand())
                .addContent(col.build())
                .build()
        }

        private fun gridRow(
            left: LayoutElementBuilders.LayoutElement,
            right: LayoutElementBuilders.LayoutElement
        ): LayoutElementBuilders.LayoutElement =
            Row.Builder()
                .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
                .addContent(Box.Builder().setWidth(dp(66f)).addContent(left).build())
                .addContent(Spacer.Builder().setWidth(dp(8f)).build())
                .addContent(Box.Builder().setWidth(dp(66f)).addContent(right).build())
                .build()

        private fun stat(label: String, value: String, accent: Int): LayoutElementBuilders.LayoutElement =
            Column.Builder()
                .setHorizontalAlignment(HORIZONTAL_ALIGN_CENTER)
                .addContent(text(label, 7, LABEL_GRAY.toInt(), bold = true))
                .addContent(text(value.ifEmpty { "--" }, 14, accent, bold = true))
                .build()

        private fun text(value: String, size: Int, color: Int, bold: Boolean = false): Text {
            val style = FontStyle.Builder()
                .setSize(sp(size))
                .setColor(argb(color))
            if (bold) style.setWeight(LayoutElementBuilders.FONT_WEIGHT_BOLD)
            return Text.Builder().setText(value).setFontStyle(style.build()).build()
        }

        /** "8,412" → fraction of the 10k goal, in degrees. */
        private fun stepsSweep(steps: String): Float {
            val n = steps.filter { it.isDigit() }.toIntOrNull() ?: return 0f
            return min(1f, n / STEPS_GOAL) * 360f
        }

        /** "4/8" → fraction of the daily goal, in degrees. */
        private fun waterSweep(water: String): Float {
            val parts = water.split("/")
            if (parts.size != 2) return 0f
            val count = parts[0].trim().toFloatOrNull() ?: return 0f
            val goal = parts[1].trim().toFloatOrNull() ?: return 0f
            if (goal <= 0f) return 0f
            return min(1f, count / goal) * 360f
        }

        private fun heartDisplay(heart: String): String {
            if (heart.isEmpty() || heart == "--") return "--"
            return if (heart.any { it.isLetter() }) heart else "$heart bpm"
        }

        /** Resting-rate zones: coral normal, amber elevated (>100), red high (>120). */
        private fun heartColor(heart: String): Int {
            val bpm = heart.trim().split(" ")[0].toIntOrNull() ?: return CORAL.toInt()
            return when {
                bpm > 120 -> 0xFFFF5252.toInt()
                bpm > 100 -> 0xFFF5A623.toInt()
                else -> CORAL.toInt()
            }
        }

        // Palette-agnostic glucose color that mirrors WatchTilesScreen.tsx +
        // the design brief: red when out of range OR trending toward it,
        // amber when merely elevated, green when in range, grey when stale.
        private fun glucoseColor(cache: WearCache.Snapshot): Int {
            // Try structured (mg parsed from cache.glucose) first, fall back
            // to the legacy embedded-arrow string just in case an old push
            // is still cached.
            val mg = cache.glucose.trim().split(" ")[0].toIntOrNull()
            if (mg == null) return 0xFFE85C82.toInt()          // unknown → berry
            if (cache.glucoseStale) return 0xFF8A93A0.toInt()  // grey out
            val trend = cache.glucoseTrend
            val delta = cache.glucoseDelta
            val rising = trend.contains("Up", ignoreCase = true) || delta >= 10
            val falling = trend.contains("Down", ignoreCase = true) || delta <= -10
            return when {
                mg < 70 || mg > 180                -> 0xFFFF5252.toInt() // red
                mg > 140 && rising                  -> 0xFFFF5252.toInt() // rising into high
                mg < 80 && falling                  -> 0xFFFF5252.toInt() // dropping toward low
                mg > 140                            -> 0xFFF5A623.toInt() // amber elevated
                else                                -> 0xFF2ECC71.toInt() // green in range
            }
        }

        /** Color the wellness score: green >=75, amber >=50, red <50, gray if unknown ("--"). */
        private fun wellnessScoreColor(score: String): Int {
            val n = score.trim().toIntOrNull() ?: return SCORE_GRAY.toInt()
            return when {
                n >= 75 -> SCORE_GREEN.toInt()
                n >= 50 -> SCORE_AMBER.toInt()
                else    -> SCORE_RED.toInt()
            }
        }

        private fun sp(size: Int) =
            androidx.wear.protolayout.DimensionBuilders.sp(size.toFloat())
    }
}
