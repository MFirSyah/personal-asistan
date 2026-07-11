// ====================================================================
// personal_asistan_flutter - Main App Entry Point
// Arsitektur Reference: 3 Tabs Native
// Tab 1: Analisis (fl_chart), Tab 2: Chat (AI), Tab 3: Settings
// ====================================================================

import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:intl/intl.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:http/http.dart' as http;
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

import 'config.dart';
import 'local_db.dart';
import 'sync_service.dart';
import 'notification_service.dart';
import 'screens/auth_screens.dart';

// ====================================================================
// APP ENTRY POINT
// ====================================================================

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  print('FCM Background: ${message.messageId}');
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Firebase (optional)
  try {
    await Firebase.initializeApp();
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
  } catch (e) {
    print('Firebase init failed (optional): $e');
  }

  // Supabase
  await Supabase.initialize(
    url: AppConfig.supabaseUrl,
    anonKey: AppConfig.supabaseAnonKey,
  );

  // Services
  SyncService.instance.initialize();
  try {
    await NotificationService().initialize();
  } catch (e) {
    print('NotificationService init failed (optional): $e');
  }

  // Sentry
  await SentryFlutter.init(
    (options) {
      options.dsn = AppConfig.sentryDsn;
      options.tracesSampleRate = 1.0;
    },
    appRunner: () => runApp(const MyApp()),
  );
}

// ====================================================================
// APP
// ====================================================================

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Personal Asistan',
      debugShowCheckedModeBanner: false,
      theme: _buildTheme(Brightness.dark),
      darkTheme: _buildTheme(Brightness.dark),
      themeMode: ThemeMode.dark,
      home: const AuthWrapper(),
    );
  }

  ThemeData _buildTheme(Brightness brightness) {
    return ThemeData(
      brightness: brightness,
      scaffoldBackgroundColor: const Color(0xFF0B0F19),
      primaryColor: const Color(0xFF3B82F6),
      colorScheme: ColorScheme.dark(
        primary: const Color(0xFF3B82F6),
        secondary: const Color(0xFF8B5CF6),
        surface: const Color(0xFF111827),
        error: const Color(0xFFEF4444),
      ),
      fontFamily: 'sans-serif',
      useMaterial3: true,
      cardTheme: CardThemeData(
        color: const Color(0xFF1F2937),
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: Color(0x1CFFFFFF)),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: const Color(0xFF111827),
        indicatorColor: const Color(0xFF3B82F6),
        labelTextStyle: WidgetStateProperty.all(
          const TextStyle(fontSize: 12),
        ),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: Color(0xFF0B0F19),
        elevation: 0,
        centerTitle: true,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: const Color(0xFF1F2937),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: const Color(0xFF3B82F6),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
    );
  }
}

// ====================================================================
// AUTH WRAPPER
// ====================================================================

class AuthWrapper extends StatefulWidget {
  const AuthWrapper({super.key});

  @override
  State<AuthWrapper> createState() => _AuthWrapperState();
}

class _AuthWrapperState extends State<AuthWrapper> {
  bool _isLoading = true;
  User? _user;
  bool _needsProfileSetup = false;

  @override
  void initState() {
    super.initState();
    _checkAuthAndProfile();
    Supabase.instance.client.auth.onAuthStateChange.listen((data) {
      if (mounted) {
        final newUser = data.session?.user;
        if (newUser != null) {
          _checkUserHasProfile(newUser.id).then((hasProfile) {
            if (mounted) {
              setState(() {
                _user = newUser;
                _needsProfileSetup = !hasProfile;
                _isLoading = false;
              });
            }
          });
        } else {
          setState(() {
            _user = null;
            _needsProfileSetup = false;
            _isLoading = false;
          });
        }
      }
    });
  }

  Future<bool> _checkUserHasProfile(String userId) async {
    try {
      final res = await Supabase.instance.client
          .from('user_profiles')
          .select('id')
          .eq('id', userId)
          .maybeSingle();
      return res != null;
    } catch (e) {
      return false;
    }
  }

  Future<void> _checkAuthAndProfile() async {
    final session = Supabase.instance.client.auth.currentSession;
    if (mounted) {
      if (session?.user != null) {
        final hasProfile = await _checkUserHasProfile(session!.user.id);
        setState(() {
          _user = session.user;
          _needsProfileSetup = !hasProfile;
          _isLoading = false;
        });
      } else {
        setState(() {
          _user = null;
          _needsProfileSetup = false;
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        body: Center(
          child: CircularProgressIndicator(color: Color(0xFF3B82F6)),
        ),
      );
    }

    if (_user != null && _needsProfileSetup) {
      return const ProfileSetupScreen();
    }

    return _user != null
        ? const MainNavigatorScreen()
        : const LoginRegisterScreen();
  }
}

// ====================================================================
// MAIN NAVIGATOR - 3 TABS
// ====================================================================

class MainNavigatorScreen extends StatefulWidget {
  const MainNavigatorScreen({super.key});

  @override
  State<MainNavigatorScreen> createState() => _MainNavigatorScreenState();
}

class _MainNavigatorScreenState extends State<MainNavigatorScreen> {
  int _currentIndex = 1; // Start on Chat tab

  final List<Widget> _screens = [
    const AnalisisTab(),
    const ChatTab(),
    const SettingsTab(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: _screens,
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (index) {
          setState(() => _currentIndex = index);
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.analytics_outlined),
            selectedIcon: Icon(Icons.analytics),
            label: 'Analisis',
          ),
          NavigationDestination(
            icon: Icon(Icons.chat_bubble_outline),
            selectedIcon: Icon(Icons.chat_bubble),
            label: 'Chat',
          ),
          NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            selectedIcon: Icon(Icons.settings),
            label: 'Setting',
          ),
        ],
      ),
    );
  }
}

// ====================================================================
// TAB 1: ANALISIS
// ====================================================================

class AnalisisTab extends StatefulWidget {
  const AnalisisTab({super.key});

  @override
  State<AnalisisTab> createState() => _AnalisisTabState();
}

class _AnalisisTabState extends State<AnalisisTab> {
  bool _isLoading = true;
  double _income = 0;
  double _expense = 0;
  int _pendingTasks = 0;
  List<Map<String, dynamic>> _transactions = [];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);

    try {
      final userId = Supabase.instance.client.auth.currentUser?.id;
      if (userId == null) return;

      final now = DateTime.now();
      final startOfMonth = DateTime(now.year, now.month, 1);
      final monthStr = startOfMonth.toIso8601String().split('T')[0];

      // Income
      final incomeRes = await Supabase.instance.client
          .from('money_trackers')
          .select('amount')
          .eq('user_id', userId)
          .eq('type', 'income')
          .gte('transaction_date', monthStr);
      final income = (incomeRes as List)
          .fold<double>(0, (sum, item) => sum + (item['amount'] as num).toDouble());

      // Expense
      final expenseRes = await Supabase.instance.client
          .from('money_trackers')
          .select('amount')
          .eq('user_id', userId)
          .eq('type', 'expense')
          .gte('transaction_date', monthStr);
      final expense = (expenseRes as List)
          .fold<double>(0, (sum, item) => sum + (item['amount'] as num).toDouble());

      // Pending tasks
      final tasksRes = await Supabase.instance.client
          .from('todo_lists')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'pending');

      // Recent transactions
      final txRes = await Supabase.instance.client
          .from('money_trackers')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', ascending: false)
          .limit(20);

      if (mounted) {
        setState(() {
          _income = income;
          _expense = expense;
          _pendingTasks = (tasksRes as List).length;
          _transactions = List<Map<String, dynamic>>.from(txRes as List);
          _isLoading = false;
        });
      }
    } catch (e) {
      print('Error loading data: $e');
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Analisis'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadData,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadData,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildSummaryCards(),
                    const SizedBox(height: 24),
                    _buildExpenseChart(),
                    const SizedBox(height: 24),
                    _buildRecentTransactions(),
                    const SizedBox(height: 24),
                    _buildTasksSection(),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _buildSummaryCards() {
    final balance = _income - _expense;

    return Column(
      children: [
        Row(
          children: [
            Expanded(child: _SummaryCard(
              title: 'Pemasukan',
              value: _formatCurrency(_income),
              color: Colors.green,
              icon: Icons.arrow_downward,
            )),
            const SizedBox(width: 12),
            Expanded(child: _SummaryCard(
              title: 'Pengeluaran',
              value: _formatCurrency(_expense),
              color: Colors.red,
              icon: Icons.arrow_upward,
            )),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: _SummaryCard(
              title: 'Saldo',
              value: _formatCurrency(balance),
              color: balance >= 0 ? Colors.blue : Colors.orange,
              icon: Icons.account_balance_wallet,
            )),
            const SizedBox(width: 12),
            Expanded(child: _SummaryCard(
              title: 'Tugas Pending',
              value: '$_pendingTasks',
              color: Colors.purple,
              icon: Icons.task_alt,
            )),
          ],
        ),
      ],
    );
  }

  Widget _buildExpenseChart() {
    final categoryTotals = <String, double>{};
    for (final tx in _transactions) {
      if (tx['type'] == 'expense') {
        final cat = tx['description'] ?? 'Lainnya';
        final amt = (tx['amount'] as num).toDouble();
        categoryTotals[cat] = (categoryTotals[cat] ?? 0) + amt;
      }
    }

    if (categoryTotals.isEmpty) {
      return const SizedBox.shrink();
    }

    final colors = [
      const Color(0xFF3B82F6),
      const Color(0xFF8B5CF6),
      const Color(0xFFEC4899),
      const Color(0xFFF59E0B),
      const Color(0xFF10B981),
      const Color(0xFFEF4444),
    ];

    final entries = categoryTotals.entries.toList();
    final total = entries.fold<double>(0, (sum, e) => sum + e.value);

    final sections = entries.asMap().entries.map((entry) {
      final index = entry.key;
      final data = entry.value;
      final pct = (data.value / total * 100).toStringAsFixed(0);
      return PieChartSectionData(
        color: colors[index % colors.length],
        value: data.value,
        title: '$pct%',
        radius: 70,
        titleStyle: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.white),
      );
    }).toList();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Pengeluaran per Kategori', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),
            SizedBox(
              height: 180,
              child: PieChart(
                PieChartData(
                  sections: sections,
                  centerSpaceRadius: 35,
                  sectionsSpace: 2,
                ),
              ),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 12,
              runSpacing: 8,
              children: entries.asMap().entries.map((entry) {
                final index = entry.key;
                final data = entry.value;
                return Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 12, height: 12,
                      decoration: BoxDecoration(
                        color: colors[index % colors.length],
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                    const SizedBox(width: 4),
                    Text('${data.key} (${_formatCurrency(data.value)})',
                        style: const TextStyle(fontSize: 11)),
                  ],
                );
              }).toList(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRecentTransactions() {
    final recent = _transactions.take(5).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Transaksi Terbaru', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        if (recent.isEmpty)
          const Card(child: Padding(padding: EdgeInsets.all(16), child: Text('Belum ada transaksi')))
        else
          ...recent.map((tx) => Card(
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: tx['type'] == 'income'
                    ? Colors.green.withValues(alpha: 0.2)
                    : Colors.red.withValues(alpha: 0.2),
                child: Icon(
                  tx['type'] == 'income' ? Icons.arrow_downward : Icons.arrow_upward,
                  color: tx['type'] == 'income' ? Colors.green : Colors.red,
                  size: 20,
                ),
              ),
              title: Text(tx['description'] ?? tx['type'] ?? ''),
              subtitle: Text(_formatDate(tx['transaction_date'])),
              trailing: Text(
                '${tx['type'] == 'income' ? '+' : '-'}${_formatCurrency((tx['amount'] as num).toDouble())}',
                style: TextStyle(
                  color: tx['type'] == 'income' ? Colors.green : Colors.red,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          )),
      ],
    );
  }

  Widget _buildTasksSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Tugas Mendatang', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                Icon(Icons.task_alt, size: 48, color: Colors.grey[600]),
                const SizedBox(height: 8),
                Text('$_pendingTasks tugas pending',
                    style: TextStyle(color: Colors.grey[400])),
                const SizedBox(height: 4),
                const Text('Buka tab Chat untuk menambahkan tugas',
                    style: TextStyle(fontSize: 12, color: Colors.grey)),
              ],
            ),
          ),
        ),
      ],
    );
  }

  String _formatCurrency(double amount) {
    return NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0).format(amount);
  }

  String _formatDate(String? dateStr) {
    if (dateStr == null) return '';
    try {
      final date = DateTime.parse(dateStr);
      return DateFormat('dd MMM yyyy', 'id_ID').format(date);
    } catch (e) {
      return dateStr;
    }
  }
}

class _SummaryCard extends StatelessWidget {
  final String title;
  final String value;
  final Color color;
  final IconData icon;

  const _SummaryCard({
    required this.title,
    required this.value,
    required this.color,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, color: color, size: 16),
                const SizedBox(width: 8),
                Text(title, style: TextStyle(color: Colors.grey[400], fontSize: 12)),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              value,
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: color),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}

// ====================================================================
// TAB 2: CHAT
// ====================================================================

class ChatTab extends StatefulWidget {
  const ChatTab({super.key});

  @override
  State<ChatTab> createState() => _ChatTabState();
}

class _ChatTabState extends State<ChatTab> {
  final _messageController = TextEditingController();
  final _scrollController = ScrollController();
  List<Map<String, dynamic>> _messages = [];
  bool _isLoading = false;
  bool _isTyping = false;
  String? _userId;
  String _assistantName = 'Asisten';
  String _userNickname = 'Sobat';

  @override
  void initState() {
    super.initState();
    _loadUserInfo();
    _loadChatHistory();
  }

  Future<void> _loadUserInfo() async {
    final userId = Supabase.instance.client.auth.currentUser?.id;
    if (userId == null) return;

    try {
      final profile = await Supabase.instance.client
          .from('user_profiles')
          .select('assistant_name, user_nickname')
          .eq('id', userId)
          .maybeSingle();

      if (mounted && profile != null) {
        setState(() {
          _userId = userId;
          _assistantName = profile['assistant_name'] ?? 'Asisten';
          _userNickname = profile['user_nickname'] ?? 'Sobat';
        });
      }
    } catch (e) {
      print('Error loading user info: $e');
    }
  }

  Future<void> _loadChatHistory() async {
    if (_userId == null) return;

    try {
      final res = await Supabase.instance.client
          .from('app_chat_messages')
          .select('*')
          .eq('user_id', _userId!)
          .isFilter('room_id', null)
          .order('created_at', ascending: true)
          .limit(50);

      if (mounted) {
        setState(() {
          _messages = List<Map<String, dynamic>>.from(res as List);
        });
        _scrollToBottom();
      }
    } catch (e) {
      print('Error loading chat: $e');
    }
  }

  Future<void> _sendMessage() async {
    final text = _messageController.text.trim();
    if (text.isEmpty || _userId == null) return;

    setState(() {
      _isLoading = true;
      _isTyping = true;
      _messages.add({
        'message': text,
        'sender_id': _userId,
        'created_at': DateTime.now().toIso8601String(),
      });
    });

    _messageController.clear();
    _scrollToBottom();

    try {
      final response = await _callChatAPI(text);
      if (response != null && mounted) {
        setState(() {
          if (response['bubbles'] != null) {
            for (final bubble in response['bubbles']) {
              _messages.add({
                'message': bubble,
                'sender_id': null,
                'created_at': DateTime.now().toIso8601String(),
              });
            }
          } else {
            _messages.add({
              'message': response['text'] ?? 'Maaf, terjadi kesalahan.',
              'sender_id': null,
              'created_at': DateTime.now().toIso8601String(),
            });
          }
          _scrollToBottom();
        });
      }
    } catch (e) {
      print('Error: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<Map<String, dynamic>?> _callChatAPI(String message) async {
    try {
      final session = Supabase.instance.client.auth.currentSession;
      if (session == null) return null;

      final response = await http.post(
        Uri.parse('${AppConfig.activeUrl}/api/v1/chat'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${session.accessToken}',
          'x-jarvis-gateway-key': AppConfig.gatewayKey,
        },
        body: jsonEncode({
          'message': message,
          'timezone': DateTime.now().timeZoneName,
        }),
      );

      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      }
    } catch (e) {
      print('Chat API error: $e');
    }
    return null;
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Column(
          children: [
            Text(_assistantName),
            Text(
              'Online',
              style: TextStyle(fontSize: 10, color: Colors.green[400]),
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: _messages.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.chat_bubble_outline, size: 64, color: Colors.grey[600]),
                        const SizedBox(height: 16),
                        Text(
                          'Hai $_userNickname! 👋',
                          style: TextStyle(fontSize: 18, color: Colors.grey[400]),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Tanyakan apa saja tentang keuangan,\ntugas, atau aktivitasmu.',
                          style: TextStyle(color: Colors.grey[600]),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  )
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.all(16),
                    itemCount: _messages.length,
                    itemBuilder: (context, index) {
                      final msg = _messages[index];
                      final isUser = msg['sender_id'] != null;
                      return _ChatBubble(
                        message: msg['message'] ?? '',
                        isUser: isUser,
                        time: _formatTime(msg['created_at']),
                      );
                    },
                  ),
          ),
          if (_isTyping && _isLoading)
            Padding(
              padding: const EdgeInsets.all(8),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.grey[800],
                      borderRadius: const BorderRadius.only(
                        topLeft: Radius.circular(16),
                        topRight: Radius.circular(16),
                        bottomRight: Radius.circular(16),
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _buildTypingDots(),
                        const SizedBox(width: 8),
                        const Text('AI mengetik...'),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          _buildInputArea(),
        ],
      ),
    );
  }

  Widget _buildTypingDots() {
    return Row(
      children: List.generate(3, (i) => Container(
        width: 6, height: 6,
        margin: const EdgeInsets.only(right: 3),
        decoration: BoxDecoration(
          color: Colors.grey[400],
          borderRadius: BorderRadius.circular(3),
        ),
      )),
    );
  }

  Widget _buildInputArea() {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        border: Border(top: BorderSide(color: Colors.grey[800]!)),
      ),
      child: SafeArea(
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: _messageController,
                decoration: InputDecoration(
                  hintText: 'Ketik pesan ke $_assistantName...',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: BorderSide.none,
                  ),
                  filled: true,
                  fillColor: const Color(0xFF1F2937),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                ),
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _sendMessage(),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filled(
              onPressed: _isLoading ? null : _sendMessage,
              icon: const Icon(Icons.send),
            ),
          ],
        ),
      ),
    );
  }

  String _formatTime(String? dateStr) {
    if (dateStr == null) return '';
    try {
      final date = DateTime.parse(dateStr);
      return DateFormat('HH:mm').format(date);
    } catch (e) {
      return '';
    }
  }

  @override
  void dispose() {
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }
}

class _ChatBubble extends StatelessWidget {
  final String message;
  final bool isUser;
  final String time;

  const _ChatBubble({
    required this.message,
    required this.isUser,
    required this.time,
  });

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.75,
        ),
        decoration: BoxDecoration(
          color: isUser ? const Color(0xFF3B82F6) : const Color(0xFF1F2937),
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: isUser ? const Radius.circular(16) : Radius.zero,
            bottomRight: isUser ? Radius.zero : const Radius.circular(16),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(message, style: const TextStyle(color: Colors.white)),
            const SizedBox(height: 4),
            Text(time, style: TextStyle(fontSize: 10, color: Colors.grey[400])),
          ],
        ),
      ),
    );
  }
}

// ====================================================================
// TAB 3: SETTINGS
// ====================================================================

class SettingsTab extends StatelessWidget {
  const SettingsTab({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Pengaturan')),
      body: FutureBuilder<Map<String, dynamic>?>(
        future: _loadProfile(),
        builder: (context, snapshot) {
          return ListView(
            children: [
              // Profile
              if (snapshot.hasData && snapshot.data!.isNotEmpty)
                _buildProfileCard(snapshot.data!)
              else
                const SizedBox(height: 120),

              const Divider(),

              // Settings options
              ListTile(
                leading: const Icon(Icons.person),
                title: const Text('Nama AI'),
                subtitle: Text(snapshot.data?['assistant_name'] ?? 'Asisten'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => _showEditDialog(context, 'assistant_name', 'Nama AI'),
              ),
              ListTile(
                leading: const Icon(Icons.badge),
                title: const Text('Nama User'),
                subtitle: Text(snapshot.data?['fullname'] ?? 'User'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => _showEditDialog(context, 'fullname', 'Nama User'),
              ),
              ListTile(
                leading: const Icon(Icons.palette),
                title: const Text('Tema'),
                subtitle: const Text('Dark / Light / System'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {},
              ),
              ListTile(
                leading: const Icon(Icons.notifications),
                title: const Text('Notifikasi'),
                subtitle: const Text('Pengaturan notifikasi'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {},
              ),

              const Divider(),

              // Actions
              ListTile(
                leading: const Icon(Icons.bug_report, color: Colors.orange),
                title: const Text('Laporkan Bug'),
                subtitle: const Text('Kirim laporan error'),
                onTap: () {
                  Sentry.captureMessage('User initiated bug report');
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Terima kasih! Laporan sudah dikirim.')),
                  );
                },
              ),
              ListTile(
                leading: const Icon(Icons.logout, color: Colors.red),
                title: const Text('Logout', style: TextStyle(color: Colors.red)),
                onTap: () => _showLogoutDialog(context),
              ),

              const Divider(),

              // Version
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Text('Personal Asistan', style: TextStyle(fontWeight: FontWeight.bold)),
                      Text('v1.0.0', style: TextStyle(color: Colors.grey, fontSize: 12)),
                      Text('by Claude Code', style: TextStyle(color: Colors.grey, fontSize: 10)),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildProfileCard(Map<String, dynamic> profile) {
    return Container(
      padding: const EdgeInsets.all(24),
      child: Row(
        children: [
          CircleAvatar(
            radius: 36,
            backgroundColor: const Color(0xFF3B82F6),
            child: Text(
              (profile['fullname'] ?? 'U')[0].toUpperCase(),
              style: const TextStyle(fontSize: 28, color: Colors.white),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  profile['fullname'] ?? 'User',
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 4),
                Text(
                  profile['assistant_name'] ?? 'Asisten',
                  style: TextStyle(color: Colors.grey[400]),
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: const Color(0xFF3B82F6).withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    profile['selected_personality'] ?? 'witty_sidekick',
                    style: const TextStyle(fontSize: 10, color: Color(0xFF3B82F6)),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<Map<String, dynamic>> _loadProfile() async {
    final userId = Supabase.instance.client.auth.currentUser?.id;
    if (userId == null) return {};

    try {
      final res = await Supabase.instance.client
          .from('user_profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
      return res ?? {};
    } catch (e) {
      return {};
    }
  }

  void _showEditDialog(BuildContext context, String field, String title) {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Edit $title'),
        content: TextField(
          controller: controller,
          decoration: InputDecoration(labelText: title),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () async {
              Navigator.pop(context);
              // TODO: Save to Supabase
            },
            child: const Text('Simpan'),
          ),
        ],
      ),
    );
  }

  void _showLogoutDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Logout'),
        content: const Text('Apakah Anda yakin ingin keluar?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Batal'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () async {
              Navigator.pop(context);
              await Supabase.instance.client.auth.signOut();
            },
            child: const Text('Logout'),
          ),
        ],
      ),
    );
  }
}

// ====================================================================
// PLACEHOLDER - Full implementation in separate file
// ====================================================================

class ProfileSetupScreen extends StatelessWidget {
  const ProfileSetupScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Text('Profile Setup - Redirect to LoginRegisterScreen'),
      ),
    );
  }
}
