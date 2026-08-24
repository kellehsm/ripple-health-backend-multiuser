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
        views.setTextViewText(R.id.widget_compact_sleep, d.sleep)
        views.setTextViewText(R.id.widget_compact_mood, d.mood)
        if (d.glucose != "--") {
            views.setTextColor(R.id.widget_glucose, glucoseColor(context, d.glucose))
        }

        views.setContentDescription(R.id.block_glucose, "Glucose ${if (d.glucose == "--") "unknown" else d.glucose}. Opens glucose screen")
        views.setContentDescription(R.id.block_steps, "Steps today ${if (d.steps == "--") "unknown" else d.steps}. Opens steps screen")
        views.setContentDescription(R.id.block_sleep_compact, "Sleep last night ${if (d.sleep == "--") "unknown" else d.sleep}. Opens sleep screen")
        views.setContentDescription(R.id.block_mood_compact, "Mood ${if (d.mood == "--") "not logged" else d.mood}. Opens wellness screen")
        views.setContentDescription(R.id.block_water, "Water ${if (d.water == "--") "0" else d.water} glasses. Opens water screen")
        views.setContentDescription(R.id.btn_water_plus, "Log one glass of water")

        fun rc(n: Int) = appWidgetId * 100 + n
        try { views.setOnClickPendingIntent(R.id.block_glucose, deeplink(context, rc(24), "glucose")) } catch (e: Exception) { Log.w("RippleCompact", "glucose link failed", e) }
        try { views.setOnClickPendingIntent(R.id.block_steps, deeplink(context, rc(25), "steps")) } catch (e: Exception) { Log.w("RippleCompact", "steps link failed", e) }
        try { views.setOnClickPendingIntent(R.id.block_sleep_compact, deeplink(context, rc(26), "sleep")) } catch (e: Exception) { Log.w("RippleCompact", "sleep link failed", e) }
        try { views.setOnClickPendingIntent(R.id.block_mood_compact, deeplink(context, rc(27), "wellness")) } catch (e: Exception) { Log.w("RippleCompact", "mood link failed", e) }
        try { views.setOnClickPendingIntent(R.id.block_water, deeplink(context, rc(23), "water")) } catch (e: Exception) { Log.w("RippleCompact", "water link failed", e) }

        val waterIntent = Intent(context, RippleCompactWidgetProvider::class.java).apply {
            action = ACTION_LOG_WATER
        }
        views.setOnClickPendingIntent(R.id.btn_water_plus,
            PendingIntent.getBroadcast(context, rc(28), waterIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))

        return views
    }
}
