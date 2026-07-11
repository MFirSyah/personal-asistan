package com.example.personal_asistan_flutter

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.os.Build
import android.util.Log
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/**
 * NotificationListenerService - Android Native Notification Monitor
 *
 * Arsitektur Reference: Bagian 3, 14
 *
 * This service captures all notifications from the device and streams them
 * to Flutter via EventChannel. It also performs rule-based pre-filtering
 * to reduce unnecessary API calls to Gemini.
 *
 * IMPORTANT: User must manually grant notification access in Settings:
 * Settings > Apps > Notification access > Personal Asistan
 */
class NotificationListener : NotificationListenerService() {

    companion object {
        private const val TAG = "NotificationListener"
        private const val EVENT_CHANNEL = "com.personal_asistan/notifications"
        private const val METHOD_CHANNEL = "com.personal_asistan/notification_methods"

        // Keywords for rule-based pre-filtering
        private val HIGH_PRIORITY_KEYWORDS = listOf(
            "meeting", "reminder", "urgent", "deadline", "jatuh tempo",
            "penting", "segera", "otp", "verification", "security"
        )

        private val FINANCE_APPS = listOf(
            "com.google.android.apps.pixel.assistant",
            "com.bca",
            "com.bni",
            "com.bankmandiri",
            "com.banksinarmas",
            "com.shopeepay",
            "com.gojek",
            "com.grabtaxi",
            "com.oyowallet",
            "com.dana"
        )

        private val SOCIAL_APPS = listOf(
            "com.whatsapp",
            "org.telegram.messenger",
            "com.facebook.katana",
            "com.instagram.android",
            "com.twitter.android",
            "com.discord"
        )

        private val CALENDAR_APPS = listOf(
            "com.google.android.calendar",
            "com.android.calendar",
            "com.microsoft.office.outlook"
        )
    }

    private var eventSink: EventChannel.EventSink? = null

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "NotificationListenerService created")
    }

    override fun onDestroy() {
        eventSink = null
        super.onDestroy()
        Log.d(TAG, "NotificationListenerService destroyed")
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        sbn ?: return

        try {
            val notification = processNotification(sbn)

            // Only forward non-noise notifications to Flutter
            if (notification.priority != "noise") {
                eventSink?.success(notification.toMap())
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error processing notification: ${e.message}")
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        sbn ?: return
        Log.d(TAG, "Notification removed: ${sbn.packageName}")
    }

    /**
     * Process a notification and determine its priority using rule-based filtering
     */
    private fun processNotification(sbn: StatusBarNotification): ProcessedNotification {
        val packageName = sbn.packageName
        val extras = sbn.notification.extras

        val title = extras.getCharSequence("android.title")?.toString() ?: ""
        val text = extras.getCharSequence("android.text")?.toString() ?: ""
        val postTime = sbn.postTime

        // Rule-based priority detection
        val priority = determinePriority(packageName, title, text)
        val category = determineCategory(packageName, title, text)
        val requiresAiReview = shouldRequireAiReview(packageName, title, text, priority)

        return ProcessedNotification(
            id = sbn.key,
            packageName = packageName,
            title = title,
            text = text,
            postTime = postTime,
            priority = priority,
            category = category,
            requiresAiReview = requiresAiReview
        )
    }

    /**
     * Determine notification priority using rules
     */
    private fun determinePriority(packageName: String, title: String, text: String): String {
        val content = "$title $text".lowercase()

        // Check for urgent keywords
        for (keyword in HIGH_PRIORITY_KEYWORDS) {
            if (content.contains(keyword)) {
                return when {
                    content.contains("urgent") || content.contains("otp") -> "urgent"
                    content.contains("meeting") || content.contains("reminder") -> "important"
                    else -> "important"
                }
            }
        }

        // Finance and calendar apps are always important
        for (app in FINANCE_APPS) {
            if (packageName.contains(app) || app.contains(packageName.substringAfterLast("."))) {
                return "important"
            }
        }

        for (app in CALENDAR_APPS) {
            if (packageName.contains(app) || app.contains(packageName.substringAfterLast("."))) {
                return "important"
            }
        }

        // Social apps with important keywords
        for (app in SOCIAL_APPS) {
            if (packageName.contains(app)) {
                if (content.contains("missed") || content.contains("call") ||
                    content.contains("video") || content.contains("group")) {
                    return "important"
                }
            }
        }

        // Default to informational
        return "informational"
    }

    /**
     * Determine notification category
     */
    private fun determineCategory(packageName: String, title: String, text: String): String {
        val content = "$title $text".lowercase()

        // Finance category
        for (app in FINANCE_APPS) {
            if (packageName.contains(app)) return "finance"
        }

        if (content.contains("transfer") || content.contains("pembayaran") ||
            content.contains("top up") || content.contains("saldo")) {
            return "finance"
        }

        // Meeting category
        if (content.contains("meeting") || content.contains("zoom") ||
            content.contains("google meet") || content.contains(" Teams")) {
            return "meeting"
        }

        // Message category
        for (app in SOCIAL_APPS) {
            if (packageName.contains(app)) return "message"
        }

        return "other"
    }

    /**
     * Determine if notification requires AI review (Gemini classification)
     */
    private fun shouldRequireAiReview(
        packageName: String,
        title: String,
        text: String,
        priority: String
    ): Boolean {
        // Only review "important" priority notifications
        // "urgent" is already handled, "informational" is skipped
        if (priority == "important") {
            return true
        }

        // Also review if any high priority keywords found
        val content = "$title $text".lowercase()
        for (keyword in HIGH_PRIORITY_KEYWORDS) {
            if (content.contains(keyword)) {
                return true
            }
        }

        return false
    }

    /**
     * Data class for processed notification
     */
    data class ProcessedNotification(
        val id: String,
        val packageName: String,
        val title: String,
        val text: String,
        val postTime: Long,
        val priority: String,
        val category: String,
        val requiresAiReview: Boolean
    ) {
        fun toMap(): Map<String, Any?> = mapOf(
            "id" to id,
            "package_name" to packageName,
            "title" to title,
            "text" to text,
            "post_time" to postTime,
            "post_time_iso" to java.text.SimpleDateFormat(
                "yyyy-MM-dd'T'HH:mm:ss.SSSZ",
                java.util.Locale.getDefault()
            ).format(java.util.Date(postTime)),
            "priority" to priority,
            "category" to category,
            "requires_ai_review" to requiresAiReview
        )
    }

    /**
     * Setup Flutter event channel
     */
    override fun onBind(intent: android.content.Intent?): android.os.IBinder? {
        val binder = super.onBind(intent)

        // Note: FlutterEngine is not directly accessible here
        // EventChannel will be setup from MainActivity
        return binder
    }

    /**
     * Method channel handler for Flutter communication
     */
    fun handleMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "getPermissionStatus" -> {
                // Check if notification access is granted
                val hasAccess = NotificationListenerCompat.hasAccess(this)
                result.success(hasAccess)
            }
            "openNotificationSettings" -> {
                // Open system notification access settings
                try {
                    val intent = android.content.Intent(
                        "android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"
                    )
                    intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                    startActivity(intent)
                    result.success(true)
                } catch (e: Exception) {
                    result.error("SETTINGS_ERROR", "Cannot open settings: ${e.message}", null)
                }
            }
            "getListenerPackages" -> {
                // Get list of apps with notification access
                val packages = activeNotifications?.map { it.packageName } ?: emptyList()
                result.success(packages)
            }
            else -> result.notImplemented()
        }
    }

    /**
     * Set event sink for streaming notifications to Flutter
     */
    fun setEventSink(sink: EventChannel.EventSink?) {
        this.eventSink = sink
    }
}

/**
 * Compatibility class for checking notification access
 */
object NotificationListenerCompat {
    fun hasAccess(service: NotificationListenerService?): Boolean {
        if (service == null) return false
        return try {
            val method = NotificationListenerService::class.java.getMethod("isAccessGranted")
            method.invoke(service) as? Boolean ?: false
        } catch (e: Exception) {
            // Fallback: try to get active notifications
            try {
                service.activeNotifications?.isNotEmpty() == true
            } catch (e2: Exception) {
                false
            }
        }
    }
}
