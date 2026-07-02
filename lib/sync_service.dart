// ignore_for_file: avoid_print
import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'local_db.dart';

class SyncService {
  static final SyncService instance = SyncService._init();
  final _dbHelper = LocalDatabaseHelper.instance;
  final _supabase = Supabase.instance.client;
  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;
  bool _isSyncing = false;

  SyncService._init();

  // Initialize connectivity listener for auto synchronization
  void initialize() {
    _connectivitySubscription = Connectivity().onConnectivityChanged.listen((results) {
      final isConnected = results.any((result) => result != ConnectivityResult.none);
      if (isConnected) {
        print("Network status: ONLINE. Auto-sync triggered.");
        triggerSync();
      } else {
        print("Network status: OFFLINE.");
      }
    });
  }

  void dispose() {
    _connectivitySubscription?.cancel();
  }

  // Core synchronization method
  Future<void> triggerSync() async {
    // Prevent overlapping sync processes
    if (_isSyncing) return;
    
    final currentUser = _supabase.auth.currentUser;
    if (currentUser == null) {
      print("No user logged in. Sync aborted.");
      return;
    }

    _isSyncing = true;
    print("Synchronization started...");

    try {
      // 1. Sync Money Tracker Transactions
      final unsyncedTxs = await _dbHelper.getUnsyncedTransactions();
      if (unsyncedTxs.isNotEmpty) {
        print("Found ${unsyncedTxs.length} unsynced transactions. Syncing...");
        for (var tx in unsyncedTxs) {
          try {
            await _supabase.from('money_trackers').upsert({
              'id': tx['id'],
              'user_id': currentUser.id,
              'amount': tx['amount'],
              'type': tx['type'],
              'description': tx['description'],
              'transaction_date': tx['transaction_date'],
              'payment_method_id': tx['payment_method_id'],
              'dynamic_metadata': tx['dynamic_metadata'] ?? {},
            });
            await _dbHelper.markTransactionSynced(tx['id'] as String);
            print("Transaction synced: ${tx['id']}");
          } catch (e) {
            print("Failed to sync transaction ${tx['id']}: $e");
          }
        }
      }

      // 2. Sync To-Do Tasks
      final unsyncedTasks = await _dbHelper.getUnsyncedTasks();
      if (unsyncedTasks.isNotEmpty) {
        print("Found ${unsyncedTasks.length} unsynced tasks. Syncing...");
        for (var task in unsyncedTasks) {
          try {
            await _supabase.from('todo_lists').upsert({
              'id': task['id'],
              'user_id': currentUser.id,
              'task_name': task['task_name'],
              'status': task['status'],
              'due_date': task['due_date'],
              'dynamic_metadata': task['dynamic_metadata'] ?? {},
            });
            await _dbHelper.markTaskSynced(task['id'] as String);
            print("Task synced: ${task['id']}");
          } catch (e) {
            print("Failed to sync task ${task['id']}: $e");
          }
        }
      }

      print("Synchronization completed successfully.");
    } catch (e) {
      print("Synchronization error: $e");
    } finally {
      _isSyncing = false;
    }
  }
}
