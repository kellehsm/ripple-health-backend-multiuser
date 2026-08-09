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
    }

    data class WidgetData(
        val glucose: String,
        val steps: String,
        val heart: String,
        val water: String,
        val insights: List<String>,
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
                        WidgetData("--", "--", "--", "--", emptyList(), "Tap ↻ to refresh"))
                } catch (e2: Exception) { Log.e(TAG, "fallback render failed", e2) }
            }
        }

        // Single goAsync() shared across all widget IDs — calling it per-iteration
        // returns null on the 2nd+ call and NPEs in finally.
        val pending = goAsync()
        Thread {
            try {
                val token = readToken(context)
                val data = if (token == null) {
                    WidgetData("--", "--", "--", "--", emptyList(), "Sign in to app")
                } else {
                    val time = LocalTime.now().format(DateTimeFormatter.ofPattern("h:mm a"))
                    WidgetData(
                        fetchGlucose(token),
                        fetchSteps(token),
                        fetchHeart(token),
                        fetchWater(token),
                        fetchInsights(token),
                        "Updated $time"
                    )
                }
                saveCache(context, data)
                for (id in appWidgetIds) {
                    updateWidget(context, appWidgetManager, id, data)
                }
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
            (0 until arr.length()).map { arr.getString(it) }
        } catch (_: Exception) { emptyList() }
        return WidgetData(
            p.getString("glucose", "--") ?: "--",
            p.getString("steps", "--") ?: "--",
            p.getString("heart", "--") ?: "--",
            p.getString("water", "--") ?: "--",
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
            .putString("insights", JSONArray(d.insights).toString())
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

    protected fun glucoseColor(glucose: String): Int {
        val mg = glucose.trim().split(" ")[0].toIntOrNull()
        return when {
            mg == null -> android.graphics.Color.parseColor("#A62A50")
            mg < 70 || mg > 180 -> android.graphics.Color.parseColor("#C0392B")
            mg > 140 -> android.graphics.Color.parseColor("#E67E22")
            else -> android.graphics.Color.parseColor("#27AE60")
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
        views.setTextViewText(R.id.widget_status, d.status)

        // Insight carousel: the ViewFlipper auto-advances through one child per insight
        views.removeAllViews(R.id.insight_flipper)
        val titles = d.insights.ifEmpty { listOf("Log a few days of data to unlock insights") }
        for (title in titles) {
            val item = RemoteViews(context.packageName, R.layout.ripple_widget_insight_item)
            item.setTextViewText(R.id.insight_item_text, title)
            views.addView(R.id.insight_flipper, item)
        }
        // Dynamic glucose color: green in-range, amber slightly elevated, red out of range
        if (d.glucose != "--") {
            views.setTextColor(R.id.widget_glucose, glucoseColor(d.glucose))
        }

        // Block taps → respective pages
        try { views.setOnClickPendingIntent(R.id.block_glucose, deeplink(context, 4, "health")) } catch (e: Exception) { Log.w(TAG, "glucose link failed", e) }
        try { views.setOnClickPendingIntent(R.id.block_steps, deeplink(context, 5, "steps")) } catch (e: Exception) { Log.w(TAG, "steps link failed", e) }
        try { views.setOnClickPendingIntent(R.id.block_heart, deeplink(context, 6, "heartrate")) } catch (e: Exception) { Log.w(TAG, "heart link failed", e) }
        try { views.setOnClickPendingIntent(R.id.block_water, deeplink(context, 3, "health")) } catch (e: Exception) { Log.w(TAG, "water link failed", e) }
        try { views.setOnClickPendingIntent(R.id.block_meal, deeplink(context, 1, "meals")) } catch (e: Exception) { Log.w(TAG, "meal link failed", e) }
        try { views.setOnClickPendingIntent(R.id.block_insight, deeplink(context, 7, "insights")) } catch (e: Exception) { Log.w(TAG, "insight link failed", e) }

        // Water "+" → log one glass directly (no app open)
        val waterIntent = Intent(context, RippleWidgetProvider::class.java).apply {
            action = ACTION_LOG_WATER
        }
        views.setOnClickPendingIntent(R.id.btn_water_plus,
            PendingIntent.getBroadcast(context, 8, waterIntent,
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

    private fun fetchGlucose(token: String): String {
        return try {
            val (code, body) = get(token, "/glucose/status")
            if (code == 401 || code == 403) return "Sign in"
            if (code == 200) {
                val obj = JSONObject(body)
                if (obj.optBoolean("hasData", false)) {
                    val mg = obj.optInt("mg_dl", 0)
                    val arrow = obj.optString("arrow", "").trim()
                    if (arrow.isNotEmpty()) "$mg $arrow" else "$mg"
                } else "--"
            } else "--"
        } catch (e: Exception) {
            Log.w(TAG, "fetchGlucose: ${e.message}")
            "--"
        }
    }

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

    /** Top-ranked active insight titles (up to 5), or empty when none. */
    private fun fetchInsights(token: String): List<String> {
        return try {
            val (code, body) = get(token, "/insights")
            if (code == 200) {
                val arr = JSONArray(body)
                (0 until minOf(arr.length(), 5))
                    .map { arr.getJSONObject(it).optString("title", "") }
                    .filter { it.isNotEmpty() }
            } else emptyList()
        } catch (e: Exception) {
            Log.w(TAG, "fetchInsights: ${e.message}")
            emptyList()
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
