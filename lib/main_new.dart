// ====================================================================
// personal_asistan_flutter - Main App Entry Point
// Refactored sesuai arsitektur reference: 3 tabs native
// Tab: Analisis, Chat (AI), Setting
// ====================================================================

import 'dart:convert';
import 'dart:io';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

import 'config.dart';
import 'local_db.dart';
import 'sync_service.dart';
import 'notification_service.dart';
import 'screens/auth_screens.dart';
import 'widgets/glass_container.dart';
import 'widgets/mesh_gradient_bg.dart';

// ====================================================================
// APP ENTRY POINT
// ====================================================================

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  print('FCM Background: ${message.messageId}');
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Firebase (optional)
  try {
    await Firebase.initializeApp();
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    print('Firebase initialized successfully');
  } catch (e) {
    print('Firebase initialization failed (optional): $e');
  }

  // Initialize Supabase
  await Supabase.initialize(
    url: AppConfig.supabaseUrl,
    anonKey: AppConfig.supabaseAnonKey,
  );

  // Initialize sync service
  SyncService.instance.initialize();

  // Initialize notification service (optional)
  try {
    await NotificationService().initialize();
    print('NotificationService initialized');
  } catch (e) {
    print('NotificationService initialization failed (optional): $e');
  }

  // Initialize Sentry
  await SentryFlutter.init(
    (options) {
      options.dsn = AppConfig.sentryDsn;
      options.tracesSampleRate = 1.0;
      options.profilesSampleRate = 1.0;
    },
    appRunner: () => runApp(const MyApp()),
  );
}

// ====================================================================
// APP CONFIGURATION
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
      scaffoldBackgroundColor: const Color(0xFF0B0F19), // Midnight Dark
      primaryColor: const Color(0xFF3B82F6),
      cardTheme: CardThemeData(
        color: const Color(0xFF1F2937).withValues(alpha: 0.65),
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(24),
          side: const BorderSide(color: Color(0x1AFFFFFF), width: 1), // Glass border
        ),
      ),
      colorScheme: const ColorScheme.dark(
        primary: Color(0xFF3B82F6),
        secondary: Color(0xFF8B5CF6),
        surface: Color(0xFF111827),
        error: Color(0xFFEF4444),
        onPrimary: Colors.white,
      ),
      fontFamily: GoogleFonts.outfit().fontFamily,
      textTheme: GoogleFonts.outfitTextTheme(ThemeData.dark().textTheme),
      useMaterial3: true,
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
      print("Error checking profile: $e");
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
      return AuthScreens(initialShowProfileSetup: true, initialUserId: _user!.id);
    }

    return _user != null
        ? const MainNavigatorScreen()
        : const AuthScreens();
  }
}

// ====================================================================
// MAIN NAVIGATOR - 3 TABS NATIVE
// Tab 1: Analisis, Tab 2: Chat, Tab 3: Settings
// ====================================================================

class MainNavigatorScreen extends StatefulWidget {
  const MainNavigatorScreen({super.key});

  @override
  State<MainNavigatorScreen> createState() => _MainNavigatorScreenState();
}

class _MainNavigatorScreenState extends State<MainNavigatorScreen> {
  int _currentIndex = 0;

  final List<Widget> _screens = [
    const AnalisisTab(),
    const ChatTab(),
    const SettingsTab(),
  ];

  @override
  void initState() {
    super.initState();
    _checkMorningBriefing();
  }

  Future<void> _checkMorningBriefing() async {
    try {
      final session = Supabase.instance.client.auth.currentSession;
      if (session == null) return;

      final userId = session.user.id;
      final profileRes = await Supabase.instance.client
          .from('user_profiles')
          .select('dynamic_metadata')
          .eq('id', userId)
          .maybeSingle();

      if (profileRes != null) {
        final metadata = profileRes['dynamic_metadata'] ?? {};
        final briefingTimeStr = metadata['morning_briefing_time'] ?? '06:00';
        final lastBriefingDate = metadata['last_briefing_date'];

        final now = DateTime.now();
        final todayStr = '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';

        // Check if already shown today
        if (lastBriefingDate == todayStr) return;

        // Parse briefing time
        final parts = briefingTimeStr.split(':');
        if (parts.length == 2) {
          final bHour = int.tryParse(parts[0]) ?? 6;
          final bMin = int.tryParse(parts[1]) ?? 0;
          
          final briefingTime = DateTime(now.year, now.month, now.day, bHour, bMin);
          
          // If current time is past the briefing time
          if (now.isAfter(briefingTime)) {
            // Fetch briefing
            final response = await http.get(
              Uri.parse('${AppConfig.activeUrl}/api/v1/chat/briefing'),
              headers: {
                'Authorization': 'Bearer ${session.accessToken}',
                'x-jarvis-gateway-key': AppConfig.gatewayKey,
              },
            );

            if (response.statusCode == 200) {
              final data = jsonDecode(response.body);
              if (data['briefing'] != null && mounted) {
                _showBriefingPopup(data['briefing']);
                
                // Update last shown date
                metadata['last_briefing_date'] = todayStr;
                await Supabase.instance.client
                    .from('user_profiles')
                    .update({'dynamic_metadata': metadata})
                    .eq('id', userId);
              }
            }
          }
        }
      }
    } catch (e) {
      print('Error checking morning briefing: $e');
    }
  }

  void _showBriefingPopup(String briefingText) {
    showDialog(
      context: context,
      barrierDismissible: true,
      barrierColor: Colors.black.withValues(alpha: 0.6),
      builder: (context) {
        return BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
          child: AlertDialog(
            backgroundColor: const Color(0xFF1F2937).withValues(alpha: 0.85),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(20),
              side: const BorderSide(color: Color(0x33FFFFFF), width: 1),
            ),
            title: const Row(
              children: [
                Icon(Icons.wb_sunny_rounded, color: Colors.amber),
                SizedBox(width: 10),
                Text('Morning Briefing', style: TextStyle(color: Colors.white, fontSize: 20)),
              ],
            ),
            content: Text(
              briefingText,
              style: const TextStyle(color: Colors.white70, fontSize: 16, height: 1.5),
            ),
            actions: [
              FilledButton(
                onPressed: () => Navigator.pop(context),
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF3B82F6),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: const Text('Terima Kasih', style: TextStyle(fontWeight: FontWeight.w600)),
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: MeshGradientBg(
        child: IndexedStack(
          index: _currentIndex,
          children: _screens,
        ),
      ),
      extendBody: true,
      bottomNavigationBar: NavigationBar(
        backgroundColor: const Color(0xFF1F2937).withValues(alpha: 0.85),
        elevation: 0,
        selectedIndex: _currentIndex,
        onDestinationSelected: (index) {
          setState(() {
            _currentIndex = index;
          });
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
// TAB 1: ANALISIS (Native Charts)
// ====================================================================

class AnalisisTab extends StatefulWidget {
  const AnalisisTab({super.key});

  @override
  State<AnalisisTab> createState() => _AnalisisTabState();
}

class _AnalisisTabState extends State<AnalisisTab> {
  bool _isLoading = true;
  Map<String, dynamic> _summaryData = {};
  List<Map<String, dynamic>> _transactions = [];
  List<Map<String, dynamic>> _tasks = [];

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

      // Fetch summary data
      await _fetchSummary();
      await _fetchRecentTransactions();
      await _fetchRecentTasks();
    } catch (e) {
      print('Error loading data: $e');
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _fetchSummary() async {
    try {
      final userId = Supabase.instance.client.auth.currentUser?.id;
      if (userId == null) return;

      final now = DateTime.now();
      final startOfMonth = DateTime(now.year, now.month, 1);

      // Get income
      final incomeRes = await Supabase.instance.client
          .from('money_trackers')
          .select('amount')
          .eq('user_id', userId)
          .eq('type', 'income')
          .gte('transaction_date', startOfMonth.toIso8601String().split('T')[0]);

      // Get expense
      final expenseRes = await Supabase.instance.client
          .from('money_trackers')
          .select('amount')
          .eq('user_id', userId)
          .eq('type', 'expense')
          .gte('transaction_date', startOfMonth.toIso8601String().split('T')[0]);

      final income = (incomeRes as List)
          .fold<double>(0, (sum, item) => sum + (item['amount'] as num).toDouble());
      final expense = (expenseRes as List)
          .fold<double>(0, (sum, item) => sum + (item['amount'] as num).toDouble());

      // Get pending tasks
      final tasksRes = await Supabase.instance.client
          .from('todo_lists')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'pending');

      setState(() {
        _summaryData = {
          'income': income,
          'expense': expense,
          'balance': income - expense,
          'pending_tasks': (tasksRes as List).length,
        };
      });
    } catch (e) {
      print('Error fetching summary: $e');
    }
  }

  Future<void> _fetchRecentTransactions() async {
    try {
      final userId = Supabase.instance.client.auth.currentUser?.id;
      if (userId == null) return;

      final res = await Supabase.instance.client
          .from('money_trackers')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', ascending: false)
          .limit(10);

      setState(() {
        _transactions = List<Map<String, dynamic>>.from(res as List);
      });
    } catch (e) {
      print('Error fetching transactions: $e');
    }
  }

  Future<void> _fetchRecentTasks() async {
    try {
      final userId = Supabase.instance.client.auth.currentUser?.id;
      if (userId == null) return;

      final res = await Supabase.instance.client
          .from('todo_lists')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', ascending: false)
          .limit(10);

      setState(() {
        _tasks = List<Map<String, dynamic>>.from(res as List);
      });
    } catch (e) {
      print('Error fetching tasks: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        title: const Text('Analisis'),
        centerTitle: true,
        backgroundColor: Colors.transparent,
        elevation: 0,
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
                    _buildTasksSection(),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _buildSummaryCards() {
    final income = _summaryData['income'] ?? 0;
    final expense = _summaryData['expense'] ?? 0;
    final balance = _summaryData['balance'] ?? 0;
    final pendingTasks = _summaryData['pending_tasks'] ?? 0;

    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: _SummaryCard(
                title: 'Pemasukan',
                value: _formatCurrency(income),
                color: Colors.green,
                icon: Icons.arrow_downward,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _SummaryCard(
                title: 'Pengeluaran',
                value: _formatCurrency(expense),
                color: Colors.red,
                icon: Icons.arrow_upward,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _SummaryCard(
                title: 'Saldo',
                value: _formatCurrency(balance),
                color: balance >= 0 ? Colors.blue : Colors.orange,
                icon: Icons.account_balance_wallet,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _SummaryCard(
                title: 'Tugas Pending',
                value: '$pendingTasks',
                color: Colors.purple,
                icon: Icons.task_alt,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildExpenseChart() {
    if (_transactions.isEmpty) {
      return const SizedBox.shrink();
    }

    // Group transactions by category
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
    final sections = entries.asMap().entries.map((entry) {
      final index = entry.key;
      final data = entry.value;
      return PieChartSectionData(
        color: colors[index % colors.length],
        value: data.value,
        title: data.key,
        radius: 80,
        titleStyle: const TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.bold,
          color: Colors.white,
        ),
      );
    }).toList();

    return GlassContainer(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Pengeluaran per Kategori',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 200,
              child: PieChart(
                PieChartData(
                  sections: sections,
                  centerSpaceRadius: 40,
                  sectionsSpace: 2,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTasksSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Tugas Mendatang',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 12),
        if (_tasks.isEmpty)
          const GlassContainer(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Text('Tidak ada tugas'),
            ),
          )
        else
          ...(_tasks.take(5).map((task) => Container(
                margin: const EdgeInsets.only(bottom: 8),
                child: GlassContainer(
                  child: ListTile(
                    leading: Icon(
                      task['status'] == 'completed'
                          ? Icons.check_circle
                          : Icons.radio_button_unchecked,
                      color: task['status'] == 'completed'
                          ? Colors.green
                          : Colors.grey,
                    ),
                    title: Text(task['task_name'] ?? ''),
                    subtitle: task['due_date'] != null
                        ? Text(_formatDate(task['due_date']))
                        : null,
                  ),
                ),
              ))),
      ],
    );
  }

  String _formatCurrency(double amount) {
    final formatted = NumberFormat.currency(
      locale: 'id_ID',
      symbol: 'Rp ',
      decimalDigits: 0,
    ).format(amount);
    return formatted;
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
    return GlassContainer(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, color: color, size: 16),
                const SizedBox(width: 8),
                Text(
                  title,
                  style: TextStyle(
                    color: Colors.grey[400],
                    fontSize: 12,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              value,
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ====================================================================
// TAB 2: CHAT (AI Gemini)
// ====================================================================

class ChatTab extends StatefulWidget {
  const ChatTab({super.key});

  @override
  State<ChatTab> createState() => _ChatTabState();
}

class _ChatTabState extends State<ChatTab> {
  final _messageController = TextEditingController();
  final _scrollController = ScrollController();
  final _focusNode = FocusNode();

  List<Map<String, dynamic>> _messages = [];
  bool _isLoading = false;
  String? _userId;
  String? _assistantName;
  String? _userNickname;
  String? _remainingQuota;

  @override
  void initState() {
    super.initState();
    _loadUserInfo();
    _loadChatHistory().then((_) {
      _checkAndFetchGreeting();
    });
  }

  Future<void> _checkAndFetchGreeting() async {
    try {
      final session = Supabase.instance.client.auth.currentSession;
      if (session == null) return;

      final response = await http.get(
        Uri.parse('${AppConfig.activeUrl}/api/v1/chat/greeting'),
        headers: {
          'Authorization': 'Bearer ${session.accessToken}',
          'x-jarvis-gateway-key': AppConfig.gatewayKey,
        },
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['should_greet'] == true && data['greeting'] != null) {
          if (mounted) {
            setState(() {
              _messages.add({
                'message': data['greeting'],
                'sender_id': null,
                'created_at': DateTime.now().toIso8601String(),
              });
            });
            _scrollToBottom();
          }
        }
      }
    } catch (e) {
      print('Error fetching greeting: $e');
    }
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
      print('Error loading chat history: $e');
    }
  }

  Future<void> _sendMessage() async {
    final text = _messageController.text.trim();
    if (text.isEmpty || _userId == null) return;

    setState(() {
      _isLoading = true;
    });

    // Add user message
    setState(() {
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

      if (response != null) {
        setState(() {
          if (response['quota'] != null && response['quota']['remainingRequests'] != null) {
            _remainingQuota = response['quota']['remainingRequests'].toString();
          }
          
          // Add AI response(s)
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
        });
        _scrollToBottom();
      }
    } catch (e) {
      print('Error sending message: $e');
      setState(() {
        _messages.add({
          'message': 'Maaf, terjadi kesalahan koneksi.',
          'sender_id': null,
          'created_at': DateTime.now().toIso8601String(),
        });
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
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
      } else {
        print('Chat API error: ${response.statusCode} - ${response.body}');
        return null;
      }
    } catch (e) {
      print('Chat API exception: $e');
      return null;
    }
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
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        title: Column(
          children: [
            Text(_assistantName ?? 'Chat AI'),
            if (_remainingQuota != null)
              Text(
                'Sisa Kuota API: $_remainingQuota',
                style: const TextStyle(fontSize: 12, color: Colors.grey),
              ),
          ],
        ),
        centerTitle: true,
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: Column(
        children: [
          Expanded(
            child: _messages.isEmpty
                ? const Center(
                    child: Text(
                      'Mulai percakapan dengan AI Assistant',
                      style: TextStyle(color: Colors.grey),
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
                      );
                    },
                  ),
          ),
          if (_isLoading)
            const Padding(
              padding: EdgeInsets.all(8),
              child: Row(
                children: [
                  SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  SizedBox(width: 12),
                  Text('AI sedang mengetik...'),
                ],
              ),
            ),
          _buildInputArea(),
        ],
      ),
    );
  }

  Widget _buildInputArea() {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        border: Border(
          top: BorderSide(color: Colors.grey[800]!),
        ),
      ),
      child: SafeArea(
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: _messageController,
                focusNode: _focusNode,
                decoration: InputDecoration(
                  hintText: 'Ketik pesan...',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 12,
                  ),
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

  @override
  void dispose() {
    _messageController.dispose();
    _scrollController.dispose();
    _focusNode.dispose();
    super.dispose();
  }
}

class _ChatBubble extends StatelessWidget {
  final String message;
  final bool isUser;

  const _ChatBubble({
    required this.message,
    required this.isUser,
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
          color: isUser 
              ? const Color(0xFF3B82F6).withValues(alpha: 0.85) 
              : const Color(0xFF1F2937).withValues(alpha: 0.70),
          border: Border.all(
            color: const Color(0x1AFFFFFF),
            width: 1.0,
          ),
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(20),
            topRight: const Radius.circular(20),
            bottomLeft: isUser ? const Radius.circular(20) : Radius.zero,
            bottomRight: isUser ? Radius.zero : const Radius.circular(20),
          ),
        ),
        child: Text(
          message,
          style: const TextStyle(color: Colors.white),
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
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        title: const Text('Pengaturan'),
        centerTitle: true,
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: ListView(
        children: [
          const _ProfileSection(),
          const Divider(),
          _SettingsTile(
            icon: Icons.person,
            title: 'Nama AI',
            subtitle: 'Ubah nama asisten AI',
            onTap: () => _showEditDialog(context, 'Nama AI', 'assistant_name'),
          ),
          _SettingsTile(
            icon: Icons.badge,
            title: 'Nama User',
            subtitle: 'Ubah nama Anda',
            onTap: () => _showEditDialog(context, 'Nama User', 'user_nickname'),
          ),
          _SettingsTile(
            icon: Icons.palette,
            title: 'Tema',
            subtitle: 'Dark / Light / System',
            onTap: () {},
          ),
          const Divider(),
          _SettingsTile(
            icon: Icons.wb_sunny_rounded,
            title: 'Jam Morning Briefing',
            subtitle: 'Atur kapan AI memberi ringkasan pagi',
            onTap: () => _showTimePickerForBriefing(context),
          ),
          const Divider(),
          _SettingsTile(
            icon: Icons.bug_report,
            title: 'Laporkan Bug',
            subtitle: 'Kirim laporan error ke developer',
            onTap: () {
              Sentry.captureMessage('User initiated bug report');
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Terima kasih! Laporan bug sudah dikirim.')),
              );
            },
          ),
          _SettingsTile(
            icon: Icons.warning_amber_rounded,
            title: 'TEST SENTRY CRASH',
            subtitle: 'Uji coba pengiriman error ke Sentry',
            textColor: Colors.orange,
            onTap: () async {
              try {
                throw Exception('Test Sentry Error: Sengaja dipicu dari Settings App (main_new.dart)');
              } catch (e, stackTrace) {
                await Sentry.captureException(e, stackTrace: stackTrace);
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('✅ Error uji coba berhasil dikirim ke Sentry!')),
                  );
                }
              }
            },
          ),
          _SettingsTile(
            icon: Icons.logout,
            title: 'Logout',
            subtitle: 'Keluar dari akun',
            textColor: Colors.red,
            onTap: () => _showLogoutDialog(context),
          ),
          const Divider(),
          const Center(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Text(
                'Personal Asistan v1.0.0',
                style: TextStyle(color: Colors.grey),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _showTimePickerForBriefing(BuildContext context) async {
    final TimeOfDay? picked = await showTimePicker(
      context: context,
      initialTime: const TimeOfDay(hour: 6, minute: 0),
    );
    if (picked != null && context.mounted) {
      final timeStr = '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
      try {
        final userId = Supabase.instance.client.auth.currentUser?.id;
        if (userId != null) {
          final profileRes = await Supabase.instance.client.from('user_profiles').select('dynamic_metadata').eq('id', userId).maybeSingle();
          final metadata = profileRes?['dynamic_metadata'] ?? {};
          metadata['morning_briefing_time'] = timeStr;
          await Supabase.instance.client.from('user_profiles').update({'dynamic_metadata': metadata}).eq('id', userId);
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Jam Morning Briefing diatur ke $timeStr')));
          }
        }
      } catch (e) {
        print('Error saving briefing time: $e');
      }
    }
  }

  void _showEditDialog(BuildContext context, String title, String field) {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Edit $title'),
        content: TextField(
          controller: controller,
          decoration: InputDecoration(
            labelText: title,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () async {
              // TODO: Update to Supabase
              Navigator.pop(context);
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

class _ProfileSection extends StatelessWidget {
  const _ProfileSection();

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Map<String, dynamic>?>(
      future: _loadProfile(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const SizedBox(height: 120);
        }

        final profile = snapshot.data!;
        return Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              CircleAvatar(
                radius: 32,
                backgroundColor: const Color(0xFF3B82F6),
                child: Text(
                  (profile['fullname'] ?? 'U')[0].toUpperCase(),
                  style: const TextStyle(
                    fontSize: 24,
                    color: Colors.white,
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      profile['fullname'] ?? 'User',
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Text(
                      profile['assistant_name'] ?? 'Asisten',
                      style: TextStyle(color: Colors.grey[400]),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Future<Map<String, dynamic>> _loadProfile() async {
    final userId = Supabase.instance.client.auth.currentUser?.id;
    if (userId == null) return {};

    try {
      final res = await Supabase.instance.client
          .from('user_profiles')
          .select('fullname, assistant_name, user_nickname')
          .eq('id', userId)
          .maybeSingle();

      return res ?? {};
    } catch (e) {
      print('Error loading profile: $e');
      return {};
    }
  }
}

class _SettingsTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final Color? textColor;

  const _SettingsTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.textColor,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: textColor),
      title: Text(title, style: TextStyle(color: textColor)),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.chevron_right),
      onTap: onTap,
    );
  }
}

// ====================================================================
// AUTH & PROFILE SETUP SCREENS (Simplified)
// Full implementation moved to lib/screens/auth_screens.dart
// ====================================================================
