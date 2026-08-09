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
                this,
                glucose = map.getString("glucose"),
                steps = map.getString("steps"),
                water = map.getString("water"),
                updatedAt = map.getString("updatedAt")
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
