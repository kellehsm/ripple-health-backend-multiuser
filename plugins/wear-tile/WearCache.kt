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
        val insights: String,        // up to 5 titles joined with ""; empty = none
        val updatedAt: String,
        val mindStreak: Int,         // mindfulness day-streak — Breathe tile hero
        val lastLogStatus: String,   // "ok" | "fail" | "" — set by the phone after a
                                     // watch-initiated log; the Log tile renders a
                                     // green ✓ / red ✗ flash for a short window
        val lastLogStatusAt: Long,   // epoch ms — used so the tile can auto-clear
                                     // the flash once it's older than ~10s
        val wellnessScore: String,   // overall wellness score, e.g. "78" or "--"
        val stepsGoal: Int,          // user's daily step goal; 10000 if not yet pushed
        val defaultBreathPace: String, // "" = ask each time; else pace id: box/relax/coherent/energize/sigh
        val mood: String             // latest mood emoji e.g. "😊" or "--"
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
            insights      = p.getString("insights", "") ?: "",
            updatedAt     = p.getString("updatedAt", "") ?: "",
            mindStreak    = p.getInt("mindStreak", 0),
            lastLogStatus = p.getString("lastLogStatus", "") ?: "",
            lastLogStatusAt = p.getLong("lastLogStatusAt", 0L),
            wellnessScore = p.getString("wellnessScore", "--") ?: "--",
            stepsGoal = p.getInt("stepsGoal", 10000),
            defaultBreathPace = p.getString("defaultBreathPace", "") ?: "",
            mood = p.getString("mood", "--") ?: "--"
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
        insights: String? = null,
        updatedAt: String?,
        mindStreak: Int?,
        lastLogStatus: String?,
        lastLogStatusAt: Long?,
        wellnessScore: String? = null,
        stepsGoal: Int? = null,
        defaultBreathPace: String? = null,
        mood: String? = null
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
        if (insights != null)     edit.putString("insights", insights)
        if (updatedAt != null)    edit.putString("updatedAt", updatedAt)
        if (mindStreak != null)   edit.putInt("mindStreak", mindStreak)
        if (lastLogStatus != null)   edit.putString("lastLogStatus", lastLogStatus)
        if (lastLogStatusAt != null) edit.putLong("lastLogStatusAt", lastLogStatusAt)
        if (wellnessScore != null)   edit.putString("wellnessScore", wellnessScore)
        if (stepsGoal != null)       edit.putInt("stepsGoal", stepsGoal)
        if (defaultBreathPace != null) edit.putString("defaultBreathPace", defaultBreathPace)
        if (mood != null)            edit.putString("mood", mood)
        edit.apply()
    }
}
