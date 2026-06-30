import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:http/http.dart' as http;

import 'config.dart';

/// NotificationService - Singleton service for handling FCM push notifications
///
/// Usage:
/// ```dart
/// // Initialize in main()
/// await NotificationService().initialize();
///
/// // Listen for notifications
/// NotificationService().onNotification.listen((data) {
///   // Handle notification
/// });
/// ```
class NotificationService {
  static final NotificationService _instance = NotificationService._internal();
  factory NotificationService() => _instance;
  NotificationService._internal();

  // Lazy initialization - don't call FirebaseMessaging.instance in constructor
  // This prevents "No Firebase App has been created" error
  FirebaseMessaging? _firebaseMessaging;
  final FlutterLocalNotificationsPlugin _localNotifications = FlutterLocalNotificationsPlugin();

  // Stream controller for notification events
  final StreamController<Map<String, dynamic>> _notificationController =
      StreamController<Map<String, dynamic>>.broadcast();

  /// Stream of incoming notifications (foreground and tap)
  Stream<Map<String, dynamic>> get onNotification => _notificationController.stream;

  bool _isInitialized = false;
  String? _currentToken;

  // Notification action handlers
  Function(Map<String, dynamic>)? _onBriefingTapped;
  Function(String taskId)? _onTaskTapped;
  Function()? _onChatTapped;
  Function(String transactionId)? _onTransactionTapped;

  /// Initialize the notification service
  /// Call this once in main() after Supabase.initialize()
  Future<void> initialize() async {
    if (_isInitialized) return;
    _isInitialized = true;

    print('NotificationService: Initializing...');

    // Initialize FirebaseMessaging lazily
    _firebaseMessaging ??= FirebaseMessaging.instance;

    // Initialize local notifications plugin
    await _initializeLocalNotifications();

    // Request permission
    final settings = await _requestPermission();
    print('NotificationService: Permission status: ${settings.authorizationStatus}');

    if (settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional) {

      // Get and register FCM token
      await _registerToken();

      // Listen for token refresh
      _firebaseMessaging!.onTokenRefresh.listen(_handleTokenRefresh);

      // Handle foreground messages
      FirebaseMessaging.onMessage.listen(_handleForegroundMessage);

      // Handle when app opened from notification
      FirebaseMessaging.onMessageOpenedApp.listen(_handleMessageOpenedApp);

      // Check if app opened via notification (cold start)
      final initialMessage = await _firebaseMessaging!.getInitialMessage();
      if (initialMessage != null) {
        _handleMessageOpenedApp(initialMessage);
      }

      // Set up notification action handlers
      _setupNotificationActionHandlers();
    }

    print('NotificationService: Initialization complete');
  }

  /// Initialize FlutterLocalNotificationsPlugin for foreground display
  Future<void> _initializeLocalNotifications() async {
    const androidSettings = AndroidInitializationSettings('@mipmap/launcher_icon');
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );

    const initSettings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
    );

    await _localNotifications.initialize(
      initSettings,
      onDidReceiveNotificationResponse: _handleLocalNotificationResponse,
    );
  }

  /// Request notification permission from user
  Future<NotificationSettings> _requestPermission() async {
    return await _firebaseMessaging!.requestPermission(
      alert: true,
      announcement: false,
      badge: true,
      carPlay: false,
      criticalAlert: false,
      provisional: true,
      sound: true,
    );
  }

  /// Register FCM token with backend
  Future<void> _registerToken() async {
    try {
      final token = await _firebaseMessaging!.getToken();
      if (token == null) {
        print('NotificationService: No FCM token available');
        return;
      }

      _currentToken = token;
      print('NotificationService: Got FCM token: ${token.substring(0, 20)}...');

      // Check if token changed
      final session = Supabase.instance.client.auth.currentSession;
      if (session == null) {
        print('NotificationService: No session, will retry on auth state change');
        return;
      }

      await _sendTokenToBackend(token);
    } catch (e) {
      print('NotificationService: Error getting FCM token: $e');
    }
  }

  /// Send token to backend via Edge Function
  Future<void> _sendTokenToBackend(String token) async {
    try {
      final session = Supabase.instance.client.auth.currentSession;
      if (session == null) return;

      final deviceInfo = await _getDeviceInfo();

      final response = await http.post(
        Uri.parse('https://nvewoijluolkxrszeoar.supabase.co/functions/v1/fcm-token-manager'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${session.accessToken}',
          'apikey': AppConfig.supabaseAnonKey,
        },
        body: jsonEncode({
          'action': 'register',
          'token': token,
          'device_info': deviceInfo,
        }),
      );

      if (response.statusCode == 200) {
        print('NotificationService: Token registered successfully');
      } else {
        print('NotificationService: Token registration failed: ${response.body}');
      }
    } catch (e) {
      print('NotificationService: Error registering token: $e');
    }
  }

  /// Get device information
  Future<Map<String, dynamic>> _getDeviceInfo() async {
    // In a real app, use device_info_plus package
    return {
      'device_type': defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android',
      'device_name': 'Mobile Device',
      'app_version': '1.0.0', // TODO: Get from pubspec
    };
  }

  /// Handle token refresh
  Future<void> _handleTokenRefresh(String newToken) async {
    print('NotificationService: Token refreshed: ${newToken.substring(0, 20)}...');
    _currentToken = newToken;

    try {
      final session = Supabase.instance.client.auth.currentSession;
      if (session == null) return;

      await http.post(
        Uri.parse('https://nvewoijluolkxrszeoar.supabase.co/functions/v1/fcm-token-manager'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${session.accessToken}',
          'apikey': AppConfig.supabaseAnonKey,
        },
        body: jsonEncode({
          'action': 'register',
          'token': newToken,
        }),
      );

      print('NotificationService: Refreshed token registered');
    } catch (e) {
      print('NotificationService: Error on token refresh: $e');
    }
  }

  /// Handle foreground messages (show local notification)
  Future<void> _handleForegroundMessage(RemoteMessage message) async {
    print('NotificationService: Foreground message received: ${message.messageId}');

    final data = _messageToMap(message);
    _notificationController.add(data);

    // Show local notification for foreground messages
    await _showLocalNotification(message);
  }

  /// Show local notification for foreground message
  Future<void> _showLocalNotification(RemoteMessage message) async {
    const androidDetails = AndroidNotificationDetails(
      'high_importance_channel',
      'High Importance Notifications',
      channelDescription: 'Notifications that appear immediately',
      importance: Importance.high,
      priority: Priority.high,
      showWhen: true,
    );

    const iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );

    final details = NotificationDetails(
      android: androidDetails,
      iOS: iosDetails,
    );

    await _localNotifications.show(
      message.hashCode,
      message.notification?.title ?? 'Sobat AI',
      message.notification?.body ?? 'Ada pesan baru',
      details,
      payload: jsonEncode(message.data),
    );
  }

  /// Handle when app is opened via notification
  Future<void> _handleMessageOpenedApp(RemoteMessage message) async {
    print('NotificationService: App opened via notification: ${message.messageId}');

    final data = _messageToMap(message);
    _notificationController.add(data);

    // Trigger appropriate action
    _triggerNotificationAction(data);
  }

  /// Handle local notification response (from notification tap)
  void _handleLocalNotificationResponse(NotificationResponse response) {
    print('NotificationService: Local notification tapped: ${response.payload}');

    if (response.payload != null) {
      try {
        final data = jsonDecode(response.payload!) as Map<String, dynamic>;
        _triggerNotificationAction(data);
      } catch (e) {
        print('NotificationService: Error parsing notification payload: $e');
      }
    }
  }

  /// Set up notification action handlers
  void _setupNotificationActionHandlers() {
    onNotification.listen((data) {
      _triggerNotificationAction(data);
    });
  }

  /// Trigger action based on notification type
  void _triggerNotificationAction(Map<String, dynamic> data) {
    final type = data['type'] as String?;

    switch (type) {
      case 'briefing':
        _onBriefingTapped?.call(data);
        break;
      case 'task_reminder':
        final taskId = data['task_id'] as String?;
        if (taskId != null) {
          _onTaskTapped?.call(taskId);
        }
        break;
      case 'transaction':
        final txId = data['transaction_id'] as String?;
        if (txId != null) {
          _onTransactionTapped?.call(txId);
        }
        break;
      case 'idle_return':
      case 'ai_response':
      default:
        _onChatTapped?.call();
        break;
    }
  }

  /// Convert RemoteMessage to Map
  Map<String, dynamic> _messageToMap(RemoteMessage message) {
    return {
      'id': message.messageId,
      'type': message.data['type'] ?? 'general',
      'title': message.notification?.title,
      'body': message.notification?.body,
      'data': message.data,
      'timestamp': DateTime.now().toIso8601String(),
    };
  }

  /// Set notification action handlers
  ///
  /// Example:
  /// ```dart
  /// NotificationService().setHandlers(
  ///   onBriefing: (data) => _showBriefing(data['content']),
  ///   onTask: (taskId) => _navigateToTask(taskId),
  ///   onChat: () => _goToChat(),
  /// );
  /// ```
  void setHandlers({
    Function(Map<String, dynamic>)? onBriefing,
    Function(String taskId)? onTask,
    Function()? onChat,
    Function(String transactionId)? onTransaction,
  }) {
    _onBriefingTapped = onBriefing;
    _onTaskTapped = onTask;
    _onChatTapped = onChat;
    _onTransactionTapped = onTransaction;
  }

  /// Subscribe to a topic (for future use)
  Future<void> subscribeToTopic(String topic) async {
    _firebaseMessaging ??= FirebaseMessaging.instance;
    await _firebaseMessaging!.subscribeToTopic(topic);
    print('NotificationService: Subscribed to topic: $topic');
  }

  /// Unsubscribe from a topic
  Future<void> unsubscribeFromTopic(String topic) async {
    _firebaseMessaging ??= FirebaseMessaging.instance;
    await _firebaseMessaging!.unsubscribeFromTopic(topic);
    print('NotificationService: Unsubscribed from topic: $topic');
  }

  /// Invalidate token on logout
  Future<void> invalidateTokenOnLogout() async {
    if (_currentToken == null) return;

    try {
      final session = Supabase.instance.client.auth.currentSession;
      if (session == null) {
        _currentToken = null;
        return;
      }

      await http.post(
        Uri.parse('https://nvewoijluolkxrszeoar.supabase.co/functions/v1/fcm-token-manager'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${session.accessToken}',
          'apikey': AppConfig.supabaseAnonKey,
        },
        body: jsonEncode({
          'action': 'invalidate',
          'token': _currentToken,
        }),
      );

      print('NotificationService: Token invalidated on logout');
      _currentToken = null;
    } catch (e) {
      print('NotificationService: Error invalidating token: $e');
    }
  }

  /// Get current FCM token
  Future<String?> getToken() async {
    _firebaseMessaging ??= FirebaseMessaging.instance;
    if (_currentToken != null) return _currentToken;
    return await _firebaseMessaging!.getToken();
  }

  /// Check if notifications are enabled for this app
  Future<bool> areNotificationsEnabled() async {
    _firebaseMessaging ??= FirebaseMessaging.instance;
    final settings = await _firebaseMessaging!.getNotificationSettings();
    return settings.authorizationStatus == AuthorizationStatus.authorized;
  }

  /// Dispose resources
  void dispose() {
    _notificationController.close();
  }
}

// ====================================================================
// Background Message Handler
// Must be top-level or static function for FCM background messages
// ====================================================================

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  print('NotificationService: Handling background message: ${message.messageId}');

  // You can handle background messages here
  // For example, save to local database or show local notification

  // If you need to initialize Firebase for background,
  // call await Firebase.initializeApp() here
}

// Export the background handler for use in main.dart
typedef BackgroundMessageHandler = Future<void> Function(RemoteMessage message);
BackgroundMessageHandler get firebaseBackgroundHandler => firebaseMessagingBackgroundHandler;
