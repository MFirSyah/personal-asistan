import 'dart:async';
import 'package:flutter/services.dart';

/**
 * NotificationListenerBridge - Flutter bridge for Android NotificationListenerService
 *
 * Arsitektur Reference: Bagian 3, 14
 *
 * This bridge communicates with the native NotificationListenerService
 * to capture and process notifications on Android.
 */
class NotificationListenerBridge {
  static final NotificationListenerBridge _instance = NotificationListenerBridge._internal();
  factory NotificationListenerBridge() => _instance;
  NotificationListenerBridge._internal();

  static const EventChannel _eventChannel = EventChannel('com.personal_asistan/notifications');
  static const MethodChannel _methodChannel = MethodChannel('com.personal_asistan/notification_methods');

  StreamSubscription<dynamic>? _subscription;
  final StreamController<Map<String, dynamic>> _notificationController =
      StreamController<Map<String, dynamic>>.broadcast();

  /// Stream of incoming processed notifications
  Stream<Map<String, dynamic>> get onNotification => _notificationController.stream;

  bool _isInitialized = false;

  /// Initialize the bridge
  Future<void> initialize() async {
    if (_isInitialized) return;
    _isInitialized = true;

    // Listen to native notification events
    _subscription = _eventChannel.receiveBroadcastStream().listen(
      _handleNativeEvent,
      onError: _handleError,
    );
  }

  /// Handle native event
  void _handleNativeEvent(dynamic event) {
    if (event is Map) {
      final notification = Map<String, dynamic>.from(event);
      _notificationController.add(notification);
    }
  }

  /// Handle stream error
  void _handleError(Object error) {
    print('NotificationListenerBridge error: $error');
  }

  /// Check if notification access is granted
  Future<bool> hasPermission() async {
    try {
      final result = await _methodChannel.invokeMethod<bool>('getPermissionStatus');
      return result ?? false;
    } on PlatformException catch (e) {
      print('Error checking permission: ${e.message}');
      return false;
    }
  }

  /// Open system notification access settings
  Future<bool> openSettings() async {
    try {
      final result = await _methodChannel.invokeMethod<bool>('openNotificationSettings');
      return result ?? false;
    } on PlatformException catch (e) {
      print('Error opening settings: ${e.message}');
      return false;
    }
  }

  /// Get list of apps with notification access
  Future<List<String>> getAccessPackages() async {
    try {
      final result = await _methodChannel.invokeMethod<List<dynamic>>('getListenerPackages');
      return result?.cast<String>() ?? [];
    } on PlatformException catch (e) {
      print('Error getting packages: ${e.message}');
      return [];
    }
  }

  /// Dispose resources
  void dispose() {
    _subscription?.cancel();
    _notificationController.close();
  }
}

/// Model for processed notification
class ProcessedNotification {
  final String id;
  final String packageName;
  final String title;
  final String text;
  final DateTime postTime;
  final String priority;
  final String category;
  final bool requiresAiReview;

  ProcessedNotification({
    required this.id,
    required this.packageName,
    required this.title,
    required this.text,
    required this.postTime,
    required this.priority,
    required this.category,
    required this.requiresAiReview,
  });

  factory ProcessedNotification.fromMap(Map<String, dynamic> map) {
    return ProcessedNotification(
      id: map['id'] ?? '',
      packageName: map['package_name'] ?? '',
      title: map['title'] ?? '',
      text: map['text'] ?? '',
      postTime: DateTime.tryParse(map['post_time_iso'] ?? '') ?? DateTime.now(),
      priority: map['priority'] ?? 'informational',
      category: map['category'] ?? 'other',
      requiresAiReview: map['requires_ai_review'] ?? false,
    );
  }

  bool get isUrgent => priority == 'urgent';
  bool get isImportant => priority == 'important';
  bool get isInformational => priority == 'informational';
  bool get isNoise => priority == 'noise';
}
