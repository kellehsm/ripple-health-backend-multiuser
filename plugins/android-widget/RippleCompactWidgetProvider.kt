package com.kellehs.wellness

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.util.Log
import android.widget.RemoteViews

/** Compact 3-block widget (glucose / steps / water) sharing the main provider's fetch + cache. */
class RippleCompactWidgetProvider : RippleWidgetProvider() {

    override fun siblingClass(): Class<*> = RippleWidgetProvider::class.java

    override fun buildViews(context: Context, d: WidgetData, appWidgetId: Int): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.ripple_widget_compact)
        views.setTextViewText(R.id.widget_glucose, d.glucose)
        views.setTextViewText(R.id.widget_steps, d.steps)
        views.setTextViewText(R.id.widget_water, if (d.water != "--") d.water else "0")
        if (d.glucose != "--") {
            views.setTextColor(R.id.widget_glucose, glucoseColor(context, d.glucose))
        }

        try { views.setOnClickPendingIntent(R.id.block_glucose, deeplink(context, 24, "glucose")) } catch (e: Exception) { Log.w("RippleCompact", "glucose link failed", e) }
        try { views.setOnClickPendingIntent(R.id.block_steps, deeplink(context, 25, "steps")) } catch (e: Exception) { Log.w("RippleCompact", "steps link failed", e) }
        try { views.setOnClickPendingIntent(R.id.block_water, deeplink(context, 23, "wellness")) } catch (e: Exception) { Log.w("RippleCompact", "water link failed", e) }

        val waterIntent = Intent(context, RippleCompactWidgetProvider::class.java).apply {
            action = ACTION_LOG_WATER
        }
        views.setOnClickPendingIntent(R.id.btn_water_plus,
            PendingIntent.getBroadcast(context, 28, waterIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))

        return views
    }
}
