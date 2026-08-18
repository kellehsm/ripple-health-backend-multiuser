package com.kellehs.wellness

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log
import android.widget.RemoteViews

/** 2×2 "Score Card" widget showing today's wellness score at a glance. */
class RippleScoreWidgetProvider : RippleWidgetProvider() {

    override fun siblingClass(): Class<*> = RippleWidgetProvider::class.java

    override fun buildViews(context: Context, d: WidgetData): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.ripple_widget_score)

        // Big score number
        val scoreText = if (d.wellnessScore != "--") d.wellnessScore else "--"
        views.setTextViewText(R.id.score_value, scoreText)
        views.setTextColor(R.id.score_value, scoreColor(context, d.wellnessScore))

        // Label + status
        views.setTextViewText(R.id.score_label, "WELLNESS")
        views.setTextViewText(R.id.score_status, d.status)

        // Status staleness tint
        val night = isNight(context)
        if (d.status.startsWith("Data from")) {
            views.setTextColor(R.id.score_status,
                android.graphics.Color.parseColor(if (night) "#F5B041" else "#E67E22"))
        } else {
            views.setTextColor(R.id.score_status,
                android.graphics.Color.parseColor(if (night) "#AAAAAA" else "#6E655A"))
        }

        // Whole widget tap → wellness screen
        try {
            views.setOnClickPendingIntent(R.id.score_root, deeplink(context, 22, "wellness"))
        } catch (e: Exception) { Log.w("RippleScore", "wellness link failed", e) }

        // Refresh button
        val refreshIntent = Intent(context, RippleScoreWidgetProvider::class.java).apply {
            action = ACTION_REFRESH
        }
        views.setOnClickPendingIntent(R.id.score_refresh,
            PendingIntent.getBroadcast(context, 21, refreshIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))

        return views
    }
}
