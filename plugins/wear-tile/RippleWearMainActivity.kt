package com.kellehs.wellness.wear

import android.app.Activity
import android.content.Intent
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Minimal placeholder activity so the wear APK is installable. Users are
 * expected to interact with the Ripple tile, not this screen — but Wear OS
 * requires at least one launcher activity for the app to appear in the app drawer.
 */
class RippleWearMainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(0xFFF5F1E8.toInt())
            setPadding(24, 24, 24, 24)
        }

        root.addView(TextView(this).apply {
            text = "Ripple"
            textSize = 22f
            setTextColor(0xFF3FA0A6.toInt())
            gravity = Gravity.CENTER
        })

        root.addView(TextView(this).apply {
            text = "Long-press your watch face → Tiles → add Ripple."
            textSize = 12f
            setTextColor(0xFF5A5A5A.toInt())
            gravity = Gravity.CENTER
            setPadding(0, 12, 0, 0)
        })

        val density = resources.displayMetrics.density
        root.addView(TextView(this).apply {
            text = "🫁  Breathe"
            textSize = 14f
            setTextColor(0xFFFFFFFF.toInt())
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = 22 * density
                setColor(0xFF3FA0A6.toInt())
            }
            setPadding((20 * density).toInt(), (10 * density).toInt(), (20 * density).toInt(), (10 * density).toInt())
            setOnClickListener {
                startActivity(Intent(this@RippleWearMainActivity, RippleWearBreathingActivity::class.java))
            }
        }, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = (16 * density).toInt(); gravity = Gravity.CENTER_HORIZONTAL })

        setContentView(root)
    }
}
