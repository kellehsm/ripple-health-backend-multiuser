package com.kellehs.wellness

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log
import android.widget.RemoteViews

/** 2×2 "Score Card" widget showing today's wellness score at a glance.
 *  Each onUpdate call rotates the big stat: score → steps → glucose. */
class RippleScoreWidgetProvider : RippleWidgetProvider() {

    companion object {
        private const val ROTATION_KEY = "score_widget_rotation"
    }

    override fun siblingClass(): Class<*> = RippleWidgetProvider::class.java

    override fun onReceive(context: Context, intent: Intent) {
        // Tap the big number to advance the stat: score → steps → glucose.
        // (System onUpdate no longer rotates — that drifted unpredictably.)
        if (intent.action == ACTION_NEXT_STAT) {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            prefs.edit().putInt(ROTATION_KEY, (prefs.getInt(ROTATION_KEY, 0) + 1) % 3).apply()
            try {
                val mgr = AppWidgetManager.getInstance(context)
                val ids = mgr.getAppWidgetIds(ComponentName(context, javaClass))
                for (id in ids) mgr.updateAppWidget(id, buildViews(context, getCached(context), id))
            } catch (e: Exception) { Log.w("RippleScore", "next stat failed", e) }
            return
        }
        super.onReceive(context, intent)
    }

    override fun buildViews(context: Context, d: WidgetData, appWidgetId: Int): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.ripple_widget_score)
        val night = isNight(context)
        val accents = readThemeAccents(context)

        // Determine which stat to show based on rotation
        val rotation = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getInt(ROTATION_KEY, 0)

        val (valueText, labelText, valueColor) = when (rotation % 3) {
            1 -> { // Steps
                val stepsColor = if (night)
                    android.graphics.Color.parseColor("#7FD4DA")
                else
                    accents.teal
                Triple(if (d.steps != "--") d.steps else "--", "STEPS", stepsColor)
            }
            2 -> { // Glucose
                Triple(
                    if (d.glucose != "--") d.glucose.split(" ")[0] else "--",
                    "GLUCOSE",
                    glucoseColor(context, d.glucose)
                )
            }
            else -> { // Score (0)
                Triple(
                    if (d.wellnessScore != "--") d.wellnessScore else "--",
                    "WELLNESS",
                    scoreColor(context, d.wellnessScore)
                )
            }
        }

        views.setTextViewText(R.id.score_value, valueText)
        views.setTextColor(R.id.score_value, valueColor)
        views.setTextViewText(R.id.score_label, labelText)

        // Status + staleness tint
        views.setTextViewText(R.id.score_status, d.status)
        if (d.status.startsWith("Data from")) {
            views.setTextColor(R.id.score_status,
                android.graphics.Color.parseColor(if (night) "#F5B041" else "#E67E22"))
        } else {
            views.setTextColor(R.id.score_status,
                android.graphics.Color.parseColor(if (night) "#AAAAAA" else "#6E655A"))
        }

        views.setContentDescription(R.id.score_value, "$labelText $valueText. Tap for next stat")

        // Whole widget tap → wellness screen
        try {
            views.setOnClickPendingIntent(R.id.score_root, deeplink(context, appWidgetId * 100 + 22, "wellness"))
        } catch (e: Exception) { Log.w("RippleScore", "wellness link failed", e) }

        // Big number tap → advance rotation
        val nextStatIntent = Intent(context, RippleScoreWidgetProvider::class.java).apply {
            action = ACTION_NEXT_STAT
        }
        views.setOnClickPendingIntent(R.id.score_value,
            PendingIntent.getBroadcast(context, appWidgetId * 100 + 23, nextStatIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))

        // Refresh button
        val refreshIntent = Intent(context, RippleScoreWidgetProvider::class.java).apply {
            action = ACTION_REFRESH
        }
        views.setOnClickPendingIntent(R.id.score_refresh,
            PendingIntent.getBroadcast(context, appWidgetId * 100 + 21, refreshIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))

        return views
    }
}
