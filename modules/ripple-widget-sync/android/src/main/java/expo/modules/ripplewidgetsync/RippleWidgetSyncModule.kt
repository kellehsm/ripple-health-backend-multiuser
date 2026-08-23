package expo.modules.ripplewidgetsync

import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class RippleWidgetSyncModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RippleWidgetSync")

    // Fire-and-forget: asks RippleWidgetProvider to refetch metrics and push
    // them to any paired Wear OS device (and re-render pinned widgets).
    // Explicit broadcast by class name — no compile-time dep on the app package.
    Function("syncNow") {
      val context = appContext.reactContext ?: return@Function
      val intent = Intent("com.kellehs.wellness.WIDGET_WEAR_SYNC")
        .setClassName(context.packageName, "com.kellehs.wellness.RippleWidgetProvider")
      context.sendBroadcast(intent)
    }
  }
}
