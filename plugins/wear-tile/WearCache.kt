package com.kellehs.wellness.wear

import android.content.Context

/** Latest metric values cached on the watch, populated by [WearDataListenerService]. */
object WearCache {
    const val PREFS = "RippleWearCache"

    data class Snapshot(
        val glucose: String,         // number only, e.g. "112" — no arrow embedded
        val glucoseArrow: String,    // "↗ ↘ → ⬆ ⬇" etc — empty if unknown
        val glucoseLabel: String,    // "IN RANGE" / "ELEVATED" / "HIGH" / "LOW" / "STALE 32M" / ""
        val glucoseTrend: String,    // "Rising" / "Steady" / "Falling" (raw Dexcom trend)
        val glucoseDelta: Int,       // signed mg/dL delta from previous reading (0 if unknown)
        val glucoseStale: Boolean,   // true if reading is >20 min old
        val steps: String,
        val water: String,
        val heart: String,
        val sleep: String,
        val insight: String,
        val updatedAt: String,
        val mindStreak: Int          // mindfulness day-streak — Breathe tile hero
    )

    fun read(context: Context): Snapshot {
        val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return Snapshot(
            glucose       = p.getString("glucose", "--") ?: "--",
            glucoseArrow  = p.getString("glucoseArrow", "") ?: "",
            glucoseLabel  = p.getString("glucoseLabel", "") ?: "",
            glucoseTrend  = p.getString("glucoseTrend", "") ?: "",
            glucoseDelta  = p.getInt("glucoseDelta", 0),
            glucoseStale  = p.getBoolean("glucoseStale", false),
            steps         = p.getString("steps", "--") ?: "--",
            water         = p.getString("water", "--") ?: "--",
            heart         = p.getString("heart", "--") ?: "--",
            sleep         = p.getString("sleep", "--") ?: "--",
            insight       = p.getString("insight", "") ?: "",
            updatedAt     = p.getString("updatedAt", "") ?: "",
            mindStreak    = p.getInt("mindStreak", 0)
        )
    }

    fun write(
        context: Context,
        glucose: String?,
        glucoseArrow: String?,
        glucoseLabel: String?,
        glucoseTrend: String?,
        glucoseDelta: Int?,
        glucoseStale: Boolean?,
        steps: String?,
        water: String?,
        heart: String?,
        sleep: String?,
        insight: String?,
        updatedAt: String?,
        mindStreak: Int?
    ) {
        val edit = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        if (glucose != null)      edit.putString("glucose", glucose)
        if (glucoseArrow != null) edit.putString("glucoseArrow", glucoseArrow)
        if (glucoseLabel != null) edit.putString("glucoseLabel", glucoseLabel)
        if (glucoseTrend != null) edit.putString("glucoseTrend", glucoseTrend)
        if (glucoseDelta != null) edit.putInt("glucoseDelta", glucoseDelta)
        if (glucoseStale != null) edit.putBoolean("glucoseStale", glucoseStale)
        if (steps != null)        edit.putString("steps", steps)
        if (water != null)        edit.putString("water", water)
        if (heart != null)        edit.putString("heart", heart)
        if (sleep != null)        edit.putString("sleep", sleep)
        if (insight != null)      edit.putString("insight", insight)
        if (updatedAt != null)    edit.putString("updatedAt", updatedAt)
        if (mindStreak != null)   edit.putInt("mindStreak", mindStreak)
        edit.apply()
    }
}
