package com.kellehs.wellness.wear

import android.animation.ValueAnimator
import android.app.Activity
import android.content.Context
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.LinearInterpolator
import android.view.animation.OvershootInterpolator
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.google.android.gms.wearable.Wearable

/**
 * Haptic-guided breathing for the wrist. Five paces, each with its own
 * timing pattern and animation character:
 *
 *   BOX 4-4-4-4          — stress reset, linear grow/hold/shrink/hold
 *   RELAX 4-7-8          — sleep aid, long exhale, ease-in-out
 *   COHERENT 5-5         — HRV balance, smooth continuous sine
 *   ENERGIZE 2-2         — quick wake-up, snappy overshoot animation
 *   SIGH 3-1-8           — physiological sigh (Huberman), sharp inhale-topper
 *
 * Each transition marks a distinct vibration so the practice works
 * eyes-closed. All labels are large + bold for readability on the wrist.
 */
class RippleWearBreathingActivity : Activity() {

    private val handler = Handler(Looper.getMainLooper())
    private var vibrator: Vibrator? = null
    private var animator: ValueAnimator? = null
    private var idleAnimator: ValueAnimator? = null

    private var pace: Pace? = null
    private var started = false
    private var running = false
    private var phaseIndex = 0
    private var cyclesDone = 0

    private lateinit var root: FrameLayout
    private var circle: FrameLayout? = null
    private var phaseLabel: TextView? = null
    private var countLabel: TextView? = null
    private var cycleLabel: TextView? = null

    /**
     * A breathing pace. `curve` picks the animator interpolator for a
     * personality — LINEAR feels metronomic (BOX), SMOOTH feels wave-like
     * (COHERENT / RELAX), SNAPPY feels punchy (ENERGIZE).
     */
    enum class Curve { LINEAR, SMOOTH, SNAPPY }

    enum class Pace(
        val id: String,
        val title: String,
        val subtitle: String,
        val accent: Int,
        val phaseSeconds: IntArray,
        val phaseNames: Array<String>,
        val curve: Curve,
    ) {
        BOX(
            id = "box",
            title = "BOX",
            subtitle = "4·4·4·4 — stress reset",
            accent = 0xFF4ECDC4.toInt(),
            phaseSeconds = intArrayOf(4, 4, 4, 4),
            phaseNames = arrayOf("INHALE", "HOLD", "EXHALE", "HOLD"),
            curve = Curve.LINEAR,
        ),
        RELAX(
            id = "relax",
            title = "RELAX",
            subtitle = "4·7·8 — fall asleep",
            accent = 0xFFB79CFF.toInt(),
            phaseSeconds = intArrayOf(4, 7, 8),
            phaseNames = arrayOf("INHALE", "HOLD", "EXHALE"),
            curve = Curve.SMOOTH,
        ),
        COHERENT(
            id = "coherent",
            title = "COHERENT",
            subtitle = "5·5 — balance HRV",
            accent = 0xFF5EA0F0.toInt(),
            phaseSeconds = intArrayOf(5, 5),
            phaseNames = arrayOf("INHALE", "EXHALE"),
            curve = Curve.SMOOTH,
        ),
        ENERGIZE(
            id = "energize",
            title = "ENERGIZE",
            subtitle = "2·2 — quick wake-up",
            accent = 0xFFFF7A6B.toInt(),
            phaseSeconds = intArrayOf(2, 2),
            phaseNames = arrayOf("INHALE", "EXHALE"),
            curve = Curve.SNAPPY,
        ),
        SIGH(
            id = "sigh",
            title = "SIGH",
            subtitle = "3·1·8 — Huberman reset",
            accent = 0xFFF5A623.toInt(),
            phaseSeconds = intArrayOf(3, 1, 8),
            phaseNames = arrayOf("INHALE", "TOP-UP", "EXHALE"),
            curve = Curve.SMOOTH,
        );
    }

    companion object {
        private const val BG = 0xFF10141A.toInt()
        private const val LABEL_GRAY = 0xFF8A93A0.toInt()
        private const val WHITE = 0xFFF2F4F7.toInt()
        private const val SCALE_MIN = 0.55f
        private const val SCALE_MAX = 1.0f
        private const val TAG = "RippleWearBreathe"
        /** MessageClient path the phone's WearMessageListener handles. */
        private const val PATH_BREATH_SESSION = "/ripple/breath-session"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }

        root = FrameLayout(this).apply { setBackgroundColor(BG) }
        setContentView(root)

        // Feature 4: if the phone pushed a default pace, skip the picker
        val cache = WearCache.read(this)
        val defaultId = cache.defaultBreathPace
        val defaultPace = if (defaultId.isNotEmpty()) {
            Pace.values().firstOrNull { it.id == defaultId }
        } else null

        if (defaultPace != null) {
            pace = defaultPace
            startSession()
        } else {
            showPacePicker()
        }
    }

    /** Scrollable pace menu. Five options each with title + subtitle. */
    private fun showPacePicker() {
        val density = resources.displayMetrics.density
        // A val, not a local fun — rowLp/paceRow take px as a (Int) -> Int parameter,
        // and a bare local function name can't be passed as a value.
        val px: (Int) -> Int = { v -> (v * density).toInt() }

        root.removeAllViews()

        val scroll = ScrollView(this).apply {
            isVerticalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER
        }
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(px(20), px(30), px(20), px(24))
        }

        col.addView(TextView(this).apply {
            text = "BREATHE"
            textSize = 14f
            setTextColor(WHITE)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            letterSpacing = 0.2f
        })
        col.addView(TextView(this).apply {
            text = "PICK A PACE"
            textSize = 10f
            setTextColor(LABEL_GRAY)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            letterSpacing = 0.15f
            setPadding(0, px(4), 0, px(10))
        })

        Pace.values().forEachIndexed { i, p ->
            val row = paceRow(px, p)
            row.alpha = 0f
            row.translationY = px(16).toFloat()
            row.animate()
                .alpha(1f)
                .translationY(0f)
                .setStartDelay(60L * i)
                .setDuration(260L)
                .setInterpolator(AccelerateDecelerateInterpolator())
                .start()
            col.addView(row, rowLp(px))
        }

        col.addView(TextView(this).apply {
            text = "CANCEL"
            textSize = 11f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setTextColor(LABEL_GRAY)
            gravity = Gravity.CENTER
            letterSpacing = 0.15f
            setPadding(0, px(14), 0, 0)
            setOnClickListener { finish() }
        }, rowLp(px))

        scroll.addView(col)
        root.addView(scroll, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT,
            Gravity.CENTER
        ))
    }

    private fun rowLp(px: (Int) -> Int): LinearLayout.LayoutParams {
        return LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = px(8); gravity = Gravity.CENTER_HORIZONTAL }
    }

    private fun paceRow(px: (Int) -> Int, p: Pace): View {
        val density = resources.displayMetrics.density
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = px(14).toFloat()
                setColor(0x00000000)
                setStroke((2 * density).toInt(), p.accent)
            }
            setPadding(px(14), px(10), px(14), px(10))
            isClickable = true
            isFocusable = true
            setOnClickListener { view ->
                view.animate().scaleX(0.94f).scaleY(0.94f).setDuration(80L)
                    .withEndAction {
                        pace = p
                        startSession()
                    }
                    .start()
            }
        }
        card.addView(TextView(this).apply {
            text = p.title
            textSize = 16f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setTextColor(p.accent)
            gravity = Gravity.CENTER
            letterSpacing = 0.14f
        })
        card.addView(TextView(this).apply {
            text = p.subtitle
            textSize = 11f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setTextColor(LABEL_GRAY)
            gravity = Gravity.CENTER
            setPadding(0, px(2), 0, 0)
        })
        return card
    }

    /** Guided session — big pulsing circle, BOLD large phase text, tap ends. */
    private fun startSession() {
        val p = pace ?: return
        val density = resources.displayMetrics.density
        fun px(v: Int) = (v * density).toInt()

        root.removeAllViews()

        val circleSize = px(150)
        val dimAccent = (p.accent and 0x00FFFFFF) or 0x33000000 // ~20% alpha
        circle = FrameLayout(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(dimAccent)
                setStroke(px(3), p.accent)
            }
            scaleX = SCALE_MIN
            scaleY = SCALE_MIN
        }
        root.addView(circle, FrameLayout.LayoutParams(circleSize, circleSize, Gravity.CENTER))

        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
        }
        phaseLabel = TextView(this).apply {
            textSize = 22f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setTextColor(WHITE)
            gravity = Gravity.CENTER
            letterSpacing = 0.14f
        }
        countLabel = TextView(this).apply {
            textSize = 16f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setTextColor(p.accent)
            gravity = Gravity.CENTER
        }
        cycleLabel = TextView(this).apply {
            textSize = 11f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setTextColor(LABEL_GRAY)
            gravity = Gravity.CENTER
            text = "TAP TO END"
            letterSpacing = 0.15f
        }
        col.addView(phaseLabel)
        col.addView(countLabel, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = px(2); gravity = Gravity.CENTER })
        col.addView(cycleLabel, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = px(10); gravity = Gravity.CENTER })

        root.addView(col, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER
        ))

        root.setOnClickListener {
            if (started) stopAndFinish() else startCountdown()
        }

        started = false
        running = false
        phaseIndex = 0
        cyclesDone = 0

        phaseLabel?.text = p.title
        countLabel?.text = "READY"
        cycleLabel?.text = "TAP TO START"
        startIdlePulse()
    }

    /** Slow gentle pulse on the ready screen, inviting the tap. */
    private fun startIdlePulse() {
        idleAnimator?.cancel()
        idleAnimator = ValueAnimator.ofFloat(SCALE_MIN, SCALE_MIN + 0.07f).apply {
            duration = 1600L
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.REVERSE
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener { a ->
                val s = a.animatedValue as Float
                circle?.scaleX = s
                circle?.scaleY = s
            }
            start()
        }
    }

    /** 3-2-1 lead-in so the user can settle before the first inhale. */
    private fun startCountdown() {
        started = true
        running = true
        idleAnimator?.cancel()
        idleAnimator = null
        phaseLabel?.text = "GET READY"
        cycleLabel?.text = "TAP TO END"
        for (i in 0 until 3) {
            handler.postDelayed({
                if (!running) return@postDelayed
                countLabel?.text = (3 - i).toString()
                popCountLabel()
                try {
                    vibrator?.vibrate(VibrationEffect.createOneShot(40, VibrationEffect.DEFAULT_AMPLITUDE))
                } catch (_: Exception) {}
            }, i * 1000L)
        }
        handler.postDelayed({
            if (running) runPhase()
        }, 3000L)
    }

    /** Quick scale pop on each countdown tick. */
    private fun popCountLabel() {
        countLabel?.let { label ->
            label.scaleX = 1.6f
            label.scaleY = 1.6f
            label.animate()
                .scaleX(1f).scaleY(1f)
                .setDuration(320L)
                .setInterpolator(OvershootInterpolator(2f))
                .start()
        }
    }

    private fun runPhase() {
        val p = pace ?: return
        if (!running) return
        val name = p.phaseNames[phaseIndex]
        val secs = p.phaseSeconds[phaseIndex]
        val phaseMs = secs * 1000L

        phaseLabel?.let { label ->
            label.animate().cancel()
            label.alpha = 0f
            label.text = name
            label.animate().alpha(1f).setDuration(250L).start()
        }
        vibrateForPhase(name)

        animator?.cancel()
        when (name) {
            "INHALE"  -> { animateCircle(currentScale(), SCALE_MAX, phaseMs, p.curve); spawnRipple(phaseMs) }
            "TOP-UP"  -> animateCircle(currentScale(), SCALE_MAX + 0.08f, phaseMs, Curve.SNAPPY)
            "EXHALE"  -> animateCircle(currentScale(), SCALE_MIN, phaseMs, p.curve)
            else      -> animator = null  // HOLD: hold current scale
        }

        for (i in 0 until secs) {
            handler.postDelayed({
                if (running) countLabel?.text = (secs - i).toString()
            }, i * 1000L)
        }

        handler.postDelayed({
            if (!running) return@postDelayed
            phaseIndex = (phaseIndex + 1) % p.phaseSeconds.size
            if (phaseIndex == 0) {
                cyclesDone += 1
                cycleLabel?.text = "${cyclesDone}× · TAP TO END"
            }
            runPhase()
        }, phaseMs)
    }

    /** Thin ring that expands past the circle and fades — the "ripple". */
    private fun spawnRipple(phaseMs: Long) {
        val p = pace ?: return
        val density = resources.displayMetrics.density
        val size = (150 * density).toInt()
        val ring = View(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(0x00000000)
                setStroke((2 * density).toInt(), p.accent)
            }
            scaleX = SCALE_MIN
            scaleY = SCALE_MIN
            alpha = 0.8f
        }
        root.addView(ring, 0, FrameLayout.LayoutParams(size, size, Gravity.CENTER))
        ring.animate()
            .scaleX(1.35f).scaleY(1.35f)
            .alpha(0f)
            .setDuration(phaseMs.coerceAtMost(2500L))
            .setInterpolator(AccelerateDecelerateInterpolator())
            .withEndAction { root.removeView(ring) }
            .start()
    }

    private fun currentScale(): Float = circle?.scaleX ?: SCALE_MIN

    private fun animateCircle(from: Float, to: Float, duration: Long, curve: Curve) {
        animator = ValueAnimator.ofFloat(from, to).apply {
            this.duration = duration
            interpolator = when (curve) {
                Curve.LINEAR -> LinearInterpolator()
                Curve.SMOOTH -> AccelerateDecelerateInterpolator()
                Curve.SNAPPY -> OvershootInterpolator(1.5f)
            }
            addUpdateListener { a ->
                val s = a.animatedValue as Float
                circle?.scaleX = s
                circle?.scaleY = s
            }
            start()
        }
    }

    private fun vibrateForPhase(name: String) {
        val v = vibrator ?: return
        val effect = when (name) {
            "INHALE" -> VibrationEffect.createWaveform(longArrayOf(0, 80, 80, 80), -1)
            "TOP-UP" -> VibrationEffect.createOneShot(60, VibrationEffect.DEFAULT_AMPLITUDE)
            "EXHALE" -> VibrationEffect.createOneShot(300, VibrationEffect.DEFAULT_AMPLITUDE)
            else     -> VibrationEffect.createOneShot(50, VibrationEffect.DEFAULT_AMPLITUDE)
        }
        try { v.vibrate(effect) } catch (_: Exception) {}
    }

    private fun stopAndFinish() {
        running = false
        handler.removeCallbacksAndMessages(null)
        animator?.cancel()
        idleAnimator?.cancel()

        // Feature 3: send session back to phone if at least 1 full cycle completed
        val p = pace
        if (p != null && cyclesDone >= 1) {
            val durationSecs = p.phaseSeconds.sum() * cyclesDone
            sendSessionToPhone(p.id, cyclesDone, durationSecs)
        }

        finish()
    }

    /**
     * Sends a completed breathing session to the phone via MessageClient so
     * the phone can log mindfulness minutes (handled by WearMessageListener
     * on the /ripple/breath-session path).
     * Payload format: "paceId,cycles,durationSeconds" as UTF-8 bytes.
     */
    private fun sendSessionToPhone(paceId: String, cycles: Int, durationSecs: Int) {
        val payload = "$paceId,$cycles,$durationSecs".toByteArray(Charsets.UTF_8)
        Wearable.getNodeClient(this).connectedNodes
            .addOnSuccessListener { nodes ->
                for (node in nodes) {
                    Wearable.getMessageClient(this)
                        .sendMessage(node.id, PATH_BREATH_SESSION, payload)
                        .addOnFailureListener { e ->
                            Log.w(TAG, "sendSessionToPhone to ${node.id} failed", e)
                        }
                }
            }
            .addOnFailureListener { e -> Log.w(TAG, "getConnectedNodes failed", e) }
    }

    override fun onPause() {
        super.onPause()
        if (running) stopAndFinish()
    }

    override fun onDestroy() {
        running = false
        handler.removeCallbacksAndMessages(null)
        animator?.cancel()
        idleAnimator?.cancel()
        super.onDestroy()
    }
}
