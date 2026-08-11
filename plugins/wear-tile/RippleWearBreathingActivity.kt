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
import android.view.Gravity
import android.view.WindowManager
import android.view.animation.LinearInterpolator
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Haptic-guided box breathing (4-4-4-4) for the wrist. The circle grows on
 * inhale, holds, shrinks on exhale — each phase change is marked with a
 * distinct vibration so the practice works eyes-closed.
 */
class RippleWearBreathingActivity : Activity() {

    private val handler = Handler(Looper.getMainLooper())
    private var vibrator: Vibrator? = null
    private var animator: ValueAnimator? = null
    private var running = false
    private var phaseIndex = 0
    private var cyclesDone = 0

    private lateinit var circle: FrameLayout
    private lateinit var phaseLabel: TextView
    private lateinit var countLabel: TextView
    private lateinit var cycleLabel: TextView

    companion object {
        private val BG = 0xFF10141A.toInt()
        private val TEAL = 0xFF4ECDC4.toInt()
        private const val TEAL_DIM = 0x334ECDC4
        private val LABEL_GRAY = 0xFF8A93A0.toInt()
        private val WHITE = 0xFFF2F4F7.toInt()

        private const val PHASE_MS = 4000L
        private val PHASE_NAMES = arrayOf("INHALE", "HOLD", "EXHALE", "HOLD")
        private const val SCALE_MIN = 0.55f
        private const val SCALE_MAX = 1.0f
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

        val density = resources.displayMetrics.density
        fun dp(v: Int) = (v * density).toInt()

        val root = FrameLayout(this).apply { setBackgroundColor(BG) }

        val circleSize = dp(140)
        circle = FrameLayout(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(TEAL_DIM)
                setStroke(dp(3), TEAL)
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
            text = "BREATHE"
            textSize = 15f
            setTextColor(WHITE)
            gravity = Gravity.CENTER
            letterSpacing = 0.1f
        }
        countLabel = TextView(this).apply {
            text = "tap to start"
            textSize = 11f
            setTextColor(LABEL_GRAY)
            gravity = Gravity.CENTER
        }
        cycleLabel = TextView(this).apply {
            text = "box 4·4·4·4"
            textSize = 9f
            setTextColor(LABEL_GRAY)
            gravity = Gravity.CENTER
        }
        col.addView(phaseLabel)
        col.addView(countLabel)
        col.addView(cycleLabel)
        root.addView(col, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER))

        root.setOnClickListener {
            if (running) stopAndFinish() else startBreathing()
        }

        setContentView(root)
    }

    private fun startBreathing() {
        running = true
        phaseIndex = 0
        cyclesDone = 0
        cycleLabel.text = "tap to end"
        runPhase()
    }

    private fun runPhase() {
        if (!running) return
        val name = PHASE_NAMES[phaseIndex]
        phaseLabel.text = name
        vibrateForPhase(phaseIndex)

        animator?.cancel()
        when (phaseIndex) {
            0 -> animateCircle(SCALE_MIN, SCALE_MAX)  // inhale: grow
            2 -> animateCircle(SCALE_MAX, SCALE_MIN)  // exhale: shrink
            else -> animator = null                    // hold: stay
        }

        // 4-3-2-1 countdown inside the phase
        for (i in 0 until 4) {
            handler.postDelayed({
                if (running) countLabel.text = (4 - i).toString()
            }, i * 1000L)
        }

        handler.postDelayed({
            if (!running) return@postDelayed
            phaseIndex = (phaseIndex + 1) % 4
            if (phaseIndex == 0) {
                cyclesDone += 1
                cycleLabel.text = if (cyclesDone == 1) "1 cycle · tap to end" else "$cyclesDone cycles · tap to end"
            }
            runPhase()
        }, PHASE_MS)
    }

    private fun animateCircle(from: Float, to: Float) {
        animator = ValueAnimator.ofFloat(from, to).apply {
            duration = PHASE_MS
            interpolator = LinearInterpolator()
            addUpdateListener { a ->
                val s = a.animatedValue as Float
                circle.scaleX = s
                circle.scaleY = s
            }
            start()
        }
    }

    private fun vibrateForPhase(phase: Int) {
        val v = vibrator ?: return
        val effect = when (phase) {
            0 -> VibrationEffect.createWaveform(longArrayOf(0, 80, 80, 80), -1)          // inhale: two short pulses
            2 -> VibrationEffect.createOneShot(300, VibrationEffect.DEFAULT_AMPLITUDE)   // exhale: one long pulse
            else -> VibrationEffect.createOneShot(50, VibrationEffect.DEFAULT_AMPLITUDE) // hold: tick
        }
        try { v.vibrate(effect) } catch (_: Exception) {}
    }

    private fun stopAndFinish() {
        running = false
        handler.removeCallbacksAndMessages(null)
        animator?.cancel()
        finish()
    }

    override fun onPause() {
        super.onPause()
        if (running) stopAndFinish()
    }

    override fun onDestroy() {
        running = false
        handler.removeCallbacksAndMessages(null)
        animator?.cancel()
        super.onDestroy()
    }
}
