package com.kellehs.wellness.wear

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.app.Activity
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
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
import android.view.animation.AccelerateInterpolator
import android.view.animation.LinearInterpolator
import android.view.animation.OvershootInterpolator
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.google.android.gms.wearable.Wearable

// Ring models used by the inner view classes in RippleWearBreathingActivity. They live at
// file scope because Kotlin prohibits declaring a nested class inside an `inner class`.
private data class RippleRing(var radius: Float, var alpha: Float)
private data class CornerRing(val cx: Float, val cy: Float, var radius: Float, var alpha: Float)

/**
 * Haptic-guided breathing for the wrist. Five paces, each with its own
 * timing pattern and animation character:
 *
 *   BOX 4-4-4-4          — stress reset, box animation (dot traces four sides)
 *   RELAX 4-7-8          — sleep aid, long exhale, ease-in-out circle
 *   COHERENT 5-5         — HRV balance, smooth continuous sine circle
 *   ENERGIZE 2-2         — quick wake-up, snappy overshoot circle
 *   SIGH 3-1-8           — physiological sigh (Huberman), sharp inhale-topper circle
 *
 * BOX breathing uses a custom square canvas animation — a dot tracing the
 * four sides of a rounded square, one side per phase (inhale = left side up,
 * hold = top side across, exhale = right side down, hold = bottom side back).
 *
 * All other paces use the classic expand/contract circle.
 *
 * Phase text and countdown timer sit ABOVE and BELOW the animation respectively,
 * using the full round face — text is never constrained inside the circle.
 *
 * Each transition marks a distinct vibration so the practice works eyes-closed.
 */
class RippleWearBreathingActivity : Activity() {

    private val handler = Handler(Looper.getMainLooper())
    private var vibrator: Vibrator? = null
    private var animator: ValueAnimator? = null
    private var idleAnimator: ValueAnimator? = null
    // Tracks all active ripple/trail animators for lifecycle cleanup
    private val activeAnimators = mutableListOf<Animator>()

    // Item 5: dim-after-60s fallback for long sessions
    private var sessionStartMs = 0L
    private val dimRunnable = Runnable { dimScreenForAmbient() }
    private var isDimmed = false

    private var pace: Pace? = null
    private var started = false
    private var running = false
    private var phaseIndex = 0
    private var cyclesDone = 0

    // Scale lag tracker for circle trail effect
    private var prevCircleScale = SCALE_MIN

    private lateinit var root: FrameLayout
    // Circle animation view (non-BOX paces)
    private var circle: FrameLayout? = null
    // Overlay canvas for trail ring drawn on top of circle (non-BOX paces)
    private var trailRingView: TrailRingView? = null
    // Box animation view (BOX pace)
    private var boxView: BoxAnimView? = null
    // Shared text labels
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

    // -----------------------------------------------------------------------
    // Custom view: ambient ripple overlay for the pace-picker screen
    // -----------------------------------------------------------------------

    /**
     * Draws slow ambient ripple rings (one ring every ~2.5s expanding+fading)
     * behind the pace picker title. Rings are very low alpha so they don't
     * distract. Driven by a repeating ValueAnimator.
     */
    inner class AmbientRippleView(context: Context, private val accentColor: Int) : View(context) {

        private val rings = mutableListOf<RippleRing>()
        private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 2f
        }
        private var cx = 0f
        private var cy = 0f
        private val maxRadius get() = width * 0.52f

        private val spawnIntervalMs = 2500L
        private var ambientAnim: ValueAnimator? = null

        override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
            super.onSizeChanged(w, h, oldw, oldh)
            cx = w / 2f
            cy = h * 0.18f // near the title area
        }

        fun startAmbient() {
            stopAmbient()
            // Spawn a new ring every interval using a repeating tiny-step animator
            var lastSpawnMs = 0L
            ambientAnim = ValueAnimator.ofFloat(0f, 1f).apply {
                duration = 100L
                repeatCount = ValueAnimator.INFINITE
                repeatMode = ValueAnimator.RESTART
                addUpdateListener {
                    val now = System.currentTimeMillis()
                    if (lastSpawnMs == 0L || now - lastSpawnMs >= spawnIntervalMs) {
                        lastSpawnMs = now
                        rings.add(RippleRing(radius = 0f, alpha = 0f))
                    }
                    val iter = rings.iterator()
                    while (iter.hasNext()) {
                        val r = iter.next()
                        r.radius += maxRadius / (spawnIntervalMs / 100f)
                        r.alpha = (1f - r.radius / maxRadius).coerceIn(0f, 1f) * 0.22f
                        if (r.radius >= maxRadius) iter.remove()
                    }
                    invalidate()
                }
                start()
            }
            activeAnimators.add(ambientAnim!!)
        }

        fun stopAmbient() {
            ambientAnim?.cancel()
            ambientAnim = null
            rings.clear()
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            for (ring in rings) {
                ringPaint.color = (accentColor and 0x00FFFFFF) or ((( ring.alpha * 255).toInt() shl 24) and 0xFF000000.toInt())
                canvas.drawCircle(cx, cy, ring.radius, ringPaint)
            }
        }
    }

    // -----------------------------------------------------------------------
    // Custom view: trail ring echo behind main circle (non-BOX paces)
    // -----------------------------------------------------------------------

    /**
     * Draws a lagging "water surface echo" ring behind the main circle's
     * current scale. prevScale lags currentScale by one update step,
     * producing a soft secondary ring at a slightly smaller scale.
     * Very low alpha (0.28) — only adds depth, never dominates.
     */
    inner class TrailRingView(context: Context, private val accentColor: Int) : View(context) {

        var currentScale: Float = SCALE_MIN
            set(value) {
                trailScale += (field - trailScale) * 0.18f  // lag toward prev
                field = value
                invalidate()
            }
        private var trailScale: Float = SCALE_MIN

        private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 3f
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            val cx = width / 2f
            val cy = height / 2f
            val baseR = (minOf(width, height) / 2f) * trailScale
            ringPaint.color = (accentColor and 0x00FFFFFF) or 0x47000000  // ~28% alpha
            canvas.drawCircle(cx, cy, baseR, ringPaint)
        }
    }

    // -----------------------------------------------------------------------
    // Custom view: animated square (BOX breathing)
    // -----------------------------------------------------------------------

    /**
     * Draws a rounded-square track with a glowing dot that travels around
     * it. Progress 0f = dot at bottom-left corner (start of INHALE = left
     * side going up). Each quarter (0–0.25, 0.25–0.5, 0.5–0.75, 0.75–1.0)
     * maps to one phase of box breathing:
     *
     *   0.00–0.25  INHALE  — left side, bottom → top
     *   0.25–0.50  HOLD    — top side,  left  → right
     *   0.50–0.75  EXHALE  — right side, top  → bottom
     *   0.75–1.00  HOLD    — bottom side, right → left
     */
    inner class BoxAnimView(context: Context, private val accentColor: Int) : View(context) {

        /** 0f–1f progress around the full box perimeter. */
        var progress: Float = 0f
            set(value) { field = value; invalidate() }

        private val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 0f // set in onSizeChanged
        }
        private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeCap = Paint.Cap.ROUND
        }
        private val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
        }
        private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
        }

        // Corner-ripple rings: list of (cx, cy, radius, alpha) — see CornerRing at file scope
        private val cornerRings = mutableListOf<CornerRing>()
        private val cornerRingPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 2f
        }

        private var boxRect = RectF()
        private var cornerR = 0f
        private var dotR = 0f
        private var strokeW = 0f

        override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
            super.onSizeChanged(w, h, oldw, oldh)
            val inset = w * 0.14f
            boxRect = RectF(inset, inset, w - inset, h - inset)
            cornerR = w * 0.08f
            strokeW = w * 0.025f
            dotR = w * 0.055f
            trackPaint.strokeWidth = strokeW
            glowPaint.strokeWidth = strokeW * 2.4f
            cornerRingPaint.strokeWidth = strokeW * 0.8f
        }

        /**
         * Spawns 2 quick corner-ripple rings emanating from the dot's current
         * position. Called on each BOX phase transition.
         */
        fun emitCornerRipple() {
            val (cx, cy) = dotPosition(progress)
            val maxR = dotR * 5f
            for (delay in listOf(0L, 160L)) {
                handler.postDelayed({
                    if (!running && !started) return@postDelayed
                    cornerRings.add(CornerRing(cx, cy, dotR * 0.5f, 0.65f))
                    // Animate out via repeated invalidation driven by the main draw loop
                    val anim = ValueAnimator.ofFloat(0f, 1f).apply {
                        duration = 700L
                        interpolator = AccelerateInterpolator()
                        addUpdateListener {
                            val frac = it.animatedFraction
                            val ring = cornerRings.lastOrNull() ?: return@addUpdateListener
                            ring.radius = dotR * 0.5f + frac * maxR
                            ring.alpha = (1f - frac) * 0.65f
                            invalidate()
                        }
                        addListener(object : AnimatorListenerAdapter() {
                            override fun onAnimationEnd(animation: Animator) {
                                cornerRings.removeLastOrNull()
                                activeAnimators.remove(animation)
                            }
                        })
                        start()
                    }
                    activeAnimators.add(anim)
                }, delay)
            }
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)

            // Track (dim version of accent)
            trackPaint.color = (accentColor and 0x00FFFFFF) or 0x33000000
            canvas.drawRoundRect(boxRect, cornerR, cornerR, trackPaint)

            // Filled interior glow
            val dimFill = (accentColor and 0x00FFFFFF) or 0x18000000
            fillPaint.color = dimFill
            canvas.drawRoundRect(boxRect, cornerR, cornerR, fillPaint)

            // Corner ripple rings
            for (ring in cornerRings) {
                val alpha = ((ring.alpha * 255).toInt()).coerceIn(0, 255)
                cornerRingPaint.color = (accentColor and 0x00FFFFFF) or (alpha shl 24)
                canvas.drawCircle(ring.cx, ring.cy, ring.radius, cornerRingPaint)
            }

            // Dot position on the perimeter
            val (cx, cy) = dotPosition(progress)

            // Glow halo behind dot
            glowPaint.color = (accentColor and 0x00FFFFFF) or 0x44000000
            canvas.drawCircle(cx, cy, dotR * 2.2f, glowPaint)

            // Dot
            dotPaint.color = accentColor
            canvas.drawCircle(cx, cy, dotR, dotPaint)
        }

        /**
         * Maps progress 0–1 to (x, y) on the rounded-square perimeter.
         * Corners are approximated as quarter-circles; straight sides fill
         * the remaining perimeter. For small watches the corner arcs are
         * small so this stays visually accurate.
         */
        fun dotPosition(p: Float): Pair<Float, Float> {
            val l = boxRect.left
            val t = boxRect.top
            val r = boxRect.right
            val b = boxRect.bottom
            val w = r - l
            val h = b - t
            val cr = cornerR.coerceAtMost(w / 2f).coerceAtMost(h / 2f)

            // Straight segment lengths
            val straightH = h - 2 * cr
            val straightW = w - 2 * cr
            val arcLen = (Math.PI * cr / 2).toFloat()

            // Total perimeter
            val totalLen = 2 * (straightH + straightW) + 4 * arcLen
            val pos = (p % 1f) * totalLen

            // Walk around: start at bottom-left corner (start of left-up segment),
            // going clockwise: left-up, TL-arc, top-right, TR-arc, right-down,
            // BR-arc, bottom-left, BL-arc.
            var rem = pos
            fun arc(cx: Float, cy: Float, startAngle: Double, rem2: Float): Pair<Float, Float> {
                val frac = rem2 / arcLen
                val angle = startAngle + frac * (Math.PI / 2)
                return Pair((cx + cr * Math.cos(angle)).toFloat(), (cy + cr * Math.sin(angle)).toFloat())
            }

            // 1. Left side: bottom-left (below TL corner) → top-left (above BL corner), going UP
            val seg1 = straightH
            if (rem < seg1) {
                return Pair(l, b - cr - rem)
            }
            rem -= seg1

            // 2. TL arc: from top of left side → start of top side
            if (rem < arcLen) {
                return arc(l + cr, t + cr, Math.PI, rem)
            }
            rem -= arcLen

            // 3. Top side: left → right
            val seg3 = straightW
            if (rem < seg3) {
                return Pair(l + cr + rem, t)
            }
            rem -= seg3

            // 4. TR arc
            if (rem < arcLen) {
                return arc(r - cr, t + cr, -Math.PI / 2, rem)
            }
            rem -= arcLen

            // 5. Right side: top → bottom
            val seg5 = straightH
            if (rem < seg5) {
                return Pair(r, t + cr + rem)
            }
            rem -= seg5

            // 6. BR arc
            if (rem < arcLen) {
                return arc(r - cr, b - cr, 0.0, rem)
            }
            rem -= arcLen

            // 7. Bottom side: right → left
            val seg7 = straightW
            if (rem < seg7) {
                return Pair(r - cr - rem, b)
            }
            rem -= seg7

            // 8. BL arc (back to start)
            return arc(l + cr, b - cr, Math.PI / 2, rem.coerceAtMost(arcLen))
        }
    }

    // -----------------------------------------------------------------------
    // Activity lifecycle
    // -----------------------------------------------------------------------

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

        // If the phone pushed a default pace, skip the picker
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
        val px: (Int) -> Int = { v -> (v * density).toInt() }

        root.removeAllViews()
        cancelAllRippleAnimators()

        // Ambient ripple overlay (behind content, pointer-events transparent)
        val displayWidth = resources.displayMetrics.widthPixels
        val displayHeight = resources.displayMetrics.heightPixels
        // Use the first accent color (BOX teal) as a neutral ambient hue
        val ambientView = AmbientRippleView(this, Pace.BOX.accent)
        root.addView(ambientView, FrameLayout.LayoutParams(displayWidth, displayHeight, Gravity.TOP))
        ambientView.isClickable = false
        ambientView.isFocusable = false

        val scroll = ScrollView(this).apply {
            isVerticalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER
        }
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            // 20dp sides to keep text off round-bezel clipping zone
            setPadding(px(20), px(28), px(20), px(24))
        }

        col.addView(TextView(this).apply {
            text = "BREATHE"
            textSize = 15f
            setTextColor(WHITE)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            letterSpacing = 0.18f
        })
        col.addView(TextView(this).apply {
            text = "PICK A PACE"
            textSize = 10f
            setTextColor(LABEL_GRAY)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            letterSpacing = 0.15f
            setPadding(0, px(4), 0, px(12))
        })

        Pace.values().forEachIndexed { i, p ->
            val row = paceRow(px, p)
            row.alpha = 0f
            row.translationY = px(14).toFloat()
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

        // Start ambient ripples after layout
        root.post { ambientView.startAmbient() }
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
        // Pace title — e.g. "BOX", "RELAX"
        card.addView(TextView(this).apply {
            text = p.title
            textSize = 16f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setTextColor(p.accent)
            gravity = Gravity.CENTER
            letterSpacing = 0.14f
        })
        // Subtitle — e.g. "4·4·4·4 — stress reset" (fits within ~140dp at 11sp)
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

    /**
     * Session screen — redesigned for full round-face use:
     *
     *  [phase label — above animation]
     *  [animation — circle ~180dp OR box ~160dp, centered]
     *  [countdown number — overlaid on animation center]
     *  [cycle count / tap hint — below animation]
     *
     * The phase text and cycle counter are NOT inside the animation view —
     * they sit in the full-width FrameLayout rows above/below, so they can
     * use the natural watch-face width without being clipped by a circle.
     */
    private fun startSession() {
        val p = pace ?: return
        val density = resources.displayMetrics.density
        fun px(v: Int) = (v * density).toInt()

        cancelAllRippleAnimators()
        root.removeAllViews()
        circle = null
        trailRingView = null
        boxView = null

        // ── Phase label (above animation) ───────────────────────────────────
        phaseLabel = TextView(this).apply {
            textSize = 20f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setTextColor(WHITE)
            gravity = Gravity.CENTER
            letterSpacing = 0.12f
            // Needs safe horizontal inset for round face: 18dp each side
            setPadding(px(18), 0, px(18), 0)
        }
        val phaseLp = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.TOP or Gravity.CENTER_HORIZONTAL
        ).apply { topMargin = px(22) }
        root.addView(phaseLabel, phaseLp)

        // ── Animation (center) ──────────────────────────────────────────────
        if (p == Pace.BOX) {
            // Box animation: rounded-square with a travelling dot
            val boxSize = px(150)
            boxView = BoxAnimView(this, p.accent).apply {
                progress = 0f
            }
            root.addView(boxView, FrameLayout.LayoutParams(boxSize, boxSize, Gravity.CENTER))
        } else {
            // Circle animation: expand/contract filled oval
            val circleSize = px(168)
            val dimAccent = (p.accent and 0x00FFFFFF) or 0x33000000
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

            // Trail ring view — same size as circle, drawn after (on top)
            trailRingView = TrailRingView(this, p.accent).apply {
                currentScale = SCALE_MIN
            }
            root.addView(trailRingView, FrameLayout.LayoutParams(circleSize, circleSize, Gravity.CENTER))
            prevCircleScale = SCALE_MIN
        }

        // ── Countdown number (centered over animation) ──────────────────────
        countLabel = TextView(this).apply {
            textSize = 26f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setTextColor(p.accent)
            gravity = Gravity.CENTER
        }
        root.addView(countLabel, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER
        ))

        // ── Cycle / hint label (below animation) ────────────────────────────
        cycleLabel = TextView(this).apply {
            textSize = 11f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setTextColor(LABEL_GRAY)
            gravity = Gravity.CENTER
            letterSpacing = 0.15f
            setPadding(px(18), 0, px(18), 0)
        }
        root.addView(cycleLabel, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
        ).apply { bottomMargin = px(22) })

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
        if (pace == Pace.BOX) {
            // For box view: gently pulse the progress (stays at 0 to show full track)
            idleAnimator = ValueAnimator.ofFloat(0f, 0.015f).apply {
                duration = 1600L
                repeatCount = ValueAnimator.INFINITE
                repeatMode = ValueAnimator.REVERSE
                interpolator = AccelerateDecelerateInterpolator()
                addUpdateListener { a -> boxView?.progress = a.animatedValue as Float }
                start()
            }
        } else {
            idleAnimator = ValueAnimator.ofFloat(SCALE_MIN, SCALE_MIN + 0.07f).apply {
                duration = 1600L
                repeatCount = ValueAnimator.INFINITE
                repeatMode = ValueAnimator.REVERSE
                interpolator = AccelerateDecelerateInterpolator()
                addUpdateListener { a ->
                    val s = a.animatedValue as Float
                    circle?.scaleX = s
                    circle?.scaleY = s
                    trailRingView?.currentScale = s
                }
                start()
            }
        }
    }

    /** 3-2-1 lead-in so the user can settle before the first inhale. */
    private fun startCountdown() {
        started = true
        running = true
        sessionStartMs = System.currentTimeMillis()
        isDimmed = false
        scheduleDim()
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

        // Phase-transition ripple rings (non-BOX, concentric burst)
        if (p != Pace.BOX) {
            emitPhaseTransitionRipples(p.accent)
        }

        animator?.cancel()

        if (p == Pace.BOX) {
            // BOX: animate the dot around the square. Each phase is one quarter
            // of the perimeter. Phase index 0–3 → progress range 0–0.25 etc.
            val fromProgress = phaseIndex / 4f
            val toProgress = (phaseIndex + 1) / 4f
            // Emit corner ripple at dot's position at start of each BOX phase
            boxView?.emitCornerRipple()
            animator = ValueAnimator.ofFloat(fromProgress, toProgress).apply {
                duration = phaseMs
                interpolator = LinearInterpolator()
                addUpdateListener { a -> boxView?.progress = a.animatedValue as Float }
                start()
            }
        } else {
            when (name) {
                "INHALE"  -> { animateCircle(currentScale(), SCALE_MAX, phaseMs, p.curve); spawnRipple(phaseMs) }
                "TOP-UP"  -> animateCircle(currentScale(), SCALE_MAX + 0.08f, phaseMs, Curve.SNAPPY)
                "EXHALE"  -> animateCircle(currentScale(), SCALE_MIN, phaseMs, p.curve)
                else      -> animator = null  // HOLD: hold current scale
            }
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

    /**
     * Emits 2–3 concentric ripple rings from the animation center on each
     * phase transition. Rings use thin strokes at low alpha, staggered ~150ms.
     * Duration ~800ms each. Non-BOX paces only.
     */
    private fun emitPhaseTransitionRipples(accentColor: Int) {
        val density = resources.displayMetrics.density
        val size = (168 * density).toInt()
        val ringCount = 3
        val staggerMs = 150L
        for (i in 0 until ringCount) {
            handler.postDelayed({
                if (!running) return@postDelayed
                val ring = View(this).apply {
                    background = GradientDrawable().apply {
                        shape = GradientDrawable.OVAL
                        setColor(0x00000000)
                        setStroke((1.5f * density).toInt().coerceAtLeast(1), accentColor)
                    }
                    alpha = 0.45f
                    scaleX = currentScale()
                    scaleY = currentScale()
                }
                root.addView(ring, 0, FrameLayout.LayoutParams(size, size, Gravity.CENTER))
                ring.animate()
                    .scaleX(1.5f)
                    .scaleY(1.5f)
                    .alpha(0f)
                    .setDuration(800L)
                    .setInterpolator(AccelerateDecelerateInterpolator())
                    .withEndAction { root.removeView(ring) }
                    .start()
            }, i * staggerMs)
        }
    }

    /** Thin ring that expands past the circle and fades — the "ripple". */
    private fun spawnRipple(phaseMs: Long) {
        val p = pace ?: return
        val density = resources.displayMetrics.density
        val size = (168 * density).toInt()
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
                // Update trail ring with current scale; it lags internally
                trailRingView?.currentScale = s
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

    /**
     * Completion celebration: burst of 3–4 expanding ripple rings with
     * staggered delays + gentle triple-pulse haptic, then calls finish().
     */
    private fun celebrateCompletion() {
        val p = pace ?: run { finish(); return }
        val density = resources.displayMetrics.density
        val size = (168 * density).toInt()
        val ringCount = 4
        val staggerMs = 120L

        // Gentle celebration haptic — triple short pulses
        try {
            vibrator?.vibrate(
                VibrationEffect.createWaveform(longArrayOf(0, 60, 80, 60, 80, 60), -1)
            )
        } catch (_: Exception) {}

        for (i in 0 until ringCount) {
            handler.postDelayed({
                val ring = View(this).apply {
                    background = GradientDrawable().apply {
                        shape = GradientDrawable.OVAL
                        setColor(0x00000000)
                        setStroke((2 * density).toInt(), p.accent)
                    }
                    alpha = 0.7f
                    scaleX = 0.5f
                    scaleY = 0.5f
                }
                root.addView(ring, 0, FrameLayout.LayoutParams(size, size, Gravity.CENTER))
                ring.animate()
                    .scaleX(1.8f).scaleY(1.8f)
                    .alpha(0f)
                    .setDuration(900L)
                    .setInterpolator(AccelerateDecelerateInterpolator())
                    .withEndAction { root.removeView(ring) }
                    .start()
            }, i * staggerMs)
        }

        // Finish after the last ring has expanded
        handler.postDelayed({ finish() }, ringCount * staggerMs + 950L)
    }

    private fun stopAndFinish() {
        running = false
        handler.removeCallbacks(dimRunnable)
        restoreScreenBrightness()
        handler.removeCallbacksAndMessages(null)
        animator?.cancel()
        idleAnimator?.cancel()
        cancelAllRippleAnimators()

        val p = pace
        if (p != null && cyclesDone >= 1) {
            val durationSecs = p.phaseSeconds.sum() * cyclesDone
            sendSessionToPhone(p.id, cyclesDone, durationSecs)
            celebrateCompletion()
        } else {
            finish()
        }
    }

    /** Cancels all tracked ripple/ambient animators and clears the list. */
    private fun cancelAllRippleAnimators() {
        for (anim in activeAnimators) {
            try { anim.cancel() } catch (_: Exception) {}
        }
        activeAnimators.clear()
    }

    /**
     * Sends a completed breathing session to the phone via MessageClient so
     * the phone can log mindfulness minutes.
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

    // ── Item 5: ambient brightness dim after 60s ────────────────────────────

    private fun scheduleDim() {
        handler.removeCallbacks(dimRunnable)
        handler.postDelayed(dimRunnable, 60_000L)
    }

    private fun dimScreenForAmbient() {
        isDimmed = true
        try {
            val lp = window.attributes
            lp.screenBrightness = 0.01f
            window.attributes = lp
        } catch (_: Exception) {}
    }

    private fun restoreScreenBrightness() {
        if (!isDimmed) return
        isDimmed = false
        try {
            val lp = window.attributes
            lp.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
            window.attributes = lp
        } catch (_: Exception) {}
        scheduleDim()
    }

    override fun onUserInteraction() {
        super.onUserInteraction()
        restoreScreenBrightness()
    }

    override fun onPause() {
        super.onPause()
        handler.removeCallbacks(dimRunnable)
        if (running) {
            running = false
            handler.removeCallbacksAndMessages(null)
            animator?.cancel()
            idleAnimator?.cancel()
            cancelAllRippleAnimators()
            finish()
        }
    }

    override fun onDestroy() {
        running = false
        handler.removeCallbacksAndMessages(null)
        animator?.cancel()
        idleAnimator?.cancel()
        cancelAllRippleAnimators()
        super.onDestroy()
    }
}
