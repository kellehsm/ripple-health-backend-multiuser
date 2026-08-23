package com.kellehs.wellness.wear

import android.app.Activity
import android.content.Intent
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.GestureDetector
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.ViewFlipper
import kotlin.math.abs

/**
 * Ripple Wear home screen — scrollable dashboard showing today's cached data.
 * Reads from [WearCache] only; no network calls. Refreshes on every resume so
 * returning from RippleWearLogActivity shows the latest values.
 */
class RippleWearMainActivity : Activity() {

    // Root column re-built on every onResume
    private lateinit var col: LinearLayout

    // Colors
    companion object {
        private const val BG           = 0xFF10141A.toInt()
        private const val TEAL         = 0xFF3FA0A6.toInt()
        private const val BERRY        = 0xFFA62A50.toInt()
        private const val URGENT_RED   = 0xFFC0392B.toInt()
        private const val BLUE         = 0xFF3D7BD9.toInt()
        private const val INDIGO       = 0xFF6C5CE7.toInt()
        private const val GREEN        = 0xFF2ECC71.toInt()
        private const val AMBER        = 0xFFF5A623.toInt()
        private const val GRAY         = 0xFF8A8A8A.toInt()
        private const val LABEL_GRAY   = 0xFF8A93A0.toInt()
        private const val WHITE        = 0xFFF2F4F7.toInt()
        private const val SCORE_GRAY   = 0xFF8A8A8A.toInt()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val density = resources.displayMetrics.density
        fun px(dp: Int) = (dp * density).toInt()

        // Outer scroll — round-screen-safe horizontal padding
        val scroll = ScrollView(this).apply {
            setBackgroundColor(BG)
            isVerticalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER
        }

        col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            // Round faces clip the top/bottom arcs, so pad deeper there
            val round = resources.configuration.isScreenRound
            setPadding(px(22), px(if (round) 48 else 28), px(22), px(if (round) 52 else 28))
        }

        scroll.addView(col)
        setContentView(scroll)
    }

    override fun onResume() {
        super.onResume()
        val snap = WearCache.read(this)
        buildUI(snap)
    }

    // ------------------------------------------------------------------
    // UI construction
    // ------------------------------------------------------------------

    private fun buildUI(s: WearCache.Snapshot) {
        col.removeAllViews()
        val density = resources.displayMetrics.density
        // A val, not a local fun — the row builders below take px as a (Int) -> Int
        // parameter, and a bare local function name can't be passed as a value.
        val px: (Int) -> Int = { dp -> (dp * density).toInt() }

        // 1. Header row: "Ripple" + wellness score badge
        col.addView(headerRow(px, s.wellnessScore))

        // Divider
        col.addView(divider(px))

        // 2. Glucose block
        col.addView(glucoseBlock(px, s))

        col.addView(divider(px))

        // 3. Stat rows
        col.addView(statRow(px, "👟", "Steps",  s.steps,  TEAL))
        col.addView(statRow(px, "💧", "Water",  s.water,  BLUE))
        col.addView(statRow(px, "❤️", "Heart",  s.heart,  BERRY))
        col.addView(statRow(px, "😴", "Sleep",  s.sleep,  INDIGO))

        // 4. Insights (optional, swipeable when multiple)
        val insightTitles = if (s.insights.isNotBlank()) {
            s.insights.split("").filter { it.isNotBlank() }
        } else if (s.insight.isNotBlank()) {
            listOf(s.insight)
        } else {
            emptyList()
        }
        if (insightTitles.isNotEmpty()) {
            col.addView(divider(px))
            if (insightTitles.size > 1) {
                col.addView(insightFlipperView(px, insightTitles))
            } else {
                col.addView(insightView(px, insightTitles[0]))
            }
        }

        col.addView(divider(px))

        // 5. Action buttons
        col.addView(buttonRow(px))
    }

    // --- Header row -------------------------------------------------------

    private fun headerRow(px: (Int) -> Int, scoreRaw: String): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        // "Ripple" title
        row.addView(TextView(this).apply {
            text = "Ripple"
            textSize = 20f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(TEAL)
        }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))

        // Wellness score badge
        val scoreColor = when {
            scoreRaw == "--" -> SCORE_GRAY
            (scoreRaw.toIntOrNull() ?: 0) >= 75 -> GREEN
            (scoreRaw.toIntOrNull() ?: 0) >= 50 -> AMBER
            else -> URGENT_RED
        }
        row.addView(TextView(this).apply {
            text = if (scoreRaw == "--") "—" else scoreRaw
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(0xFF0B1018.toInt())
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = 999f
                setColor(scoreColor)
            }
            setPadding(px(8), px(3), px(8), px(3))
        })

        return row
    }

    // --- Glucose block ----------------------------------------------------

    private fun glucoseBlock(px: (Int) -> Int, s: WearCache.Snapshot): View {
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
        }

        val labelUpper = s.glucoseLabel.uppercase()
        val isUrgent = labelUpper.contains("HIGH") || labelUpper.contains("LOW") ||
                       labelUpper.contains("URGENT")
        val glucoseColor = if (isUrgent) URGENT_RED else BERRY

        // Big value + arrow on one line
        val valueText = buildString {
            append(s.glucose)
            if (s.glucoseArrow.isNotBlank()) append("  ${s.glucoseArrow}")
        }
        col.addView(TextView(this).apply {
            text = valueText
            textSize = 36f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(glucoseColor)
            gravity = Gravity.CENTER
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
        }, centerLp())

        // Label (e.g. "IN RANGE", "ELEVATED")
        if (s.glucoseLabel.isNotBlank()) {
            col.addView(TextView(this).apply {
                text = s.glucoseLabel
                textSize = 11f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(glucoseColor)
                gravity = Gravity.CENTER
                letterSpacing = 0.12f
                setPadding(0, px(2), 0, 0)
            }, centerLp())
        }

        // Delta + stale note
        val deltaStr = if (s.glucoseDelta != 0) {
            val sign = if (s.glucoseDelta > 0) "+" else ""
            "$sign${s.glucoseDelta} mg/dL"
        } else ""

        val staleStr = if (s.glucoseStale) " · stale" else ""
        val subText = (deltaStr + staleStr).trim()
        if (subText.isNotBlank()) {
            col.addView(TextView(this).apply {
                text = subText
                textSize = 10f
                setTextColor(if (s.glucoseStale) URGENT_RED else LABEL_GRAY)
                gravity = Gravity.CENTER
                setPadding(0, px(2), 0, 0)
            }, centerLp())
        }

        return col
    }

    // --- Stat rows --------------------------------------------------------

    private fun statRow(px: (Int) -> Int, icon: String, label: String, value: String, color: Int): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, px(5), 0, px(5))
        }
        row.addView(TextView(this).apply {
            text = icon
            textSize = 14f
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 0, px(8), 0)
        })
        row.addView(TextView(this).apply {
            text = label
            textSize = 13f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(LABEL_GRAY)
            gravity = Gravity.CENTER_VERTICAL
        }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        row.addView(TextView(this).apply {
            text = value
            textSize = 13f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(color)
            gravity = Gravity.CENTER_VERTICAL
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
        })
        return row
    }

    // --- Insight ----------------------------------------------------------

    private fun insightView(px: (Int) -> Int, text: String): View {
        return TextView(this).apply {
            this.text = text
            textSize = 11f
            setTextColor(LABEL_GRAY)
            gravity = Gravity.CENTER
            maxLines = 3
            setPadding(0, px(4), 0, px(4))
        }
    }

    private fun insightFlipperView(px: (Int) -> Int, texts: List<String>): View {
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
        }

        val flipper = ViewFlipper(this).apply {
            for (text in texts) {
                addView(insightView(px, text))
            }
        }
        container.addView(flipper, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ))

        // Counter label e.g. "1 / 3"
        val counter = TextView(this).apply {
            text = "1 / ${texts.size}"
            textSize = 9f
            setTextColor(GRAY)
            gravity = Gravity.CENTER
            setPadding(0, px(2), 0, 0)
        }
        container.addView(counter, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ))

        // Fling left → next, fling right → previous
        val gd = GestureDetector(this,
            object : GestureDetector.SimpleOnGestureListener() {
                private val SWIPE_MIN_DISTANCE = px(30)
                private val SWIPE_MIN_VELOCITY = px(50)

                override fun onFling(
                    e1: MotionEvent?,
                    e2: MotionEvent,
                    velocityX: Float,
                    velocityY: Float
                ): Boolean {
                    val dx = (e2.x - (e1?.x ?: e2.x))
                    val dy = (e2.y - (e1?.y ?: e2.y))
                    if (abs(dx) < SWIPE_MIN_DISTANCE) return false
                    if (abs(velocityX) < SWIPE_MIN_VELOCITY) return false
                    if (abs(dy) > abs(dx)) return false
                    if (dx < 0) {
                        // swipe left → show next
                        flipper.showNext()
                    } else {
                        // swipe right → show previous
                        flipper.showPrevious()
                    }
                    val idx = flipper.displayedChild
                    counter.text = "${idx + 1} / ${texts.size}"
                    return true
                }
            })

        container.setOnTouchListener { _, event ->
            gd.onTouchEvent(event)
            true
        }

        return container
    }

    // --- Button row -------------------------------------------------------

    private fun buttonRow(px: (Int) -> Int): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }

        row.addView(pillButton(px, "＋ Log", TEAL) {
            startActivity(Intent(this@RippleWearMainActivity, RippleWearLogActivity::class.java))
        }, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { marginEnd = px(10) })

        row.addView(pillButton(px, "🫁 Breathe", INDIGO) {
            startActivity(Intent(this@RippleWearMainActivity, RippleWearBreathingActivity::class.java))
        })

        return row
    }

    private fun pillButton(px: (Int) -> Int, label: String, color: Int, onClick: () -> Unit): View {
        return TextView(this).apply {
            text = label
            textSize = 12f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(WHITE)
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = 999f
                setColor(color)
            }
            setPadding(px(16), px(9), px(16), px(9))
            isClickable = true
            isFocusable = true
            setOnClickListener { onClick() }
        }
    }

    // --- Helpers ----------------------------------------------------------

    private fun divider(px: (Int) -> Int): View {
        return View(this).apply {
            setBackgroundColor(0xFF1E2530.toInt())
        }.also { v ->
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, (1 * resources.displayMetrics.density).toInt()
            )
            lp.topMargin = px(10)
            lp.bottomMargin = px(10)
            v.layoutParams = lp
        }
    }

    private fun centerLp(): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { gravity = Gravity.CENTER_HORIZONTAL }
}
