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
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import javax.net.ssl.HttpsURLConnection

class RippleWidgetProvider : AppWidgetProvider() {

    companion object {
        private const val TAG = "RippleWidget"
        private const val API = "https://app.kels.gg/api"
        private const val AUTH_FILE = "widget_auth.json"
        private const val PREFS = "RippleWidgetPrefs"
        const val ACTION_REFRESH = "com.kellehs.wellness.WIDGET_REFRESH"
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH) {
            val mgr = AppWidgetManager.getInstance(context)
            val ids = mgr.getAppWidgetIds(ComponentName(context, RippleWidgetProvider::class.java))
            if (ids.isNotEmpty()) onUpdate(context, mgr, ids)
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
                val (cSteps, cMood, cGlucose) = getCached(context)
                val cachedStatus = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .getString("status", "Tap ↻ to refresh") ?: "Tap ↻ to refresh"
                updateWidget(context, appWidgetManager, id, cGlucose, cSteps, cMood, cachedStatus)
            } catch (e: Exception) {
                Log.e(TAG, "onUpdate initial render failed", e)
                try {
                    updateWidget(context, appWidgetManager, id, "--", "--", "--", "Tap ↻ to refresh")
                } catch (e2: Exception) { Log.e(TAG, "fallback render failed", e2) }
            }
        }

        // Single goAsync() shared across all widget IDs — calling it per-iteration
        // returns null on the 2nd+ call and NPEs in finally.
        val pending = goAsync()
        Thread {
            try {
                val token = readToken(context)
                if (token == null) {
                    val s = "Sign in to app"
                    saveCache(context, "--", "--", "--", s)
                    for (id in appWidgetIds) {
                        updateWidget(context, appWidgetManager, id, "--", "--", "--", s)
                    }
                } else {
                    val glucose = fetchGlucose(token)
                    val steps = fetchSteps(token)
                    val mood = fetchMood(token)
                    val time = LocalTime.now()
                        .format(DateTimeFormatter.ofPattern("h:mm a"))
                    val s = "Updated $time"
                    saveCache(context, glucose, steps, mood, s)
                    for (id in appWidgetIds) {
                        updateWidget(context, appWidgetManager, id, glucose, steps, mood, s)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "fetch error", e)
                val (cs, cm, cg) = getCached(context)
                for (id in appWidgetIds) {
                    updateWidget(context, appWidgetManager, id, cg, cs, cm, "Tap ↻ to retry")
                }
            } finally {
                try { pending?.finish() } catch (_: Exception) {}
            }
        }.start()
    }

    data class CachedData(val steps: String, val mood: String, val glucose: String)

    private fun getCached(context: Context): CachedData {
        val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return CachedData(
            p.getString("steps", "--") ?: "--",
            p.getString("mood", "--") ?: "--",
            p.getString("glucose", "--") ?: "--"
        )
    }

    private fun saveCache(context: Context, glucose: String, steps: String, mood: String, status: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("glucose", glucose)
            .putString("steps", steps)
            .putString("mood", mood)
            .putString("status", status)
            .apply()
    }

    private fun updateWidget(
        context: Context,
        manager: AppWidgetManager,
        id: Int,
        glucose: String,
        steps: String,
        mood: String,
        status: String
    ) {
        try {
            val views = buildViews(context, glucose, steps, mood, status)
            manager.updateAppWidget(id, views)
        } catch (e: Exception) {
            Log.e(TAG, "updateWidget failed", e)
        }
    }

    private fun buildViews(context: Context, glucose: String, steps: String, mood: String, status: String): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.ripple_widget)
        views.setTextViewText(R.id.widget_glucose, glucose)
        views.setTextViewText(R.id.widget_steps, steps)
        views.setTextViewText(R.id.widget_mood, mood)
        views.setTextViewText(R.id.widget_status, status)

        // Root tap → open app
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()
        views.setOnClickPendingIntent(
            R.id.widget_root,
            PendingIntent.getActivity(context, 0, launch,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        )

        // Refresh button
        val refreshIntent = Intent(context, RippleWidgetProvider::class.java).apply {
            action = ACTION_REFRESH
        }
        views.setOnClickPendingIntent(
            R.id.btn_refresh,
            PendingIntent.getBroadcast(context, 99, refreshIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        )

        // + Meal deeplink
        try {
            val i = Intent(Intent.ACTION_VIEW, Uri.parse("ripple://meals")).apply {
                setPackage(context.packageName)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            views.setOnClickPendingIntent(R.id.btn_meal,
                PendingIntent.getActivity(context, 1, i,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        } catch (e: Exception) { Log.w(TAG, "btn_meal failed", e) }

        // + Water deeplink
        try {
            val i = Intent(Intent.ACTION_VIEW, Uri.parse("ripple://log-water")).apply {
                setPackage(context.packageName)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            views.setOnClickPendingIntent(R.id.btn_water,
                PendingIntent.getActivity(context, 3, i,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        } catch (e: Exception) { Log.w(TAG, "btn_water failed", e) }

        // + Mood deeplink
        try {
            val i = Intent(Intent.ACTION_VIEW, Uri.parse("ripple://mood")).apply {
                setPackage(context.packageName)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            views.setOnClickPendingIntent(R.id.btn_mood,
                PendingIntent.getActivity(context, 2, i,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        } catch (e: Exception) { Log.w(TAG, "btn_mood failed", e) }

        return views
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
            val conn = URL("$API/glucose/status").openConnection() as HttpsURLConnection
            conn.connectTimeout = 3000
            conn.readTimeout = 3000
            conn.setRequestProperty("Authorization", "Bearer $token")
            val code = conn.responseCode
            if (code == 401 || code == 403) { conn.disconnect(); return "Sign in" }
            val result = if (code == 200) {
                val obj = JSONObject(conn.inputStream.bufferedReader().readText())
                if (obj.optBoolean("hasData", false)) {
                    val mg = obj.optInt("mg_dl", 0)
                    val arrow = obj.optString("arrow", "").trim()
                    if (arrow.isNotEmpty()) "$mg $arrow" else "$mg"
                } else "--"
            } else "--"
            conn.disconnect()
            result
        } catch (e: Exception) {
            Log.w(TAG, "fetchGlucose: ${e.message}")
            "--"
        }
    }

    private fun fetchSteps(token: String): String {
        return try {
            val today = LocalDate.now().toString()
            val conn = URL("$API/health-connect/steps?date=$today").openConnection() as HttpsURLConnection
            conn.connectTimeout = 3000
            conn.readTimeout = 3000
            conn.setRequestProperty("Authorization", "Bearer $token")
            val code = conn.responseCode
            val result = if (code == 200) {
                val obj = JSONObject(conn.inputStream.bufferedReader().readText())
                val count = obj.optInt("steps", 0)
                if (count > 0) NumberFormat.getNumberInstance().format(count) else "--"
            } else "--"
            conn.disconnect()
            result
        } catch (e: Exception) {
            Log.w(TAG, "fetchSteps: ${e.message}")
            "--"
        }
    }

    private fun fetchMood(token: String): String {
        return try {
            val conn = URL("$API/journal/today").openConnection() as HttpsURLConnection
            conn.connectTimeout = 3000
            conn.readTimeout = 3000
            conn.setRequestProperty("Authorization", "Bearer $token")
            val code = conn.responseCode
            val result = if (code == 200) {
                val arr = JSONArray(conn.inputStream.bufferedReader().readText())
                var latestScore = 0
                for (i in 0 until arr.length()) {
                    val e = arr.getJSONObject(i)
                    if (e.optString("entry_type") == "moment") continue
                    val s = e.optInt("mood_score", 0)
                    if (s > 0) latestScore = s
                }
                when (latestScore) {
                    5 -> "😃"
                    4 -> "🙂"
                    3 -> "😐"
                    2 -> "😕"
                    1 -> "😣"
                    else -> "--"
                }
            } else "--"
            conn.disconnect()
            result
        } catch (e: Exception) {
            Log.w(TAG, "fetchMood: ${e.message}")
            "--"
        }
    }
}
