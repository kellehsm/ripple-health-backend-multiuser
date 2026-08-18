package com.kellehs.wellness

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.CheckBox
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * Configuration activity for the main Ripple widget.
 * Lets the user choose which stat blocks are shown.
 * Uses only android.app.Activity + programmatic views — no appcompat, no XML layouts.
 */
class RippleWidgetConfigActivity : Activity() {

    private var appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    private val blocks = listOf(
        "glucose" to "Glucose",
        "steps"   to "Steps",
        "heart"   to "Heart Rate",
        "water"   to "Water",
        "sleep"   to "Sleep",
        "insight" to "Insight Carousel"
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Standard config-activity contract: default RESULT_CANCELED so backing out
        // causes the launcher to discard the widget placement.
        setResult(RESULT_CANCELED)

        appWidgetId = intent?.extras?.getInt(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID
        ) ?: AppWidgetManager.INVALID_APPWIDGET_ID

        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }

        val prefs = getSharedPreferences("RippleWidgetPrefs", Context.MODE_PRIVATE)
        val savedKeys = prefs.getString("cfg_$appWidgetId", null)
            ?.split(",")?.map { it.trim() }?.filter { it.isNotEmpty() }?.toSet()

        // Build UI programmatically
        val dp = resources.displayMetrics.density

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding((24 * dp).toInt(), (24 * dp).toInt(), (24 * dp).toInt(), (24 * dp).toInt())
            setBackgroundColor(Color.parseColor("#F5F1E8"))
        }

        val title = TextView(this).apply {
            text = "Ripple Widget"
            textSize = 20f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor("#1C2B3A"))
            gravity = Gravity.CENTER_HORIZONTAL
        }
        root.addView(title, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ).also { it.bottomMargin = (16 * dp).toInt() })

        val subtitle = TextView(this).apply {
            text = "Choose which sections to display"
            textSize = 14f
            setTextColor(Color.parseColor("#6E655A"))
            gravity = Gravity.CENTER_HORIZONTAL
        }
        root.addView(subtitle, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ).also { it.bottomMargin = (20 * dp).toInt() })

        val checkboxes = mutableMapOf<String, CheckBox>()
        for ((key, label) in blocks) {
            val cb = CheckBox(this).apply {
                text = label
                textSize = 16f
                setTextColor(Color.parseColor("#1C2B3A"))
                isChecked = savedKeys == null || key in savedKeys
            }
            checkboxes[key] = cb
            root.addView(cb, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
            ).also { it.bottomMargin = (8 * dp).toInt() })
        }

        val saveBtn = Button(this).apply {
            text = "Save"
            textSize = 16f
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#3FA0A6"))
        }
        root.addView(saveBtn, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, (48 * dp).toInt()
        ).also { it.topMargin = (16 * dp).toInt() })

        saveBtn.setOnClickListener {
            val enabledKeys = checkboxes.entries
                .filter { it.value.isChecked }
                .map { it.key }
                .joinToString(",")

            prefs.edit().putString("cfg_$appWidgetId", enabledKeys).apply()

            // Trigger onUpdate for this widget id
            val mgr = AppWidgetManager.getInstance(this)
            val updateIntent = Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE).apply {
                component = ComponentName(this@RippleWidgetConfigActivity, RippleWidgetProvider::class.java)
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, intArrayOf(appWidgetId))
            }
            sendBroadcast(updateIntent)

            val resultValue = Intent().apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
            }
            setResult(RESULT_OK, resultValue)
            finish()
        }

        val scroll = ScrollView(this)
        scroll.addView(root)
        setContentView(scroll)
    }
}
