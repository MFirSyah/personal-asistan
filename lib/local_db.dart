import 'dart:convert';
import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';

class LocalDatabaseHelper {
  static final LocalDatabaseHelper instance = LocalDatabaseHelper._init();
  static Database? _database;

  LocalDatabaseHelper._init();

  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDB('personal_assistant.db');
    return _database!;
  }

  Future<Database> _initDB(String filePath) async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, filePath);

    return await openDatabase(
      path,
      version: 1,
      onCreate: _createDB,
    );
  }

  Future<void> _createDB(Database db, int version) async {
    // 1. Cached Transactions (Money Tracker)
    await db.execute('''
      CREATE TABLE cached_transactions (
        id TEXT PRIMARY KEY,
        amount REAL NOT NULL,
        type TEXT NOT NULL,
        description TEXT,
        transaction_date TEXT,
        dynamic_metadata TEXT,
        is_synced INTEGER NOT NULL DEFAULT 0
      )
    ''');

    // 2. Cached Tasks (To-Do List)
    await db.execute('''
      CREATE TABLE cached_tasks (
        id TEXT PRIMARY KEY,
        task_name TEXT NOT NULL,
        status TEXT NOT NULL,
        due_date TEXT,
        dynamic_metadata TEXT,
        is_synced INTEGER NOT NULL DEFAULT 0
      )
    ''');

    // 3. Cached Chat Messages (Chat Log)
    await db.execute('''
      CREATE TABLE cached_chat_messages (
        id TEXT PRIMARY KEY,
        room_id TEXT,
        sender_id TEXT,
        sender_personality_id TEXT,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    ''');
  }

  // --- Transactions Helper Methods ---

  Future<int> insertTransaction(Map<String, dynamic> tx) async {
    final db = await instance.database;
    return await db.insert(
      'cached_transactions',
      {
        'id': tx['id'],
        'amount': tx['amount'],
        'type': tx['type'],
        'description': tx['description'],
        'transaction_date': tx['transaction_date'],
        'dynamic_metadata': jsonEncode(tx['dynamic_metadata'] ?? {}),
        'is_synced': tx['is_synced'] ?? 0,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<List<Map<String, dynamic>>> getTransactions() async {
    final db = await instance.database;
    final maps = await db.query('cached_transactions', orderBy: 'transaction_date DESC, id DESC');
    return maps.map((m) {
      return {
        'id': m['id'],
        'amount': m['amount'],
        'type': m['type'],
        'description': m['description'],
        'transaction_date': m['transaction_date'],
        'dynamic_metadata': jsonDecode(m['dynamic_metadata'] as String? ?? '{}'),
        'is_synced': m['is_synced'],
      };
    }).toList();
  }

  Future<int> deleteTransaction(String id) async {
    final db = await instance.database;
    return await db.delete('cached_transactions', where: 'id = ?', whereArgs: [id]);
  }

  Future<List<Map<String, dynamic>>> getUnsyncedTransactions() async {
    final db = await instance.database;
    final maps = await db.query('cached_transactions', where: 'is_synced = 0');
    return maps.map((m) {
      return {
        'id': m['id'],
        'amount': m['amount'],
        'type': m['type'],
        'description': m['description'],
        'transaction_date': m['transaction_date'],
        'dynamic_metadata': jsonDecode(m['dynamic_metadata'] as String? ?? '{}'),
      };
    }).toList();
  }

  Future<int> markTransactionSynced(String id) async {
    final db = await instance.database;
    return await db.update(
      'cached_transactions',
      {'is_synced': 1},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  // --- Tasks Helper Methods ---

  Future<int> insertTask(Map<String, dynamic> task) async {
    final db = await instance.database;
    return await db.insert(
      'cached_tasks',
      {
        'id': task['id'],
        'task_name': task['task_name'],
        'status': task['status'],
        'due_date': task['due_date'],
        'dynamic_metadata': jsonEncode(task['dynamic_metadata'] ?? {}),
        'is_synced': task['is_synced'] ?? 0,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<List<Map<String, dynamic>>> getTasks() async {
    final db = await instance.database;
    final maps = await db.query('cached_tasks', orderBy: 'due_date ASC, id DESC');
    return maps.map((m) {
      return {
        'id': m['id'],
        'task_name': m['task_name'],
        'status': m['status'],
        'due_date': m['due_date'],
        'dynamic_metadata': jsonDecode(m['dynamic_metadata'] as String? ?? '{}'),
        'is_synced': m['is_synced'],
      };
    }).toList();
  }

  Future<int> deleteTask(String id) async {
    final db = await instance.database;
    return await db.delete('cached_tasks', where: 'id = ?', whereArgs: [id]);
  }

  Future<List<Map<String, dynamic>>> getUnsyncedTasks() async {
    final db = await instance.database;
    final maps = await db.query('cached_tasks', where: 'is_synced = 0');
    return maps.map((m) {
      return {
        'id': m['id'],
        'task_name': m['task_name'],
        'status': m['status'],
        'due_date': m['due_date'],
        'dynamic_metadata': jsonDecode(m['dynamic_metadata'] as String? ?? '{}'),
      };
    }).toList();
  }

  Future<int> markTaskSynced(String id) async {
    final db = await instance.database;
    return await db.update(
      'cached_tasks',
      {'is_synced': 1},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  // --- Chat Helper Methods ---

  Future<int> insertChatMessage(Map<String, dynamic> msg) async {
    final db = await instance.database;
    return await db.insert(
      'cached_chat_messages',
      {
        'id': msg['id'],
        'room_id': msg['room_id'],
        'sender_id': msg['sender_id'],
        'sender_personality_id': msg['sender_personality_id'],
        'message': msg['message'],
        'created_at': msg['created_at'],
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<List<Map<String, dynamic>>> getChatMessages(String? roomId) async {
    final db = await instance.database;
    final List<Map<String, dynamic>> maps = await db.query(
      'cached_chat_messages',
      where: roomId == null ? 'room_id IS NULL' : 'room_id = ?',
      whereArgs: roomId == null ? [] : [roomId],
      orderBy: 'created_at ASC',
    );
    return maps;
  }

  Future<void> clearChatCache(String? roomId) async {
    final db = await instance.database;
    await db.delete(
      'cached_chat_messages',
      where: roomId == null ? 'room_id IS NULL' : 'room_id = ?',
      whereArgs: roomId == null ? [] : [roomId],
    );
  }

  Future<void> clearAllCache() async {
    final db = await instance.database;
    await db.delete('cached_transactions');
    await db.delete('cached_tasks');
    await db.delete('cached_chat_messages');
  }
}
