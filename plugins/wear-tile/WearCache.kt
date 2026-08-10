package com.kellehs.wellness.wear

import android.content.Context

/** Latest metric values cached on the watch, populated by [WearDataListenerService]. */
object WearCache {
    const val PREFS = "RippleWearCache"

    data class Snapshot(
        val glucose: String,
        val steps: String,
        val water: String,
        val heart: String,
        val sleep: String,
        val insight: String,
        val updatedAt: String
    )

    fun read(context: Context): Snapshot {
        val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return Snapshot(
            p.getString("glucose", "--") ?: "--",
            p.getString("steps", "--") ?: "--",
            p.getString("water", "--") ?: "--",
            p.getString("heart", "--") ?: "--",
            p.getString("sleep", "--") ?: "--",
            p.getString("insight", "") ?: "",
            p.getString("updatedAt", "") ?: ""
        )
    }

    fun write(
        context: Context,
        glucose: String?,
        steps: String?,
        water: String?,
        heart: String?,
        sleep: String?,
        insight: String?,
        updatedAt: String?
    ) {
        val edit = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        if (glucose != null) edit.putString("glucose", glucose)
        if (steps != null) edit.putString("steps", steps)
        if (water != null) edit.putString("water", water)
        if (heart != null) edit.putString("heart", heart)
        if (sleep != null) edit.putString("sleep", sleep)
        if (insight != null) edit.putString("insight", insight)
        if (updatedAt != null) edit.putString("updatedAt", updatedAt)
        edit.apply()
    }
}
