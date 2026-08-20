package com.kellehs.wellness.wear

import android.app.Activity
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.google.android.gms.wearable.Node
import com.google.android.gms.wearable.Wearable

/**
 * Log face — water logging plus a Samsung-Health-style two-step mood picker:
 * first a mood category (GREAT → ROUGH, mapped to scores 5 → 1), then a
 * specific mood word from that category.
 *
 * Water and mood logging are done by sending a MessageClient message to the
 * phone (see the phone-side WearMessageListenerService in
 * WearMessageListener.kt.template). That way the auth token / API client
 * lives only on the phone; the watch never handles credentials.
 */
class RippleWearLogActivity : Activity() {

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var root: FrameLayout
    private var waterCountLabel: TextView? = null
    private var localWaterCount = 0
    private var localGoal = 8

    private data class MoodCategory(
        val title: String,
        val score: Int,
        val accent: Int,
        val moods: List<String>,
    )

    private val categories = listOf(
        MoodCategory("GREAT", 5, 0xFF4ECDC4.toInt(),
            listOf("Happy", "Excited", "Grateful", "Proud", "Energized")),
        MoodCategory("GOOD", 4, 0xFF5EA0F0.toInt(),
            listOf("Calm", "Relaxed", "Content", "Hopeful", "Focused")),
        MoodCategory("OKAY", 3, 0xFFF5A623.toInt(),
            listOf("Neutral", "Meh", "Tired", "Bored", "Distracted")),
        MoodCategory("LOW", 2, 0xFFB79CFF.toInt(),
            listOf("Sad", "Anxious", "Stressed", "Lonely", "Overwhelmed")),
        MoodCategory("ROUGH", 1, 0xFFFF7A6B.toInt(),
            listOf("Angry", "Exhausted", "Irritable", "Hurting", "Drained")),
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val cache = WearCache.read(this)
        val parts = cache.water.split("/").map { it.trim() }
        localWaterCount = parts.getOrNull(0)?.toIntOrNull() ?: 0
        localGoal = parts.getOrNull(1)?.toIntOrNull() ?: 8

        root = FrameLayout(this).apply { setBackgroundColor(BG) }
        setContentView(root)
        showLogHome()
    }

    private fun px(dp: Int) = (dp * resources.displayMetrics.density).toInt()

    private fun scrollColumn(): Pair<ScrollView, LinearLayout> {
        val scroll = ScrollView(this).apply {
            isVerticalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER
        }
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(px(20), px(28), px(20), px(24))
        }
        scroll.addView(col)
        root.removeAllViews()
        root.addView(scroll, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ))
        return scroll to col
    }

    private fun header(col: LinearLayout, title: String, subtitle: String) {
        col.addView(TextView(this).apply {
            text = title
            textSize = 12f
            setTextColor(TEAL)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            letterSpacing = 0.15f
        })
        col.addView(TextView(this).apply {
            text = subtitle
            textSize = 10f
            setTextColor(LABEL_GRAY)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            letterSpacing = 0.12f
            setPadding(0, px(4), 0, px(10))
        })
    }

    private fun pill(label: String, textColor: Int, fill: Int?, stroke: Int?, onTap: () -> Unit): TextView {
        return TextView(this).apply {
            text = label
            textSize = 13f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setTextColor(textColor)
            gravity = Gravity.CENTER
            letterSpacing = 0.08f
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = px(14).toFloat()
                setColor(fill ?: 0x00000000)
                if (stroke != null) setStroke(px(2), stroke)
            }
            setPadding(px(16), px(9), px(16), px(9))
            isClickable = true
            setOnClickListener { onTap() }
        }
    }

    private fun rowLp(): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = px(7) }

    // ── Screen 1: water + entry to mood flow ─────────────────────────────────

    private fun showLogHome() {
        val (_, col) = scrollColumn()
        header(col, "RIPPLE", "QUICK LOG")

        col.addView(TextView(this).apply {
            text = "WATER — GLASSES"
            textSize = 10f
            setTextColor(LABEL_GRAY)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setPadding(0, px(2), 0, px(4))
        })
        waterCountLabel = TextView(this).apply {
            textSize = 34f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setTextColor(BLUE)
            gravity = Gravity.CENTER
            text = "$localWaterCount / $localGoal"
        }
        col.addView(waterCountLabel)

        col.addView(pill("+ LOG GLASS", 0xFF0B1018.toInt(), BLUE, null) {
            // Optimistic bump; the phone will authoritative-refresh via
            // the data-layer push after its API call completes.
            localWaterCount = (localWaterCount + 1).coerceAtMost(localGoal)
            waterCountLabel?.text = "$localWaterCount / $localGoal"
            sendMessage(PATH_LOG_WATER, ByteArray(0))
        }, rowLp().apply { topMargin = px(12) })

        col.addView(pill("LOG MOOD", 0xFF0B1018.toInt(), PURPLE, null) {
            showMoodCategories()
        }, rowLp().apply { topMargin = px(10) })
    }

    // ── Screen 2: mood category (Samsung-style step 1) ───────────────────────

    private fun showMoodCategories() {
        val (_, col) = scrollColumn()
        header(col, "MOOD", "HOW ARE YOU FEELING?")

        categories.forEach { c ->
            col.addView(pill(c.title, c.accent, null, c.accent) {
                showMoodList(c)
            }, rowLp())
        }

        col.addView(pill("BACK", LABEL_GRAY, null, null) { showLogHome() },
            rowLp().apply { topMargin = px(12) })
    }

    // ── Screen 3: specific mood within the category (step 2) ─────────────────

    private fun showMoodList(c: MoodCategory) {
        val (_, col) = scrollColumn()
        header(col, c.title, "PICK WHAT FITS BEST")

        c.moods.forEach { mood ->
            col.addView(pill(mood.uppercase(), WHITE, null, c.accent) {
                // Payload: "score,label" UTF-8 — parsed by the phone listener.
                sendMessage(PATH_LOG_MOOD, "${c.score},$mood".toByteArray(Charsets.UTF_8))
                showMoodConfirmation(c, mood)
            }, rowLp())
        }

        col.addView(pill("BACK", LABEL_GRAY, null, null) { showMoodCategories() },
            rowLp().apply { topMargin = px(12) })
    }

    private fun showMoodConfirmation(c: MoodCategory, mood: String) {
        val (_, col) = scrollColumn()
        col.addView(TextView(this).apply {
            text = "✓"
            textSize = 40f
            setTextColor(c.accent)
            gravity = Gravity.CENTER
            setPadding(0, px(24), 0, px(4))
        })
        col.addView(TextView(this).apply {
            text = mood.uppercase()
            textSize = 16f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setTextColor(WHITE)
            gravity = Gravity.CENTER
            letterSpacing = 0.12f
        })
        col.addView(TextView(this).apply {
            text = "LOGGED"
            textSize = 10f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setTextColor(LABEL_GRAY)
            gravity = Gravity.CENTER
            letterSpacing = 0.15f
            setPadding(0, px(4), 0, 0)
        })
        handler.postDelayed({ showLogHome() }, 1400L)
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    /**
     * Broadcast a message to every connected phone-side node. The phone-side
     * WearMessageListenerService (see WearMessageListener.kt.template) picks
     * it up on the matching path and calls into the widget's water/mood
     * helpers. Fire and forget — no auth state lives on the watch.
     */
    private fun sendMessage(path: String, payload: ByteArray) {
        try {
            Wearable.getNodeClient(applicationContext).connectedNodes
                .addOnSuccessListener { nodes: List<Node> ->
                    for (n in nodes) {
                        Wearable.getMessageClient(applicationContext)
                            .sendMessage(n.id, path, payload)
                            .addOnFailureListener { e -> Log.w(TAG, "sendMessage($path) → ${n.displayName}: ${e.message}") }
                    }
                }
                .addOnFailureListener { e -> Log.w(TAG, "connectedNodes: ${e.message}") }
        } catch (e: Exception) {
            Log.w(TAG, "sendMessage($path) threw", e)
        }
    }

    companion object {
        private const val TAG = "RippleWearLog"
        const val PATH_LOG_WATER = "/ripple/log-water"
        const val PATH_LOG_MOOD  = "/ripple/log-mood"

        private const val BG = 0xFF10141A.toInt()
        private const val TEAL = 0xFF4ECDC4.toInt()
        private const val BLUE = 0xFF5EA0F0.toInt()
        private const val PURPLE = 0xFFB79CFF.toInt()
        private const val LABEL_GRAY = 0xFF8A93A0.toInt()
        private const val WHITE = 0xFFF2F4F7.toInt()
    }
}
