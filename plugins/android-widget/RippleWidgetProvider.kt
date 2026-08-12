package com.kellehs.wellness

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.app.PendingIntent
import android.net.Uri
import android.util.Log
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.URL
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import javax.net.ssl.HttpsURLConnection

open class RippleWidgetProvider : AppWidgetProvider() {

    companion object {
        private const val TAG = "RippleWidget"
        private const val API = "https://app.kels.gg/api"
        private const val AUTH_FILE = "widget_auth.json"
        private const val PREFS = "RippleWidgetPrefs"
        const val ACTION_REFRESH = "com.kellehs.wellness.WIDGET_REFRESH"
        const val ACTION_LOG_WATER = "com.kellehs.wellness.WIDGET_LOG_WATER"
        const val ACTION_NEXT_INSIGHT = "com.kellehs.wellness.WIDGET_NEXT_INSIGHT"
    }

    data class WInsight(
        val emoji: String,
        val title: String,
        val body: String
    )

    data class WidgetData(
        val glucose: String,
        val steps: String,
        val heart: String,
        val water: String,
        val sleep: String,
        val insights: List<WInsight>,
        val status: String
    )

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        when (intent.action) {
            ACTION_REFRESH -> {
                val mgr = AppWidgetManager.getInstance(context)
                val ids = mgr.getAppWidgetIds(ComponentName(context, javaClass))
                if (ids.isNotEmpty()) onUpdate(context, mgr, ids)
            }
            ACTION_LOG_WATER -> logWaterAndRefresh(context)
            ACTION_NEXT_INSIGHT -> {
                // Partial update: flip the carousel without rebuilding (or refetching) the widget
                try {
                    val mgr = AppWidgetManager.getInstance(context)
                    val ids = mgr.getAppWidgetIds(ComponentName(context, RippleWidgetProvider::class.java))
                    val rv = RemoteViews(context.packageName, R.layout.ripple_widget)
                    rv.showNext(R.id.insight_flipper)
                    for (id in ids) mgr.partiallyUpdateAppWidget(id, rv)
                } catch (e: Exception) { Log.w(TAG, "next insight failed", e) }
            }
        }
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        // Render every widget synchronously first from cache so the launcher
        // gets valid RemoteViews immediately and never shows "Can't load widget".
        for (id in appWidgetIds) {
            try {
                updateWidget(context, appWidgetManager, id, getCached(context))
            } catch (e: Exception) {
                Log.e(TAG, "onUpdate initial render failed", e)
                try {
                    updateWidget(context, appWidgetManager, id,
                        WidgetData("--", "--", "--", "--", "--", emptyList(), "Tap ↻ to refresh"))
                } catch (e2: Exception) { Log.e(TAG, "fallback render failed", e2) }
            }
        }

        // Single goAsync() shared across all widget IDs — calling it per-iteration
        // returns null on the 2nd+ call and NPEs in finally.
        val pending = goAsync()
        Thread {
            try {
                val token = readToken(context)
                // Fetch once with the enriched glucose payload so we can (1)
                // show the arrow inside the widget, and (2) push trend/label/
                // stale flags to the watch tile in the same call.
                val gluInfo: GlucoseInfo = if (token == null) GlucoseInfo(null, "--", "", "", 0, false, 0) else fetchGlucoseInfo(token)
                val data = if (token == null) {
                    WidgetData("--", "--", "--", "--", "--", emptyList(), "Sign in to app")
                } else {
                    val time = LocalTime.now().format(DateTimeFormatter.ofPattern("h:mm a"))
                    WidgetData(
                        gluInfo.display,
                        fetchSteps(token),
                        fetchHeart(token),
                        fetchWater(token),
                        fetchSleep(token),
                        fetchInsights(token) + listOfNotNull(fetchMindfulnessInsight(token)),
                        "Updated $time"
                    )
                }
                saveCache(context, data)
                for (id in appWidgetIds) {
                    updateWidget(context, appWidgetManager, id, data)
                }
                // Mirror the freshest values to any paired Wear OS device.
                // Silently no-ops if Google Play Services / wear isn't around.
                try {
                    WearDataBridge.push(
                        context = context,
                        glucose = gluInfo.mg?.toString() ?: "--",
                        steps = data.steps,
                        water = data.water,
                        heart = data.heart,
                        sleep = data.sleep,
                        insight = data.insights.firstOrNull()?.title ?: "",
                        glucoseArrow = gluInfo.arrow,
                        glucoseLabel = gluInfo.label(),
                        glucoseTrend = gluInfo.trend,
                        glucoseDelta = gluInfo.delta,
                        glucoseStale = gluInfo.isStale
                    )
                } catch (_: Throwable) {}
            } catch (e: Exception) {
                Log.e(TAG, "fetch error", e)
                val cached = getCached(context).copy(status = "Tap ↻ to retry")
                for (id in appWidgetIds) {
                    updateWidget(context, appWidgetManager, id, cached)
                }
            } finally {
                try { pending?.finish() } catch (_: Exception) {}
            }
        }.start()
    }

    /** Logs one glass of water directly from the widget, then refreshes the count. */
    private fun logWaterAndRefresh(context: Context) {
        val pending = goAsync()
        Thread {
            try {
                val mgr = AppWidgetManager.getInstance(context)
                val ids = mgr.getAppWidgetIds(ComponentName(context, javaClass))
                val token = readToken(context)
                if (token == null) {
                    val d = getCached(context).copy(status = "Sign in to app")
                    for (id in ids) updateWidget(context, mgr, id, d)
                } else {
                    val ok = postWaterLog(token)
                    val water = fetchWater(token)
                    val time = LocalTime.now().format(DateTimeFormatter.ofPattern("h:mm a"))
                    val status = if (ok) "Water logged ✓ $time" else "Log failed — retry"
                    val d = getCached(context).copy(water = water, status = status)
                    saveCache(context, d)
                    for (id in ids) updateWidget(context, mgr, id, d)
                    // Nudge the other widget style so its water count stays in sync
                    try {
                        context.sendBroadcast(Intent(context, siblingClass()).setAction(ACTION_REFRESH))
                    } catch (_: Exception) {}
                    try {
                        // Water-log refresh — strip the arrow from the cached
                        // display string so the tile's separate arrow slot
                        // isn't rendered twice. Trend/label/stale come from
                        // the next full refresh; leaving them at defaults
                        // preserves the previous cached state on the watch.
                        val gluOnly = d.glucose.split(" ").firstOrNull() ?: d.glucose
                        WearDataBridge.push(
                            context = context,
                            glucose = gluOnly,
                            steps = d.steps,
                            water = d.water,
                            heart = d.heart,
                            sleep = d.sleep,
                            insight = d.insights.firstOrNull()?.title ?: ""
                        )
                    } catch (_: Throwable) {}
                }
            } catch (e: Exception) {
                Log.e(TAG, "logWater error", e)
            } finally {
                try { pending?.finish() } catch (_: Exception) {}
            }
        }.start()
    }

    protected open fun siblingClass(): Class<*> = RippleCompactWidgetProvider::class.java

    private fun getCached(context: Context): WidgetData {
        val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val insights = try {
            val arr = JSONArray(p.getString("insights", "[]") ?: "[]")
            (0 until arr.length()).mapNotNull {
                val o = arr.optJSONObject(it) ?: return@mapNotNull null
                WInsight(o.optString("e", "💡"), o.optString("t", ""), o.optString("b", ""))
            }.filter { it.title.isNotEmpty() }
        } catch (_: Exception) { emptyList<WInsight>() }
        return WidgetData(
            p.getString("glucose", "--") ?: "--",
            p.getString("steps", "--") ?: "--",
            p.getString("heart", "--") ?: "--",
            p.getString("water", "--") ?: "--",
            p.getString("sleep", "--") ?: "--",
            insights,
            p.getString("status", "Tap ↻ to refresh") ?: "Tap ↻ to refresh"
        )
    }

    private fun saveCache(context: Context, d: WidgetData) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("glucose", d.glucose)
            .putString("steps", d.steps)
            .putString("heart", d.heart)
            .putString("water", d.water)
            .putString("sleep", d.sleep)
            .putString("insights", JSONArray(d.insights.map {
                JSONObject().put("e", it.emoji).put("t", it.title).put("b", it.body)
            }).toString())
            .putString("status", d.status)
            .apply()
    }

    private fun updateWidget(context: Context, manager: AppWidgetManager, id: Int, d: WidgetData) {
        try {
            manager.updateAppWidget(id, buildViews(context, d))
        } catch (e: Exception) {
            Log.e(TAG, "updateWidget failed", e)
        }
    }

    protected fun isNight(context: Context): Boolean =
        (context.resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) ==
            android.content.res.Configuration.UI_MODE_NIGHT_YES

    protected fun glucoseColor(context: Context, glucose: String): Int {
        val mg = glucose.trim().split(" ")[0].toIntOrNull()
        // Night palette is brighter so it reads on the dark berry chip
        val night = isNight(context)
        return when {
            mg == null -> android.graphics.Color.parseColor(if (night) "#F0A6BB" else "#A62A50")
            mg < 70 || mg > 180 -> android.graphics.Color.parseColor(if (night) "#FF6B6B" else "#C0392B")
            mg > 140 -> android.graphics.Color.parseColor(if (night) "#F5B041" else "#E67E22")
            else -> android.graphics.Color.parseColor(if (night) "#58D68D" else "#27AE60")
        }
    }

    protected fun deeplink(context: Context, requestCode: Int, path: String): PendingIntent {
        val i = Intent(Intent.ACTION_VIEW, Uri.parse("ripple://$path")).apply {
            setPackage(context.packageName)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        return PendingIntent.getActivity(context, requestCode, i,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    protected open fun buildViews(context: Context, d: WidgetData): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.ripple_widget)
        views.setTextViewText(R.id.widget_glucose, d.glucose)
        views.setTextViewText(R.id.widget_steps, d.steps)
        views.setTextViewText(R.id.widget_heart, d.heart)
        views.setTextViewText(R.id.widget_water, if (d.water != "--") d.water else "0")
        views.setTextViewText(R.id.widget_sleep, d.sleep)
        views.setTextViewText(R.id.widget_status, d.status)

        // Insight carousel: the ViewFlipper auto-advances through one child per insight
        views.removeAllViews(R.id.insight_flipper)
        val insights = d.insights.ifEmpty {
            listOf(WInsight("💡", "Log a few days of data to unlock insights", ""))
        }
        for ((i, ins) in insights.withIndex()) {
            val item = RemoteViews(context.packageName, R.layout.ripple_widget_insight_item)
            item.setTextViewText(R.id.insight_item_emoji, ins.emoji)
            item.setTextViewText(R.id.insight_item_text, ins.title)
            if (ins.body.isNotEmpty()) {
                item.setTextViewText(R.id.insight_item_body, ins.body)
                item.setViewVisibility(R.id.insight_item_body, android.view.View.VISIBLE)
            } else {
                item.setViewVisibility(R.id.insight_item_body, android.view.View.GONE)
            }
            if (insights.size > 1) {
                item.setTextViewText(R.id.insight_item_counter, "${i + 1}/${insights.size}")
                item.setViewVisibility(R.id.insight_item_counter, android.view.View.VISIBLE)
            } else {
                item.setViewVisibility(R.id.insight_item_counter, android.view.View.GONE)
            }
            views.addView(R.id.insight_flipper, item)
        }
        // Dynamic glucose color: green in-range, amber slightly elevated, red out of range
        if (d.glucose != "--") {
            views.setTextColor(R.id.widget_glucose, glucoseColor(context, d.glucose))
        }

        // Block taps → respective pages
        try { views.setOnClickPendingIntent(R.id.block_glucose, deeplink(context, 4, "glucose")) } catch (e: Exception) { Log.w(TAG, "glucose link failed", e) }
        try { views.setOnClickPendingIntent(R.id.block_steps, deeplink(context, 5, "steps")) } catch (e: Exception) { Log.w(TAG, "steps link failed", e) }
        try { views.setOnClickPendingIntent(R.id.block_heart, deeplink(context, 6, "heartrate")) } catch (e: Exception) { Log.w(TAG, "heart link failed", e) }
        try { views.setOnClickPendingIntent(R.id.block_water, deeplink(context, 3, "wellness")) } catch (e: Exception) { Log.w(TAG, "water link failed", e) }
        try { views.setOnClickPendingIntent(R.id.block_sleep, deeplink(context, 10, "sleep")) } catch (e: Exception) { Log.w(TAG, "sleep link failed", e) }
        try { views.setOnClickPendingIntent(R.id.block_meal, deeplink(context, 1, "meals")) } catch (e: Exception) { Log.w(TAG, "meal link failed", e) }
        try { views.setOnClickPendingIntent(R.id.block_insight, deeplink(context, 7, "insights")) } catch (e: Exception) { Log.w(TAG, "insight link failed", e) }

        // Water "+" → log one glass directly (no app open)
        val waterIntent = Intent(context, RippleWidgetProvider::class.java).apply {
            action = ACTION_LOG_WATER
        }
        views.setOnClickPendingIntent(R.id.btn_water_plus,
            PendingIntent.getBroadcast(context, 8, waterIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))

        // Insight "›" → advance the carousel manually
        val nextIntent = Intent(context, RippleWidgetProvider::class.java).apply {
            action = ACTION_NEXT_INSIGHT
        }
        views.setOnClickPendingIntent(R.id.btn_insight_next,
            PendingIntent.getBroadcast(context, 12, nextIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))

        // Refresh button
        val refreshIntent = Intent(context, RippleWidgetProvider::class.java).apply {
            action = ACTION_REFRESH
        }
        views.setOnClickPendingIntent(R.id.btn_refresh,
            PendingIntent.getBroadcast(context, 99, refreshIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))

        return views
    }

    // ─── Network ──────────────────────────────────────────────────────────────

    private fun get(token: String, path: String): Pair<Int, String> {
        val conn = URL("$API$path").openConnection() as HttpsURLConnection
        conn.connectTimeout = 3000
        conn.readTimeout = 3000
        conn.setRequestProperty("Authorization", "Bearer $token")
        val code = conn.responseCode
        val body = if (code in 200..299) conn.inputStream.bufferedReader().readText() else ""
        conn.disconnect()
        return Pair(code, body)
    }

    private fun post(token: String, path: String, json: String): Int {
        val conn = URL("$API$path").openConnection() as HttpsURLConnection
        conn.connectTimeout = 4000
        conn.readTimeout = 4000
        conn.requestMethod = "POST"
        conn.doOutput = true
        conn.setRequestProperty("Authorization", "Bearer $token")
        conn.setRequestProperty("Content-Type", "application/json")
        conn.outputStream.bufferedWriter().use { it.write(json) }
        val code = conn.responseCode
        conn.disconnect()
        return code
    }

    private fun readToken(context: Context): String? {
        // Primary path: Expo FileSystem.documentDirectory → filesDir
        try {
            val f = File(context.filesDir, AUTH_FILE)
            if (f.exists()) {
                val token = JSONObject(f.readText()).optString("token")
                if (token.isNotEmpty()) return token
            }
        } catch (e: Exception) { Log.w(TAG, "readToken filesDir failed", e) }

        // Fallback: SharedPreferences (set by future native module)
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString("auth_token", null)?.takeIf { it.isNotEmpty() }
    }

    /** Structured glucose payload used to enrich the Wear tile (arrow, label, trend, stale). */
    data class GlucoseInfo(
        val mg: Int?,           // null when unknown
        val display: String,    // widget display string (already includes arrow when present)
        val arrow: String,
        val trend: String,      // raw Dexcom trend (Rising / SingleUp / etc.)
        val delta: Int,         // signed mg/dL from previous reading (0 if unknown)
        val isStale: Boolean,
        val minutesSince: Int   // 0 if unknown; used to build "STALE 32M" label
    ) {
        /** Label for the tile: "IN RANGE" / "ELEVATED" / "HIGH" / "LOW" / "RISING HIGH" /
         *  "DROPPING" / "STALE 32M" — mirrors WatchTilesScreen's glucoseState(). */
        fun label(): String {
            if (mg == null) return ""
            if (isStale) return if (minutesSince > 0) "STALE ${minutesSince}M" else "STALE"
            val rising = trend.contains("Up", ignoreCase = true) || delta >= 10
            val falling = trend.contains("Down", ignoreCase = true) || delta <= -10
            return when {
                mg < 70            -> if (falling) "LOW & FALLING" else "LOW"
                mg > 180           -> if (rising) "HIGH & RISING" else "HIGH"
                mg > 140 && rising -> "RISING HIGH"
                mg < 80 && falling -> "DROPPING"
                mg > 140           -> "ELEVATED"
                else               -> "IN RANGE"
            }
        }
    }

    private fun fetchGlucoseInfo(token: String): GlucoseInfo {
        return try {
            val (code, body) = get(token, "/glucose/status")
            if (code == 401 || code == 403) return GlucoseInfo(null, "Sign in", "", "", 0, false, 0)
            if (code != 200) return GlucoseInfo(null, "--", "", "", 0, false, 0)
            val obj = JSONObject(body)
            if (!obj.optBoolean("hasData", false)) return GlucoseInfo(null, "--", "", "", 0, false, 0)
            val mg = obj.optInt("mg_dl", 0)
            val arrow = obj.optString("arrow", "").trim()
            val trend = obj.optString("trend", "").trim()
            val delta = obj.optInt("delta", 0)
            val isStale = obj.optBoolean("isStale", false)
            val mins = obj.optInt("minutesSinceReading", 0)
            val display = if (arrow.isNotEmpty()) "$mg $arrow" else "$mg"
            GlucoseInfo(mg, display, arrow, trend, delta, isStale, mins)
        } catch (e: Exception) {
            Log.w(TAG, "fetchGlucose: ${e.message}")
            GlucoseInfo(null, "--", "", "", 0, false, 0)
        }
    }

    private fun fetchGlucose(token: String): String = fetchGlucoseInfo(token).display

    private fun fetchSteps(token: String): String {
        return try {
            val today = LocalDate.now().toString()
            val (code, body) = get(token, "/health-connect/steps?date=$today")
            if (code == 200) {
                val count = JSONObject(body).optInt("steps", 0)
                if (count > 0) NumberFormat.getNumberInstance().format(count) else "--"
            } else "--"
        } catch (e: Exception) {
            Log.w(TAG, "fetchSteps: ${e.message}")
            "--"
        }
    }

    private fun fetchHeart(token: String): String {
        return try {
            val (code, body) = get(token, "/heart-rate")
            if (code == 200) {
                val arr = JSONArray(body)
                if (arr.length() > 0) {
                    val bpm = arr.getJSONObject(0).optInt("bpm", 0)
                    if (bpm > 0) "$bpm" else "--"
                } else "--"
            } else "--"
        } catch (e: Exception) {
            Log.w(TAG, "fetchHeart: ${e.message}")
            "--"
        }
    }

    private fun fetchSleep(token: String): String {
        // /sleep/stats returns yesterday_seconds — a single-number "last night" duration
        return try {
            val (code, body) = get(token, "/sleep/stats")
            if (code == 200) {
                val secs = JSONObject(body).optDouble("yesterday_seconds", 0.0).toLong()
                if (secs <= 0) "--" else {
                    val h = secs / 3600
                    val m = (secs % 3600) / 60
                    if (h > 0) "${h}h ${m}m" else "${m}m"
                }
            } else "--"
        } catch (e: Exception) {
            Log.w(TAG, "fetchSleep: ${e.message}")
            "--"
        }
    }

    private fun fetchWater(token: String): String {
        return try {
            val (code, body) = get(token, "/metrics/water/today")
            if (code == 200) {
                val obj = JSONObject(body)
                "${obj.optInt("count", 0)}/${obj.optInt("goal", 8)}"
            } else "--"
        } catch (e: Exception) {
            Log.w(TAG, "fetchWater: ${e.message}")
            "--"
        }
    }

    private fun insightEmoji(type: String): String = when (type) {
        "sleep" -> "🌙"
        "glucose" -> "🩸"
        "activity" -> "🚶"
        "water" -> "💧"
        "mood" -> "😊"
        "books" -> "📚"
        "hobbies" -> "🎨"
        "spending" -> "💰"
        "streak" -> "🔥"
        "mindfulness" -> "🧘"
        else -> "💡"
    }

    /** Top-ranked active insights (up to 5) with category emoji + description, or empty when none. */
    private fun fetchInsights(token: String): List<WInsight> {
        return try {
            val (code, body) = get(token, "/insights")
            if (code == 200) {
                val arr = JSONArray(body)
                (0 until minOf(arr.length(), 5))
                    .map { arr.getJSONObject(it) }
                    .map {
                        WInsight(
                            insightEmoji(it.optString("type", "")),
                            it.optString("title", ""),
                            it.optString("description", "")
                        )
                    }
                    .filter { it.title.isNotEmpty() }
            } else emptyList()
        } catch (e: Exception) {
            Log.w(TAG, "fetchInsights: ${e.message}")
            emptyList()
        }
    }

    /** Mindfulness streak card for the insight carousel, or null when there's no streak. */
    private fun fetchMindfulnessInsight(token: String): WInsight? {
        return try {
            val (code, body) = get(token, "/mindfulness/stats")
            if (code != 200) return null
            val obj = JSONObject(body)
            val streak = obj.optInt("streak", 0)
            if (streak < 1) return null
            val practicedToday = obj.optBoolean("practiced_today", false)
            val title = if (streak == 1) "1-day mindfulness streak" else "$streak-day mindfulness streak"
            val bodyText = if (practicedToday) "Practiced today — keep it rolling" else "Practice today to keep it going"
            WInsight("🧘", title, bodyText)
        } catch (e: Exception) {
            Log.w(TAG, "fetchMindfulnessInsight: ${e.message}")
            null
        }
    }

    /** Mirrors the app's getOrCreateWaterMetric + logWater client calls. */
    private fun postWaterLog(token: String): Boolean {
        return try {
            val (code, body) = get(token, "/metrics?name=water")
            var metricId: String? = null
            if (code == 200) {
                val arr = JSONArray(body)
                if (arr.length() > 0) metricId = arr.getJSONObject(0).optString("id")
            }
            if (metricId.isNullOrEmpty()) {
                // Create the water metric the same way the app does
                val createConn = URL("$API/metrics").openConnection() as HttpsURLConnection
                createConn.connectTimeout = 4000
                createConn.readTimeout = 4000
                createConn.requestMethod = "POST"
                createConn.doOutput = true
                createConn.setRequestProperty("Authorization", "Bearer $token")
                createConn.setRequestProperty("Content-Type", "application/json")
                createConn.outputStream.bufferedWriter().use {
                    it.write("""{"name":"water","value_type":"number","unit":"glasses","icon":"water","color_key":"blue"}""")
                }
                if (createConn.responseCode in 200..299) {
                    metricId = JSONObject(createConn.inputStream.bufferedReader().readText()).optString("id")
                }
                createConn.disconnect()
            }
            if (metricId.isNullOrEmpty()) return false
            val payload = """{"value":1,"logged_at":"${Instant.now()}"}"""
            post(token, "/metrics/$metricId/logs", payload) in 200..299
        } catch (e: Exception) {
            Log.w(TAG, "postWaterLog: ${e.message}")
            false
        }
    }
}
