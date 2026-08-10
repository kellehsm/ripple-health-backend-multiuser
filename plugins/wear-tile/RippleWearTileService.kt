package com.kellehs.wellness.wear

import android.content.Context
import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.DimensionBuilders.dp
import androidx.wear.protolayout.DimensionBuilders.expand
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.LayoutElementBuilders.Column
import androidx.wear.protolayout.LayoutElementBuilders.FontStyle
import androidx.wear.protolayout.LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER
import androidx.wear.protolayout.LayoutElementBuilders.HORIZONTAL_ALIGN_START
import androidx.wear.protolayout.LayoutElementBuilders.Row
import androidx.wear.protolayout.LayoutElementBuilders.Spacer
import androidx.wear.protolayout.LayoutElementBuilders.Text
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.protolayout.expression.VersionBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/**
 * Ripple Wear OS tile — shows the latest cached glucose, steps, and water values
 * that the phone side pushes via the Wearable Data Layer.
 *
 * Data lives in SharedPreferences keyed off [WearCache.PREFS], populated by
 * [WearDataListenerService] whenever a new DataItem arrives from the phone.
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

        internal fun buildRoot(context: Context, cache: WearCache.Snapshot): LayoutElementBuilders.LayoutElement {
            // Header: "Ripple"
            val header = Text.Builder()
                .setText("Ripple")
                .setFontStyle(
                    FontStyle.Builder()
                        .setSize(sp(14))
                        .setColor(argb(0xFF3FA0A6.toInt()))
                        .setWeight(LayoutElementBuilders.FONT_WEIGHT_BOLD)
                        .build()
                )
                .build()

            val glucose = metricBlock(
                label = "GLUCOSE",
                value = cache.glucose,
                unit = "mg/dL",
                accent = 0xFFA62A50.toInt(),
                valueColor = glucoseColor(cache.glucose)
            )

            val steps = metricBlock(
                label = "STEPS",
                value = cache.steps,
                unit = "today",
                accent = 0xFF3FA0A6.toInt(),
                valueColor = 0xFF2A7A80.toInt()
            )

            val water = metricBlock(
                label = "WATER",
                value = cache.water,
                unit = "glasses",
                accent = 0xFF2F6DB5.toInt(),
                valueColor = 0xFF2F6DB5.toInt()
            )

            val stampText = if (cache.updatedAt.isNotEmpty()) "Updated ${cache.updatedAt}" else "Open Ripple to sync"
            val stamp = Text.Builder()
                .setText(stampText)
                .setFontStyle(
                    FontStyle.Builder()
                        .setSize(sp(9))
                        .setColor(argb(0xFF9E9689.toInt()))
                        .build()
                )
                .build()

            return Column.Builder()
                .setWidth(expand())
                .setHeight(expand())
                .setHorizontalAlignment(HORIZONTAL_ALIGN_CENTER)
                .addContent(header)
                .addContent(Spacer.Builder().setHeight(dp(6f)).build())
                .addContent(glucose)
                .addContent(Spacer.Builder().setHeight(dp(4f)).build())
                .addContent(steps)
                .addContent(Spacer.Builder().setHeight(dp(4f)).build())
                .addContent(water)
                .addContent(Spacer.Builder().setHeight(dp(6f)).build())
                .addContent(stamp)
                .build()
        }

        private fun metricBlock(
            label: String,
            value: String,
            unit: String,
            accent: Int,
            valueColor: Int
        ): LayoutElementBuilders.LayoutElement {
            val labelText = Text.Builder()
                .setText(label)
                .setFontStyle(
                    FontStyle.Builder()
                        .setSize(sp(9))
                        .setColor(argb(accent))
                        .setWeight(LayoutElementBuilders.FONT_WEIGHT_BOLD)
                        .build()
                )
                .build()

            val valueText = Text.Builder()
                .setText(value.ifEmpty { "--" })
                .setFontStyle(
                    FontStyle.Builder()
                        .setSize(sp(20))
                        .setColor(argb(valueColor))
                        .setWeight(LayoutElementBuilders.FONT_WEIGHT_BOLD)
                        .build()
                )
                .build()

            val unitText = Text.Builder()
                .setText(unit)
                .setFontStyle(
                    FontStyle.Builder()
                        .setSize(sp(9))
                        .setColor(argb(accent))
                        .build()
                )
                .build()

            return Row.Builder()
                .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
                .addContent(
                    Column.Builder()
                        .setHorizontalAlignment(HORIZONTAL_ALIGN_START)
                        .addContent(labelText)
                        .addContent(valueText)
                        .build()
                )
                .addContent(Spacer.Builder().setWidth(dp(6f)).build())
                .addContent(unitText)
                .build()
        }

        private fun glucoseColor(glucose: String): Int {
            val mg = glucose.trim().split(" ")[0].toIntOrNull()
            return when {
                mg == null -> 0xFFA62A50.toInt()
                mg < 70 || mg > 180 -> 0xFFC0392B.toInt()
                mg > 140 -> 0xFFE67E22.toInt()
                else -> 0xFF27AE60.toInt()
            }
        }

        private fun sp(size: Int) =
            androidx.wear.protolayout.DimensionBuilders.sp(size.toFloat())
    }
}
