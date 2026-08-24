package com.kellehs.wellness.wear

import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
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
            val newLabel = map.getString("glucoseLabel") ?: ""
            val newStale = if (map.containsKey("glucoseStale")) map.getBoolean("glucoseStale") else null

            WearCache.write(
                context      = this,
                glucose      = map.getString("glucose"),
                glucoseArrow = map.getString("glucoseArrow"),
                glucoseLabel = map.getString("glucoseLabel"),
                glucoseTrend = map.getString("glucoseTrend"),
                glucoseDelta = if (map.containsKey("glucoseDelta")) map.getInt("glucoseDelta") else null,
                glucoseStale = newStale,
                steps        = map.getString("steps"),
                water        = map.getString("water"),
                heart        = map.getString("heart"),
                sleep        = map.getString("sleep"),
                insight      = map.getString("insight"),
                insights     = map.getString("insights"),
                updatedAt    = map.getString("updatedAt"),
                mindStreak   = if (map.containsKey("mindStreak")) map.getInt("mindStreak") else null,
                lastLogStatus   = map.getString("lastLogStatus"),
                lastLogStatusAt = if (map.containsKey("lastLogStatusAt")) map.getLong("lastLogStatusAt") else null,
                wellnessScore   = map.getString("wellnessScore"),
                stepsGoal       = if (map.containsKey("stepsGoal")) map.getInt("stepsGoal") else null,
                defaultBreathPace = map.getString("defaultBreathPace"),
                mood            = map.getString("mood")
            )

            // Item 1: urgent glucose haptic — buzz on HIGH/LOW when not stale
            val isStale = newStale ?: false
            val upperLabel = newLabel.uppercase()
            val isUrgent = !isStale && (upperLabel.contains("HIGH") || upperLabel.contains("LOW"))
            if (isUrgent) maybeFireUrgentHaptic(newLabel)

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

    /**
     * Fires a distinct double-buzz for urgent glucose (HIGH or LOW).
     * Debounced: won't repeat for the same label within 15 minutes.
     */
    private fun maybeFireUrgentHaptic(label: String) {
        val prefs = getSharedPreferences(WearCache.PREFS, Context.MODE_PRIVATE)
        val lastLabel = prefs.getString("urgentHapticLabel", "") ?: ""
        val lastAt = prefs.getLong("urgentHapticAt", 0L)
        val now = System.currentTimeMillis()
        val debounceMs = 15 * 60 * 1000L
        if (label == lastLabel && (now - lastAt) < debounceMs) return

        prefs.edit()
            .putString("urgentHapticLabel", label)
            .putLong("urgentHapticAt", now)
            .apply()

        try {
            val vibrator: Vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }
            // Distinct pattern: two strong pulses separated by a gap — different from breathing ticks
            val effect = VibrationEffect.createWaveform(longArrayOf(0, 200, 100, 200), -1)
            vibrator.vibrate(effect)
        } catch (e: Exception) {
            Log.w("RippleWear", "urgentHaptic failed", e)
        }
    }
}
