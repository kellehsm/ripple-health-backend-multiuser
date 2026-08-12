package com.kellehs.wellness.wear

import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.util.Log
import android.view.Gravity
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import com.google.android.gms.wearable.Node
import com.google.android.gms.wearable.Wearable

/**
 * Log face — presents the "+ LOG GLASS" and mood pills as tappable buttons.
 * Since Wear OS tiles can't host free-form interactive controls, this is
 * launched from the Log tile (or from the main tile on tap).
 *
 * Water and mood logging are done by sending a MessageClient message to the
 * phone (see the phone-side WearMessageListenerService in
 * WearMessageListener.kt.template). That way the auth token / API client
 * lives only on the phone; the watch never handles credentials.
 */
class RippleWearLogActivity : Activity() {

    private lateinit var waterCountLabel: TextView
    private var localWaterCount = 0
    private var localGoal = 8

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Read cached water count so the pill starts from the real value
        val cache = WearCache.read(this)
        val parts = cache.water.split("/").map { it.trim() }
        localWaterCount = parts.getOrNull(0)?.toIntOrNull() ?: 0
        localGoal = parts.getOrNull(1)?.toIntOrNull() ?: 8

        val density = resources.displayMetrics.density
        fun px(dp: Int) = (dp * density).toInt()

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setBackgroundColor(0xFF10141A.toInt())
            setPadding(px(20), px(28), px(20), px(20))
        }

        root.addView(TextView(this).apply {
            text = "RIPPLE"
            textSize = 12f
            setTextColor(0xFF4ECDC4.toInt())
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
        })

        root.addView(TextView(this).apply {
            text = "WATER — GLASSES"
            textSize = 10f
            setTextColor(0xFF8A93A0.toInt())
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setPadding(0, px(8), 0, px(4))
        })

        waterCountLabel = TextView(this).apply {
            textSize = 34f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setTextColor(0xFF5EA0F0.toInt())
            gravity = Gravity.CENTER
            text = "$localWaterCount / $localGoal"
        }
        root.addView(waterCountLabel)

        // + LOG GLASS button
        root.addView(TextView(this).apply {
            text = "+ LOG GLASS"
            textSize = 14f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setTextColor(0xFF0B1018.toInt())
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = 999f
                setColor(0xFF5EA0F0.toInt())
            }
            setPadding(px(24), px(10), px(24), px(10))
            setOnClickListener {
                // Optimistic bump; the phone will authoritative-refresh via
                // the data-layer push after its API call completes.
                localWaterCount = (localWaterCount + 1).coerceAtMost(localGoal)
                waterCountLabel.text = "$localWaterCount / $localGoal"
                sendMessage(PATH_LOG_WATER, ByteArray(0))
            }
        }, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = px(14) })

        // Mood pills row
        root.addView(TextView(this).apply {
            text = "MOOD"
            textSize = 10f
            setTextColor(0xFF8A93A0.toInt())
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setPadding(0, px(16), 0, px(6))
        })

        val moodRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }
        listOf("LOW" to 2, "OK" to 3, "GOOD" to 4).forEach { (label, score) ->
            val pill = TextView(this).apply {
                text = label
                textSize = 12f
                typeface = android.graphics.Typeface.DEFAULT_BOLD
                setTextColor(0xFFF2F4F7.toInt())
                gravity = Gravity.CENTER
                background = GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE
                    cornerRadius = 999f
                    setStroke(px(2), 0xFF232B36.toInt())
                }
                setPadding(px(14), px(7), px(14), px(7))
                setOnClickListener {
                    setTextColor(0xFFB79CFF.toInt())
                    (background as GradientDrawable).setStroke(px(2), 0xFFB79CFF.toInt())
                    // Send a message with the mood score as one byte in the payload
                    sendMessage(PATH_LOG_MOOD, byteArrayOf(score.toByte()))
                }
            }
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { marginStart = px(4); marginEnd = px(4) }
            moodRow.addView(pill, lp)
        }
        root.addView(moodRow)

        setContentView(root)
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
    }
}
