package com.kellehs.wellness.wear

import android.content.ComponentName
import android.util.Log
import androidx.wear.tiles.TileService
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.WearableListenerService

/**
 * Listens for DataItems pushed from the phone on the /ripple/metrics path,
 * writes them into the watch-side cache, and asks the tile to redraw.
 */
class WearDataListenerService : WearableListenerService() {

    override fun onDataChanged(dataEvents: DataEventBuffer) {
        var updated = false
        for (event in dataEvents) {
            if (event.type != DataEvent.TYPE_CHANGED) continue
            val item = event.dataItem
            if (item.uri.path != "/ripple/metrics") continue
            val map = DataMapItem.fromDataItem(item).dataMap
            WearCache.write(
                context      = this,
                glucose      = map.getString("glucose"),
                glucoseArrow = map.getString("glucoseArrow"),
                glucoseLabel = map.getString("glucoseLabel"),
                glucoseTrend = map.getString("glucoseTrend"),
                glucoseDelta = if (map.containsKey("glucoseDelta")) map.getInt("glucoseDelta") else null,
                glucoseStale = if (map.containsKey("glucoseStale")) map.getBoolean("glucoseStale") else null,
                steps        = map.getString("steps"),
                water        = map.getString("water"),
                heart        = map.getString("heart"),
                sleep        = map.getString("sleep"),
                insight      = map.getString("insight"),
                updatedAt    = map.getString("updatedAt"),
                mindStreak   = if (map.containsKey("mindStreak")) map.getInt("mindStreak") else null,
                lastLogStatus   = map.getString("lastLogStatus"),
                lastLogStatusAt = if (map.containsKey("lastLogStatusAt")) map.getLong("lastLogStatusAt") else null
            )
            updated = true
        }
        if (updated) {
            try {
                TileService.getUpdater(this).requestUpdate(RippleWearTileService::class.java)
            } catch (e: Exception) {
                Log.w("RippleWear", "tile update request failed", e)
            }
            // Suppress lint about unused ComponentName import
            ComponentName(this, RippleWearTileService::class.java)
        }
    }
}
