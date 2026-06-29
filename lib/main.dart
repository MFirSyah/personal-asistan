// ignore_for_file: avoid_print, deprecated_member_use, experimental_member_use, use_build_context_synchronously, unnecessary_import
import 'dart:convert';
import 'dart:io';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';
import 'package:flutter_markdown/flutter_markdown.dart';

import 'config.dart';
import 'local_db.dart';
import 'sync_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Supabase client
  await Supabase.initialize(
    url: AppConfig.supabaseUrl,
    anonKey: AppConfig.supabaseAnonKey,
  );

  // Initialize offline synchronization background listener
  SyncService.instance.initialize();

  // Initialize Sentry SDK for Layer 12 error tracking
  await SentryFlutter.init(
    (options) {
      options.dsn = AppConfig.sentryDsn;
      options.tracesSampleRate = 1.0;
      options.profilesSampleRate = 1.0;
    },
    appRunner: () => runApp(const MyApp()),
  );
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'personal app',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0B0F19),
        primaryColor: const Color(0xFF3B82F6),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF3B82F6),
          secondary: Color(0xFF8B5CF6),
          surface: Color(0xFF111827),
          error: Color(0xFFEF4444),
          onPrimary: Colors.white,
        ),
        fontFamily: 'sans-serif',
      ),
      home: const AuthWrapper(),
    );
  }
}

// Wrapper class to check Supabase login status and direct user
class AuthWrapper extends StatefulWidget {
  const AuthWrapper({super.key});

  @override
  State<AuthWrapper> createState() => _AuthWrapperState();
}

class _AuthWrapperState extends State<AuthWrapper> {
  bool _isLoading = true;
  User? _user;

  @override
  void initState() {
    super.initState();
    _checkAuth();
    // Listen for auth state changes
    Supabase.instance.client.auth.onAuthStateChange.listen((data) {
      if (mounted) {
        setState(() {
          _user = data.session?.user;
          _isLoading = false;
        });
      }
    });
  }

  Future<void> _checkAuth() async {
    final session = Supabase.instance.client.auth.currentSession;
    if (mounted) {
      setState(() {
        _user = session?.user;
        _isLoading = false;
      });
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
    return _user != null ? const DashboardNavigatorScreen() : const LoginRegisterScreen();
  }
}

// --- Layer 1 & 4: Authentication & Login/Registration Screen ---
class LoginRegisterScreen extends StatefulWidget {
  const LoginRegisterScreen({super.key});

  @override
  State<LoginRegisterScreen> createState() => _LoginRegisterScreenState();
}

class _LoginRegisterScreenState extends State<LoginRegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _fullnameController = TextEditingController();
  bool _isRegister = false;
  bool _isLoading = false;
  bool _obscurePassword = true;
  String _errorMsg = '';

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _isLoading = true;
      _errorMsg = '';
    });

    try {
      final supabase = Supabase.instance.client;
      if (_isRegister) {
        // Sign Up with profile auto-creation
        // NOTE: For testing without email verification, we auto-confirm
        final res = await supabase.auth.signUp(
          email: _emailController.text.trim(),
          password: _passwordController.text,
          data: {
            'fullname': _fullnameController.text.trim(),
            'user_nickname': _fullnameController.text.trim().split(' ')[0],
          },
        );

        // Debug: Log the response
        print("SignUp response: user=${res.user?.id}, session=${res.session != null}");
        print("User confirmed: ${res.user?.emailConfirmedAt}");

        if (res.user != null) {
          // Check if email confirmation is required
          if (res.session != null) {
            // No email confirmation needed - direct login
            try {
              await supabase.from('user_profiles').upsert({
                'id': res.user!.id,
                'fullname': _fullnameController.text.trim(),
                'selected_personality': 'witty_sidekick',
                'assistant_name': 'Sobat AI',
                'user_nickname': _fullnameController.text.trim().split(' ')[0],
              });
            } catch (e) {
              print("Profile creation skipped: $e");
            }
          } else {
            // Email confirmation required
            // For Supabase free tier, try direct signIn immediately
            // or show message
            setState(() {
              _isRegister = false;
              _errorMsg = 'Pendaftaran berhasil! Cek email untuk verifikasi, atau coba login sekarang.';
            });
            return;
          }
        }
      } else {
        // Sign In
        await supabase.auth.signInWithPassword(
          email: _emailController.text.trim(),
          password: _passwordController.text,
        );
      }
    } catch (e) {
      // Professional error wrapping - map backend errors to user-friendly messages
      String friendlyMessage = _getFriendlyErrorMessage(e);
      setState(() {
        _errorMsg = friendlyMessage;
      });
      // Only send non-user errors to Sentry
      bool isUserAuthError = false;
      if (e is AuthException) {
        final msg = e.message.toLowerCase();
        if (msg.contains('credential') ||
            msg.contains('confirm') ||
            msg.contains('already registered') ||
            msg.contains('not found')) {
          isUserAuthError = true;
        }
      }
      if (!isUserAuthError) {
        Sentry.captureException(e);
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  /// Maps backend errors to user-friendly professional messages
  String _getFriendlyErrorMessage(dynamic error) {
    final errorStr = error.toString().toLowerCase();

    // Auth errors
    if (errorStr.contains('invalid login credentials') ||
        errorStr.contains('invalid credentials') ||
        errorStr.contains('wrong password') ||
        errorStr.contains('password')) {
      return '🔐 Email atau kata sandi yang Anda masukkan salah. Silakan coba lagi.';
    }

    if (errorStr.contains('email not found') ||
        errorStr.contains('user not found') ||
        errorStr.contains('not found')) {
      return '📧 Akun dengan email ini belum terdaftar. Silakan daftar terlebih dahulu.';
    }

    if (errorStr.contains('already registered') ||
        errorStr.contains('already exists')) {
      return '📝 Akun dengan email ini sudah terdaftar. Silakan login atau gunakan email lain.';
    }

    if (errorStr.contains('email not confirmed') ||
        errorStr.contains('confirm') ||
        errorStr.contains('verification')) {
      return '✅ Email Anda belum diverifikasi. Silakan cek inbox atau folder spam untuk email verifikasi.';
    }

    if (errorStr.contains('weak password') ||
        errorStr.contains('password too short') ||
        errorStr.contains('invalid format')) {
      return '🔒 Kata sandi terlalu lemah. Minimal 6 karakter dengan kombinasi huruf dan angka.';
    }

    if (errorStr.contains('rate limit') ||
        errorStr.contains('too many request')) {
      return '⏳ Terlalu banyak percobaan. Silakan tunggu beberapa saat sebelum mencoba lagi.';
    }

    if (errorStr.contains('network') ||
        errorStr.contains('connection') ||
        errorStr.contains('timeout') ||
        errorStr.contains('socket')) {
      return '🌐 Koneksi internet bermasalah. Silakan periksa jaringan Anda dan coba lagi.';
    }

    // API errors
    if (errorStr.contains('429')) {
      return '⏳ Server sedang sibuk. Silakan tunggu sebentar dan coba lagi.';
    }

    if (errorStr.contains('500') ||
        errorStr.contains('internal server')) {
      return '🔧 Server sedang maintenance. Silakan coba lagi dalam beberapa menit.';
    }

    if (errorStr.contains('401') ||
        errorStr.contains('unauthorized')) {
      return '🔑 Sesi Anda telah berakhir. Silakan logout dan login kembali.';
    }

    if (errorStr.contains('403') ||
        errorStr.contains('forbidden')) {
      return '🚫 Akses ditolak. Silakan hubungi tim support jika masalah berlanjut.';
    }

    // Database/storage errors
    if (errorStr.contains('duplicate') ||
        errorStr.contains('unique constraint')) {
      return '📋 Data sudah ada sebelumnya. Silakan refresh halaman dan coba lagi.';
    }

    // Default fallback - generic professional message
    return '⚠️ Terjadi kesalahan yang tidak terduga. Silakan coba lagi atau hubungi support.';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          // Background ambient tech glow elements
          Positioned(
            top: -100,
            left: -100,
            child: Container(
              width: 300,
              height: 300,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF3B82F6).withOpacity(0.15),
                    blurRadius: 100,
                  )
                ],
              ),
            ),
          ),
          Positioned(
            bottom: -150,
            right: -100,
            child: Container(
              width: 400,
              height: 400,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF8B5CF6).withOpacity(0.1),
                    blurRadius: 150,
                  )
                ],
              ),
            ),
          ),
          // Form Content
          Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24.0),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 300),
                curve: Curves.easeInOut,
                padding: const EdgeInsets.all(28.0),
                decoration: BoxDecoration(
                  color: const Color(0xCC111827),
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: const Color(0x1CFFFFFF), width: 1.5),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.4),
                      blurRadius: 30,
                      offset: const Offset(0, 10),
                    )
                  ],
                ),
                child: Form(
                  key: _formKey,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Header Logo & Title
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              gradient: const LinearGradient(
                                colors: [Color(0xFF3B82F6), Color(0xFF8B5CF6)],
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color: const Color(0xFF3B82F6).withOpacity(0.3),
                                  blurRadius: 10,
                                )
                              ],
                            ),
                            child: const Icon(Icons.rocket_launch, size: 28, color: Colors.white),
                          ),
                          const SizedBox(width: 12),
                          const Text(
                            'Sobat AI',
                            style: TextStyle(
                              fontSize: 28,
                              fontWeight: FontWeight.bold,
                              letterSpacing: 1.0,
                              color: Colors.white,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _isRegister ? 'Buat akun kognitif Anda' : 'Masuk ke Asisten Pribadi',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.grey, fontSize: 14),
                      ),
                      const SizedBox(height: 24),
                      if (_errorMsg.isNotEmpty)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                          margin: const EdgeInsets.only(bottom: 16),
                          decoration: BoxDecoration(
                            color: const Color(0xFFEF4444).withOpacity(0.15),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: const Color(0xFFEF4444).withOpacity(0.3)),
                          ),
                          child: Text(
                            _errorMsg,
                            style: const TextStyle(color: Color(0xFFFCA5A5), fontSize: 13),
                          ),
                        ),
                      if (_isRegister) ...[
                        TextFormField(
                          controller: _fullnameController,
                          decoration: _inputDecoration('Nama Lengkap', Icons.person),
                          validator: (val) => val == null || val.isEmpty ? 'Nama wajib diisi' : null,
                        ),
                        const SizedBox(height: 16),
                      ],
                      TextFormField(
                        controller: _emailController,
                        keyboardType: TextInputType.emailAddress,
                        decoration: _inputDecoration('Email', Icons.email),
                        validator: (val) => val == null || !val.contains('@') ? 'Email tidak valid' : null,
                      ),
                      const SizedBox(height: 16),
                       TextFormField(
                        controller: _passwordController,
                        obscureText: _obscurePassword,
                        decoration: _inputDecoration(
                          'Password',
                          Icons.lock,
                          suffixIcon: IconButton(
                            icon: Icon(
                              _obscurePassword ? Icons.visibility_off : Icons.visibility,
                              color: Colors.grey,
                            ),
                            onPressed: () {
                              setState(() {
                                _obscurePassword = !_obscurePassword;
                              });
                            },
                          ),
                        ),
                        validator: (val) => val == null || val.length < 6 ? 'Password minimal 6 karakter' : null,
                      ),
                      const SizedBox(height: 24),
                      ElevatedButton(
                        onPressed: _isLoading ? null : _submit,
                        style: ElevatedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          backgroundColor: const Color(0xFF3B82F6),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                          elevation: 3,
                          shadowColor: const Color(0xFF3B82F6).withOpacity(0.4),
                        ),
                        child: _isLoading
                            ? const SizedBox(
                                height: 20,
                                width: 20,
                                child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                              )
                            : Text(
                                _isRegister ? 'DAFTAR' : 'MASUK CEPAT',
                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, letterSpacing: 1.0, color: Colors.white),
                              ),
                      ),
                      const SizedBox(height: 16),
                      TextButton(
                        onPressed: () {
                          setState(() {
                            _isRegister = !_isRegister;
                            _errorMsg = '';
                          });
                        },
                        child: Text(
                          _isRegister ? 'Sudah punya akun? Login disini' : 'Belum punya akun? Daftar gratis',
                          style: const TextStyle(color: Color(0xFF3B82F6)),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          )
        ],
      ),
    );
  }

  InputDecoration _inputDecoration(String label, IconData icon, {Widget? suffixIcon}) {
    return InputDecoration(
      labelText: label,
      prefixIcon: Icon(icon, color: const Color(0xFF3B82F6)),
      suffixIcon: suffixIcon,
      labelStyle: const TextStyle(color: Colors.grey),
      filled: true,
      fillColor: const Color(0xFF0F172A),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0x33FFFFFF)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFF3B82F6)),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFFEF4444)),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFFEF4444)),
      ),
    );
  }
}

// --- Main Container with bottom tabs ---
class DashboardNavigatorScreen extends StatefulWidget {
  const DashboardNavigatorScreen({super.key});

  @override
  State<DashboardNavigatorScreen> createState() => _DashboardNavigatorScreenState();
}

class _DashboardNavigatorScreenState extends State<DashboardNavigatorScreen> {
  int _currentIndex = 0;
  final GlobalKey<_NativeChatScreenState> _chatScreenKey = GlobalKey<_NativeChatScreenState>();
  bool _briefingChecked = false;

  late final List<Widget> _screens;

  @override
  void initState() {
    super.initState();
    _screens = [
      const WebAppDashboardScreen(),
      NativeChatScreen(key: _chatScreenKey),
      const NativeSettingsScreen(),
    ];
    // Check morning briefing after first frame renders
    WidgetsBinding.instance.addPostFrameCallback((_) => _checkMorningBriefing());
  }

  Future<void> _checkMorningBriefing() async {
    if (_briefingChecked) return;
    _briefingChecked = true;
    try {
      final session = Supabase.instance.client.auth.currentSession;
      if (session == null) return;

      // Get user timezone
      final userTimezone = DateTime.now().timeZoneName;
      final timezoneMap = {
        'WIB': 'Asia/Jakarta',
        'WITA': 'Asia/Makassar',
        'WIT': 'Asia/Jayapura',
      };
      final mappedTimezone = timezoneMap[userTimezone] ?? 'Asia/Jakarta';

      final response = await http.get(
        Uri.parse('${AppConfig.activeUrl}/api/v1/briefing?timezone=${Uri.encodeComponent(mappedTimezone)}'),
        headers: {
          'x-jarvis-gateway-key': AppConfig.gatewayKey,
          'Authorization': 'Bearer ${session.accessToken}',
        },
      );
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['show_briefing'] == true && data['briefing_text'] != null && mounted) {
          _showBriefingPopup(data['briefing_text']);
        }
      }
    } catch (e) {
      print('Morning briefing check error: $e');
    }
  }

  void _showBriefingPopup(String briefingText) {
    showDialog(
      context: context,
      barrierDismissible: true,
      barrierColor: Colors.black.withOpacity(0.7),
      builder: (ctx) => BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
        child: Dialog(
          backgroundColor: Colors.transparent,
          insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
          child: Container(
            constraints: const BoxConstraints(maxWidth: 400, maxHeight: 500),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFF1E293B), Color(0xFF0F172A)],
              ),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFF3B82F6).withOpacity(0.3)),
              boxShadow: [
                BoxShadow(color: const Color(0xFF3B82F6).withOpacity(0.15), blurRadius: 30, spreadRadius: 5),
              ],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Header
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    border: Border(bottom: BorderSide(color: Colors.white.withOpacity(0.1))),
                  ),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: const Color(0xFF3B82F6).withOpacity(0.2),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(Icons.wb_sunny_rounded, color: Color(0xFFFBBF24), size: 24),
                      ),
                      const SizedBox(width: 12),
                      const Expanded(
                        child: Text('Morning Briefing ☀️', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                      ),
                    ],
                  ),
                ),
                // Content
                Flexible(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(20),
                    child: Text(briefingText, style: const TextStyle(color: Colors.white70, fontSize: 14, height: 1.6)),
                  ),
                ),
                // Button
                Padding(
                  padding: const EdgeInsets.all(20),
                  child: SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: () => Navigator.pop(ctx),
                      icon: const Icon(Icons.favorite, size: 18),
                      label: const Text('Terima Kasih', style: TextStyle(fontWeight: FontWeight.bold)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF3B82F6),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: _screens,
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) {
          setState(() {
            _currentIndex = index;
          });
          if (index == 1) {
            _chatScreenKey.currentState?._loadProfileAndChatCache();
          }
        },
        type: BottomNavigationBarType.fixed,
        backgroundColor: const Color(0xFF0B0F19),
        selectedItemColor: const Color(0xFF3B82F6),
        unselectedItemColor: Colors.grey,
        selectedLabelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
        unselectedLabelStyle: const TextStyle(fontSize: 11),
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.dashboard_rounded), label: 'Dasbor'),
          BottomNavigationBarItem(icon: Icon(Icons.chat_bubble_rounded), label: 'Chat'),
          BottomNavigationBarItem(icon: Icon(Icons.settings_rounded), label: 'Profil'),
        ],
      ),
    );
  }
}

// --- Tab 1: WebApp Dashboard WebView + Token postMessage (Layer 5) ---
class WebAppDashboardScreen extends StatefulWidget {
  const WebAppDashboardScreen({super.key});

  @override
  State<WebAppDashboardScreen> createState() => _WebAppDashboardScreenState();
}

class _WebAppDashboardScreenState extends State<WebAppDashboardScreen> {
  InAppWebViewController? _webViewController;
  bool _isLoading = true;
  double _progress = 0.0;

  String get _currentUrl => AppConfig.activeUrl;

  Future<void> _injectSessionHandshake() async {
    final session = Supabase.instance.client.auth.currentSession;
    if (session == null || _webViewController == null) return;

    print("Executing postMessage token handshake in WebView.");
    final jsCode = """
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'SESSION_TOKENS',
          access_token: '${session.accessToken}',
          refresh_token: '${session.refreshToken}'
        }
      }));
    """;
    
    // Inject multiple times/delays to ensure dashboard listener is fully initialized
    await _webViewController!.evaluateJavascript(source: jsCode);
    Future.delayed(const Duration(milliseconds: 500), () {
      _webViewController?.evaluateJavascript(source: jsCode);
    });
    Future.delayed(const Duration(milliseconds: 1500), () {
      _webViewController?.evaluateJavascript(source: jsCode);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard Analitis', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
        centerTitle: false,
        backgroundColor: const Color(0xFF0F172A),
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              setState(() {
                _isLoading = true;
              });
              _webViewController?.reload();
            },
          )
        ],
      ),
      body: Stack(
        children: [
          InAppWebView(
            initialUrlRequest: URLRequest(url: WebUri("$_currentUrl/dashboard")),
            initialSettings: InAppWebViewSettings(
              javaScriptEnabled: true,
              domStorageEnabled: true,
              useWideViewPort: true,
              loadWithOverviewMode: true,
              clearCache: true,
            ),
            onWebViewCreated: (controller) {
              _webViewController = controller;
            },
            onConsoleMessage: (controller, consoleMessage) {
              print("[WebView Console] ${consoleMessage.messageLevel}: ${consoleMessage.message}");
            },
            onReceivedError: (controller, request, error) {
              print("[WebView Error] ${error.description} (code: ${error.type})");
            },
            onReceivedHttpError: (controller, request, errorResponse) {
              print("[WebView HTTP Error] URL: ${request.url}, Status code: ${errorResponse.statusCode}");
            },
            onLoadStop: (controller, url) async {
              setState(() {
                _isLoading = false;
              });
              // Perform the secure postMessage credentials transmission
              await _injectSessionHandshake();
            },
            onProgressChanged: (controller, progress) {
              setState(() {
                _progress = progress / 100;
              });
            },
          ),
          if (_isLoading)
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: LinearProgressIndicator(
                value: _progress,
                color: const Color(0xFF3B82F6),
                backgroundColor: const Color(0xFF0F172A),
              ),
            ),
        ],
      ),
    );
  }
}

// --- Tab 2: Chat Asisten Native UI + Multi-Bubble typing rendering (Layer 4) ---
class NativeChatScreen extends StatefulWidget {
  const NativeChatScreen({super.key});

  @override
  State<NativeChatScreen> createState() => _NativeChatScreenState();
}

class _NativeChatScreenState extends State<NativeChatScreen> {
  final _msgController = TextEditingController();
  final _scrollController = ScrollController();
  final _dbHelper = LocalDatabaseHelper.instance;
  final List<Map<String, dynamic>> _messages = [];
  bool _isTyping = false;
  String _assistantName = 'Sobat AI';
  String _preferredLanguage = 'id';
  bool _greetingChecked = false;

  @override
  void initState() {
    super.initState();
    _loadProfileAndChatCache();
  }

  Future<void> _loadProfileAndChatCache() async {
    try {
      final user = Supabase.instance.client.auth.currentUser;
      if (user != null) {
        final profileRes = await Supabase.instance.client
            .from('user_profiles')
            .select('assistant_name, dynamic_metadata')
            .eq('id', user.id)
            .maybeSingle();
        if (profileRes != null && mounted) {
          setState(() {
            _assistantName = profileRes['assistant_name'] ?? 'Sobat AI';
            final meta = profileRes['dynamic_metadata'] as Map<String, dynamic>?;
            _preferredLanguage = meta?['language'] ?? 'id';
          });
        } else if (profileRes == null && mounted) {
          try {
            await Supabase.instance.client.from('user_profiles').upsert({
              'id': user.id,
              'fullname': user.email?.split('@')[0] ?? 'Pengguna',
              'selected_personality': 'witty_sidekick',
              'assistant_name': 'Sobat AI',
              'user_nickname': user.email?.split('@')[0] ?? 'Pengguna',
              'dynamic_metadata': {
                'future_plans': []
              }
            });
          } catch (e) {
            print("Auto profile creation failed in chat: $e");
          }
        }
      }
      
      // Load offline cache
      final cachedMsgs = await _dbHelper.getChatMessages(null);
      if (mounted) {
        setState(() {
          _messages.clear();
          _messages.addAll(cachedMsgs);
        });
        _scrollToBottom();
      }
      // Check idle greeting
      _checkIdleGreeting();
    } catch (e) {
      print("Chat initialization error: $e");
    }
  }

  Future<void> _checkIdleGreeting() async {
    if (_greetingChecked) return;
    _greetingChecked = true;
    try {
      final session = Supabase.instance.client.auth.currentSession;
      if (session == null) return;
      final response = await http.get(
        Uri.parse('${AppConfig.activeUrl}/api/v1/chat/greeting'),
        headers: {
          'x-jarvis-gateway-key': AppConfig.gatewayKey,
          'Authorization': 'Bearer ${session.accessToken}',
        },
      );
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['should_greet'] == true && data['greeting'] != null && mounted) {
          final greetingMsg = {
            'id': const Uuid().v4(),
            'room_id': null,
            'sender_id': null,
            'sender_personality_id': 'greeting',
            'message': data['greeting'],
            'created_at': DateTime.now().toIso8601String(),
          };
          setState(() {
            _messages.add(greetingMsg);
          });
          _scrollToBottom();
        }
      }
    } catch (e) {
      print('Idle greeting error: $e');
    }
  }

  void _scrollToBottom() {
    Future.delayed(const Duration(milliseconds: 100), () {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _sendMessage() async {
    final text = _msgController.text.trim();
    if (text.isEmpty) return;
    _msgController.clear();

    final user = Supabase.instance.client.auth.currentUser;
    final userMsg = {
      'id': const Uuid().v4(),
      'room_id': null,
      'sender_id': user?.id ?? 'user',
      'sender_personality_id': null,
      'message': text,
      'created_at': DateTime.now().toIso8601String(),
    };

    setState(() {
      _messages.add(userMsg);
      _isTyping = true;
    });
    _scrollToBottom();

    // Cache user message locally
    await _dbHelper.insertChatMessage(userMsg);

    try {
      // Call Next.js Server Chat API with user timezone
      final session = Supabase.instance.client.auth.currentSession;
      print("JWT ACCESS TOKEN: ${session?.accessToken}");

      // Get user timezone
      final userTimezone = DateTime.now().timeZoneName;
      final timezoneMap = {
        'WIB': 'Asia/Jakarta',
        'WITA': 'Asia/Makassar',
        'WIT': 'Asia/Jayapura',
      };
      final mappedTimezone = timezoneMap[userTimezone] ?? 'Asia/Jakarta';

      final response = await http.post(
        Uri.parse('${AppConfig.activeUrl}/api/v1/chat'),
        headers: {
          'Content-Type': 'application/json',
          'x-jarvis-gateway-key': AppConfig.gatewayKey,
          'Authorization': 'Bearer ${session?.accessToken ?? ""}',
        },
        body: jsonEncode({
          'message': text,
          'room_id': null,
          'language': _preferredLanguage,
          'timezone': mappedTimezone,
        }),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final List<dynamic> bubbles = data['bubbles'] ?? [];

        setState(() {
          _isTyping = false;
        });

        // Loop bubbles directly and render sequentially with simulation typing delay
        for (var bubbleText in bubbles) {
          if (!mounted) break;
          
          // Dynamic typing delay simulation based on text length (clamp between 250ms and 900ms)
          setState(() {
            _isTyping = true;
          });
          _scrollToBottom();
          int delayMs = (bubbleText.toString().length * 8).clamp(250, 900);
          await Future.delayed(Duration(milliseconds: delayMs));

          if (!mounted) break;
          
          final aiMsg = {
            'id': const Uuid().v4(),
            'room_id': null,
            'sender_id': null,
            'sender_personality_id': 'personality', // representation
            'message': bubbleText.toString(),
            'created_at': DateTime.now().toIso8601String(),
          };

          setState(() {
            _messages.add(aiMsg);
            _isTyping = false;
          });
          _scrollToBottom();

          // Save AI response message to offline SQLite cache
          await _dbHelper.insertChatMessage(aiMsg);
        }
      } else {
        throw Exception('Server responded with status: ${response.statusCode} (${response.body})');
      }
    } catch (e) {
      setState(() {
        _isTyping = false;
      });
      Sentry.captureException(e);

      // Fallback response for offline / error - professional message
      final fallbackMsg = {
        'id': const Uuid().v4(),
        'room_id': null,
        'sender_id': null,
        'sender_personality_id': 'error',
        'message': '🔄 Koneksi ke server terputus.\n\nPesan Anda tetap tersimpan secara lokal dan akan dikirim otomatis saat koneksi pulih.\n\n💡 Tips: Pastikan koneksi internet stabil untuk pengalaman terbaik.',
        'created_at': DateTime.now().toIso8601String(),
      };
      setState(() {
        _messages.add(fallbackMsg);
      });
      _scrollToBottom();
    }
  }

  void _showSearchDialog() {
    final searchController = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        title: const Row(
          children: [
            Icon(Icons.search, color: Color(0xFF3B82F6)),
            SizedBox(width: 8),
            Text('Cari Data', style: TextStyle(color: Colors.white)),
          ],
        ),
        content: SizedBox(
          width: double.maxFinite,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: searchController,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  hintText: 'Ketik kata kunci...',
                  hintStyle: const TextStyle(color: Colors.grey),
                  filled: true,
                  fillColor: const Color(0xFF0F172A),
                  prefixIcon: const Icon(Icons.search, color: Colors.grey),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                ),
                onSubmitted: (value) {
                  if (value.length >= 2) {
                    Navigator.pop(ctx);
                    _performSearch(value);
                  }
                },
              ),
              const SizedBox(height: 8),
              const Text(
                'Minimal 2 karakter',
                style: TextStyle(color: Colors.grey, fontSize: 12),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Batal', style: TextStyle(color: Colors.grey)),
          ),
          ElevatedButton(
            onPressed: () {
              if (searchController.text.length >= 2) {
                Navigator.pop(ctx);
                _performSearch(searchController.text);
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF3B82F6),
            ),
            child: const Text('Cari'),
          ),
        ],
      ),
    );
  }

  void _performSearch(String query) async {
    try {
      final session = Supabase.instance.client.auth.currentSession;
      final response = await http.get(
        Uri.parse('${AppConfig.activeUrl}/api/v1/search?q=${Uri.encodeComponent(query)}'),
        headers: {
          'x-jarvis-gateway-key': AppConfig.gatewayKey,
          'Authorization': 'Bearer ${session?.accessToken ?? ""}',
        },
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        _showSearchResults(query, data);
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Gagal mencari data'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    } catch (e) {
      print('Search error: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Koneksi bermasalah saat mencari'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  void _showSearchResults(String query, Map<String, dynamic> data) {
    final results = data['results'] as Map<String, dynamic>;
    final transactions = results['transactions'] as List? ?? [];
    final tasks = results['tasks'] as List? ?? [];
    final chat = results['chat'] as List? ?? [];
    final total = data['total'] as int? ?? 0;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF0F172A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.7,
        minChildSize: 0.4,
        maxChildSize: 0.95,
        expand: false,
        builder: (context, scrollController) => Column(
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFF1E293B),
                borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
              ),
              child: Column(
                children: [
                  Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: Colors.grey,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      const Icon(Icons.search, color: Color(0xFF3B82F6)),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Hasil pencarian: "$query"',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      Text(
                        '$total hasil',
                        style: const TextStyle(color: Colors.grey),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            Expanded(
              child: total == 0
                  ? const Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.search_off, size: 64, color: Colors.grey),
                          SizedBox(height: 16),
                          Text(
                            'Tidak ada hasil',
                            style: TextStyle(color: Colors.grey, fontSize: 16),
                          ),
                        ],
                      ),
                    )
                  : ListView(
                      controller: scrollController,
                      padding: const EdgeInsets.all(16),
                      children: [
                        // Transactions
                        if (transactions.isNotEmpty) ...[
                          _buildSearchSection('💰 Transaksi', transactions, Icons.attach_money),
                          const SizedBox(height: 16),
                        ],
                        // Tasks
                        if (tasks.isNotEmpty) ...[
                          _buildSearchSection('✅ Tugas', tasks, Icons.task_alt),
                          const SizedBox(height: 16),
                        ],
                        // Chat
                        if (chat.isNotEmpty) ...[
                          _buildSearchSection('💬 Percakapan', chat, Icons.chat_bubble_outline),
                        ],
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSearchSection(String title, List items, IconData icon) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, color: const Color(0xFF3B82F6), size: 20),
            const SizedBox(width: 8),
            Text(
              '$title (${items.length})',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 14,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        ...items.map((item) => _buildSearchItem(item)).toList(),
      ],
    );
  }

  Widget _buildSearchItem(Map<String, dynamic> item) {
    final category = item['category'] as String? ?? '';
    String title = '';
    String subtitle = '';
    IconData icon = Icons.article;

    if (category == 'transaction') {
      final type = item['type'] as String? ?? 'expense';
      final amount = item['amount'] ?? 0;
      title = item['description'] ?? 'Transaksi';
      subtitle = '${type == 'income' ? '+' : '-'} Rp ${NumberFormat('#,###').format(amount)}';
      icon = type == 'income' ? Icons.arrow_downward : Icons.arrow_upward;
    } else if (category == 'task') {
      title = item['task_name'] ?? 'Tugas';
      subtitle = item['status'] ?? 'pending';
      icon = Icons.task_alt;
    } else if (category == 'chat') {
      title = item['message'] ?? 'Pesan';
      subtitle = item['sender'] == 'user' ? 'Anda' : 'AI';
      icon = Icons.chat_bubble;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withOpacity(0.1)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: const Color(0xFF3B82F6).withOpacity(0.2),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: const Color(0xFF3B82F6), size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title.length > 60 ? '${title.substring(0, 60)}...' : title,
                  style: const TextStyle(color: Colors.white, fontSize: 14),
                ),
                Text(
                  subtitle,
                  style: const TextStyle(color: Colors.grey, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            CircleAvatar(
              backgroundColor: const Color(0xFF3B82F6).withOpacity(0.15),
              child: const Icon(Icons.psychology, color: Color(0xFF3B82F6)),
            ),
            const SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_assistantName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                Row(
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0xFF10B981)),
                    ),
                    const SizedBox(width: 4),
                    const Text('Real-time Cognitive Engine', style: TextStyle(color: Colors.grey, fontSize: 11)),
                  ],
                ),
              ],
            ),
          ],
        ),
        backgroundColor: const Color(0xFF0F172A),
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.search_rounded),
            tooltip: 'Cari',
            onPressed: () => _showSearchDialog(),
          ),
          IconButton(
            icon: const Icon(Icons.delete_sweep_rounded),
            tooltip: 'Hapus Cache Percakapan',
            onPressed: () async {
              final confirm = await showDialog<bool>(
                context: context,
                builder: (ctx) => AlertDialog(
                  backgroundColor: const Color(0xFF1E293B),
                  title: const Text('Hapus Percakapan?', style: TextStyle(color: Colors.white)),
                  content: const Text('Apakah Anda yakin ingin menghapus cache percakapan ini? (Data di cloud tetap aman).', style: TextStyle(color: Colors.grey)),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal', style: TextStyle(color: Colors.grey))),
                    TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Hapus', style: TextStyle(color: Color(0xFFEF4444)))),
                  ],
                ),
              );
              if (confirm == true) {
                // Show loading progress dialog
                BuildContext? progressDialogContext;
                showDialog(
                  context: context,
                  barrierDismissible: false,
                  builder: (ctx) {
                    progressDialogContext = ctx;
                    return const Center(
                      child: CircularProgressIndicator(color: Color(0xFF3B82F6)),
                    );
                  },
                );

                try {
                  final session = Supabase.instance.client.auth.currentSession;
                  final response = await http.post(
                    Uri.parse('${AppConfig.activeUrl}/api/v1/chat/summarize'),
                    headers: {
                      'Content-Type': 'application/json',
                      'x-jarvis-gateway-key': AppConfig.gatewayKey,
                      'Authorization': 'Bearer ${session?.accessToken ?? ""}',
                    },
                  ).timeout(const Duration(seconds: 15));

                  // Pop the progress indicator
                  if (progressDialogContext != null && progressDialogContext!.mounted) {
                    Navigator.pop(progressDialogContext!);
                  }

                  String summaryMsg = 'Percakapan berhasil dibersihkan.';
                  if (response.statusCode == 200) {
                    final resData = jsonDecode(response.body);
                    if (resData['success'] == true && resData['summary'] != null) {
                      summaryMsg = 'Rangkuman Percakapan:\n\n${resData['summary']}';
                    }
                  }

                  // Clear local db cache
                  await _dbHelper.clearChatCache(null);
                  if (mounted) {
                    setState(() {
                      _messages.clear();
                    });
                    
                    // Show summary dialog
                    showDialog(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        backgroundColor: const Color(0xFF1E293B),
                        title: const Text('Percakapan Dihapus', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                        content: Text(summaryMsg, style: const TextStyle(color: Colors.grey)),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.pop(ctx),
                            child: const Text('Selesai', style: TextStyle(color: Color(0xFF3B82F6))),
                          ),
                        ],
                      ),
                    );
                  }
                } catch (e) {
                  // Pop the progress indicator if still open
                  if (progressDialogContext != null && progressDialogContext!.mounted) {
                    Navigator.pop(progressDialogContext!);
                  }
                  print("Error during summarization: $e");
                  Sentry.captureException(e);

                  // Show professional error message
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('🔄 Ringkasan tidak dapat diproses saat ini. Pesan lokal tetap dihapus.'),
                        backgroundColor: Color(0xFF10B981),
                      ),
                    );
                  }

                  // Clear local cache anyway as fallback
                  await _dbHelper.clearChatCache(null);
                  if (mounted) {
                    setState(() {
                      _messages.clear();
                    });
                  }
                }
              }
            },
          )
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              controller: _scrollController,
              padding: const EdgeInsets.all(16),
              itemCount: _messages.length + (_isTyping ? 1 : 0),
              itemBuilder: (context, index) {
                if (index == _messages.length) {
                  return _buildTypingBubble();
                }
                final msg = _messages[index];
                final isUser = msg['sender_id'] != null;
                return _buildChatBubble(msg['message'], isUser);
              },
            ),
          ),
          _buildMessageInput(),
        ],
      ),
    );
  }

  Widget _buildChatBubble(String text, bool isUser) {
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
        decoration: BoxDecoration(
          color: isUser ? const Color(0xFF3B82F6) : const Color(0xFF1E293B),
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: isUser ? const Radius.circular(16) : const Radius.circular(0),
            bottomRight: isUser ? const Radius.circular(0) : const Radius.circular(16),
          ),
          border: isUser ? null : Border.all(color: const Color(0x1CFFFFFF)),
        ),
        child: isUser
            ? Text(
                text,
                style: const TextStyle(color: Colors.white, fontSize: 14, height: 1.3),
              )
            : MarkdownBody(
                data: text,
                styleSheet: MarkdownStyleSheet(
                  p: const TextStyle(color: Colors.white, fontSize: 14, height: 1.3),
                  strong: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
                  em: const TextStyle(color: Colors.white, fontStyle: FontStyle.italic, fontSize: 14),
                  listBullet: const TextStyle(color: Colors.white, fontSize: 14),
                  listBulletPadding: const EdgeInsets.only(right: 6, top: 2),
                  h1: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
                  h2: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                  h3: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                  code: const TextStyle(
                    color: Color(0xFF8B5CF6),
                    backgroundColor: Color(0xFF0F172A),
                    fontSize: 12,
                    fontFamily: 'monospace',
                  ),
                ),
              ),
      ),
    );
  }

  Widget _buildTypingBubble() {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: const Color(0xFF1E293B),
          borderRadius: const BorderRadius.only(
            topLeft: Radius.circular(16),
            topRight: Radius.circular(16),
            bottomRight: Radius.circular(16),
          ),
          border: Border.all(color: const Color(0x1CFFFFFF)),
        ),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF3B82F6)),
            ),
            SizedBox(width: 8),
            Text('Mengetik analisis...', style: TextStyle(color: Colors.grey, fontSize: 13)),
          ],
        ),
      ),
    );
  }

  Widget _buildMessageInput() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: const BoxDecoration(
        color: Color(0xFF0F172A),
        border: Border(top: BorderSide(color: Color(0x1CFFFFFF))),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _msgController,
              minLines: 1,
              maxLines: 5,
              keyboardType: TextInputType.multiline,
              textInputAction: TextInputAction.newline,
              decoration: InputDecoration(
                hintText: 'Ketik pesan Anda...',
                hintStyle: const TextStyle(color: Colors.grey, fontSize: 14),
                filled: true,
                fillColor: const Color(0xFF0B0F19),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: const BorderSide(color: Color(0x33FFFFFF)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: const BorderSide(color: Color(0xFF3B82F6)),
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          GestureDetector(
            onTap: _sendMessage,
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                color: Color(0xFF3B82F6),
              ),
              child: const Icon(Icons.send_rounded, color: Colors.white, size: 20),
            ),
          )
        ],
      ),
    );
  }
}

// --- Tab 3: Money Tracker + SQLite local CRUD + base64 Receipt storage (Layer 3 & 13) ---
class NativeMoneyTrackerScreen extends StatefulWidget {
  const NativeMoneyTrackerScreen({super.key});

  @override
  State<NativeMoneyTrackerScreen> createState() => _NativeMoneyTrackerScreenState();
}

class _NativeMoneyTrackerScreenState extends State<NativeMoneyTrackerScreen> {
  final _dbHelper = LocalDatabaseHelper.instance;
  final List<Map<String, dynamic>> _transactions = [];
  bool _isLoading = true;

  final _formKey = GlobalKey<FormState>();
  final _amountController = TextEditingController();
  final _descController = TextEditingController();
  String _txType = 'expense'; // expense or income
  File? _receiptImage;
  String? _receiptBase64;

  @override
  void initState() {
    super.initState();
    _loadTransactions();
  }

  Future<void> _loadTransactions() async {
    setState(() {
      _isLoading = true;
    });
    try {
      final txs = await _dbHelper.getTransactions();
      setState(() {
        _transactions.clear();
        _transactions.addAll(txs);
        _isLoading = false;
      });
    } catch (e) {
      print("Failed loading transactions: $e");
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _pickImage(ImageSource source) async {
    try {
      final picker = ImagePicker();
      final pickedFile = await picker.pickImage(source: source, imageQuality: 50);
      if (pickedFile != null) {
        final file = File(pickedFile.path);
        final bytes = await file.readAsBytes();
        setState(() {
          _receiptImage = file;
          _receiptBase64 = base64Encode(bytes);
        });
      }
    } catch (e) {
      print("Image picking error: $e");
    }
  }

  Future<void> _saveTransaction() async {
    if (!_formKey.currentState!.validate()) return;

    final amount = double.parse(_amountController.text.trim());
    final desc = _descController.text.trim();
    final txId = const Uuid().v4();
    final dateStr = DateTime.now().toIso8601String().split('T')[0];

    // Build receipt path structure if image uploaded
    String? localReceiptUrl;
    if (_receiptBase64 != null) {
      localReceiptUrl = "data:image/jpeg;base64,$_receiptBase64";
    }

    final newTx = {
      'id': txId,
      'amount': amount,
      'type': _txType,
      'description': desc,
      'transaction_date': dateStr,
      'dynamic_metadata': {
        'receipt_url': localReceiptUrl,
        'created_at': DateTime.now().toIso8601String(),
      },
      'is_synced': 0
    };

    // Insert locally in SQLite
    await _dbHelper.insertTransaction(newTx);
    
    // Clear Form
    _amountController.clear();
    _descController.clear();
    setState(() {
      _receiptImage = null;
      _receiptBase64 = null;
    });
    
    Navigator.of(context).pop();
    _loadTransactions();

    // Trigger background synchronization
    SyncService.instance.triggerSync();
  }

  void _showAddDialog() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF0F172A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                bottom: MediaQuery.of(context).viewInsets.bottom,
                left: 20,
                right: 20,
                top: 24,
              ),
              child: SingleChildScrollView(
                child: Form(
                  key: _formKey,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'Tambah Transaksi Baru',
                        style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 16),
                      // Segmented Type Selector
                      Row(
                        children: [
                          Expanded(
                            child: ElevatedButton(
                              onPressed: () {
                                setModalState(() {
                                  _txType = 'expense';
                                });
                              },
                              style: ElevatedButton.styleFrom(
                                backgroundColor: _txType == 'expense' ? const Color(0xFFEF4444) : const Color(0xFF1E293B),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                              ),
                              child: const Text('PENGELUARAN'),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: ElevatedButton(
                              onPressed: () {
                                setModalState(() {
                                  _txType = 'income';
                                });
                              },
                              style: ElevatedButton.styleFrom(
                                backgroundColor: _txType == 'income' ? const Color(0xFF10B981) : const Color(0xFF1E293B),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                              ),
                              child: const Text('PEMASUKAN'),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: _amountController,
                        keyboardType: TextInputType.number,
                        decoration: _inputDecoration('Jumlah (Rupiah)'),
                        validator: (val) => val == null || double.tryParse(val) == null ? 'Jumlah nominal wajib diisi' : null,
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: _descController,
                        decoration: _inputDecoration('Deskripsi Transaksi'),
                        validator: (val) => val == null || val.isEmpty ? 'Deskripsi wajib diisi' : null,
                      ),
                      const SizedBox(height: 16),
                      // Receipt upload thumbnail logic
                      Row(
                        children: [
                          Expanded(
                            child: TextButton.icon(
                              onPressed: () async {
                                await _pickImage(ImageSource.camera);
                                setModalState(() {});
                              },
                              icon: const Icon(Icons.camera_alt, color: Color(0xFF3B82F6)),
                              label: const Text('Kamera', style: TextStyle(color: Color(0xFF3B82F6))),
                            ),
                          ),
                          Expanded(
                            child: TextButton.icon(
                              onPressed: () async {
                                await _pickImage(ImageSource.gallery);
                                setModalState(() {});
                              },
                              icon: const Icon(Icons.photo, color: Color(0xFF3B82F6)),
                              label: const Text('Galeri', style: TextStyle(color: Color(0xFF3B82F6))),
                            ),
                          ),
                        ],
                      ),
                      if (_receiptImage != null)
                        Container(
                          margin: const EdgeInsets.symmetric(vertical: 12),
                          height: 120,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(12),
                            image: DecorationImage(
                              image: FileImage(_receiptImage!),
                              fit: BoxFit.cover,
                            ),
                          ),
                          child: Align(
                            alignment: Alignment.topRight,
                            child: IconButton(
                              icon: const Icon(Icons.cancel, color: Colors.red),
                              onPressed: () {
                                setModalState(() {
                                  _receiptImage = null;
                                  _receiptBase64 = null;
                                });
                              },
                            ),
                          ),
                        ),
                      const SizedBox(height: 24),
                      ElevatedButton(
                        onPressed: _saveTransaction,
                        style: ElevatedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          backgroundColor: const Color(0xFF3B82F6),
                        ),
                        child: const Text('SIMPAN TRANSAKSI', style: TextStyle(fontWeight: FontWeight.bold)),
                      ),
                      const SizedBox(height: 24),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  InputDecoration _inputDecoration(String label) {
    return InputDecoration(
      labelText: label,
      labelStyle: const TextStyle(color: Colors.grey),
      filled: true,
      fillColor: const Color(0xFF0B0F19),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: Color(0x33FFFFFF)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: Color(0xFF3B82F6)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final currencyFormat = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Catatan Keuangan', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
        backgroundColor: const Color(0xFF0F172A),
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.sync_rounded),
            onPressed: () async {
              await SyncService.instance.triggerSync();
              _loadTransactions();
            },
          )
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _transactions.isEmpty
              ? const Center(child: Text('Belum ada transaksi keuangan.', style: TextStyle(color: Colors.grey)))
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _transactions.length,
                  itemBuilder: (context, index) {
                    final tx = _transactions[index];
                    final isExpense = tx['type'] == 'expense';
                    final hasImage = tx['dynamic_metadata']?['receipt_url'] != null;

                    return Card(
                      color: const Color(0xFF1E293B),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      margin: const EdgeInsets.only(bottom: 12),
                      child: ListTile(
                        leading: CircleAvatar(
                          backgroundColor: isExpense ? const Color(0xFFEF4444).withOpacity(0.15) : const Color(0xFF10B981).withOpacity(0.15),
                          child: Icon(
                            isExpense ? Icons.arrow_downward : Icons.arrow_upward,
                            color: isExpense ? const Color(0xFFEF4444) : const Color(0xFF10B981),
                          ),
                        ),
                        title: Text(tx['description'] ?? 'Lain-lain', style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Row(
                          children: [
                            Text(tx['transaction_date'] ?? ''),
                            if (hasImage) ...[
                              const SizedBox(width: 8),
                              const Icon(Icons.receipt_long, size: 14, color: Colors.blue),
                            ],
                            const SizedBox(width: 8),
                            if (tx['is_synced'] == 0)
                              const Icon(Icons.cloud_queue_rounded, size: 14, color: Colors.grey)
                            else
                              const Icon(Icons.cloud_done_rounded, size: 14, color: Colors.green),
                          ],
                        ),
                        trailing: Text(
                          currencyFormat.format(tx['amount']),
                          style: TextStyle(
                            color: isExpense ? const Color(0xFFEF4444) : const Color(0xFF10B981),
                            fontWeight: FontWeight.bold,
                            fontSize: 15,
                          ),
                        ),
                      ),
                    );
                  },
                ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showAddDialog,
        backgroundColor: const Color(0xFF3B82F6),
        child: const Icon(Icons.add, color: Colors.white),
      ),
    );
  }
}

// --- Tab 4: To-Do List + SQLite local CRUD (Layer 3 & 13) ---
class NativeTodoListScreen extends StatefulWidget {
  const NativeTodoListScreen({super.key});

  @override
  State<NativeTodoListScreen> createState() => _NativeTodoListScreenState();
}

class _NativeTodoListScreenState extends State<NativeTodoListScreen> {
  final _dbHelper = LocalDatabaseHelper.instance;
  final List<Map<String, dynamic>> _tasks = [];
  bool _isLoading = true;

  final _formKey = GlobalKey<FormState>();
  final _taskNameController = TextEditingController();
  String _dueDateStr = '';

  @override
  void initState() {
    super.initState();
    _loadTasks();
  }

  Future<void> _loadTasks() async {
    setState(() {
      _isLoading = true;
    });
    try {
      final tasks = await _dbHelper.getTasks();
      setState(() {
        _tasks.clear();
        _tasks.addAll(tasks);
        _isLoading = false;
      });
    } catch (e) {
      print("Failed loading tasks: $e");
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _saveTask() async {
    if (!_formKey.currentState!.validate()) return;

    final name = _taskNameController.text.trim();
    final taskId = const Uuid().v4();
    final due = _dueDateStr.isEmpty ? DateTime.now().add(const Duration(days: 1)).toIso8601String() : _dueDateStr;

    final newTask = {
      'id': taskId,
      'task_name': name,
      'status': 'pending',
      'due_date': due,
      'dynamic_metadata': {
        'created_at': DateTime.now().toIso8601String(),
      },
      'is_synced': 0
    };

    await _dbHelper.insertTask(newTask);
    _taskNameController.clear();
    _dueDateStr = '';
    
    Navigator.of(context).pop();
    _loadTasks();

    SyncService.instance.triggerSync();
  }

  Future<void> _toggleTaskStatus(Map<String, dynamic> task) async {
    final curStatus = task['status'];
    final newStatus = curStatus == 'completed' ? 'pending' : 'completed';
    
    final updatedTask = {
      'id': task['id'],
      'task_name': task['task_name'],
      'status': newStatus,
      'due_date': task['due_date'],
      'dynamic_metadata': task['dynamic_metadata'] ?? {},
      'is_synced': 0
    };

    await _dbHelper.insertTask(updatedTask);
    _loadTasks();
    SyncService.instance.triggerSync();
  }

  void _showAddTaskDialog() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF0F172A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                bottom: MediaQuery.of(context).viewInsets.bottom,
                left: 20,
                right: 20,
                top: 24,
              ),
              child: SingleChildScrollView(
                child: Form(
                  key: _formKey,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'Tambah Tugas Baru',
                        style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: _taskNameController,
                        decoration: InputDecoration(
                          labelText: 'Nama Tugas',
                          labelStyle: const TextStyle(color: Colors.grey),
                          filled: true,
                          fillColor: const Color(0xFF0B0F19),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: const BorderSide(color: Color(0x33FFFFFF)),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: const BorderSide(color: Color(0xFF3B82F6)),
                          ),
                        ),
                        validator: (val) => val == null || val.isEmpty ? 'Nama tugas wajib diisi' : null,
                      ),
                      const SizedBox(height: 16),
                      TextButton.icon(
                        onPressed: () async {
                          final picked = await showDatePicker(
                            context: context,
                            initialDate: DateTime.now().add(const Duration(days: 1)),
                            firstDate: DateTime.now(),
                            lastDate: DateTime.now().add(const Duration(days: 365)),
                          );
                          if (picked != null) {
                            setModalState(() {
                              _dueDateStr = picked.toIso8601String();
                            });
                          }
                        },
                        icon: const Icon(Icons.calendar_month, color: Color(0xFF3B82F6)),
                        label: Text(
                          _dueDateStr.isEmpty ? 'Pilih Tenggat Waktu (Due Date)' : 'Due Date: ${_dueDateStr.split('T')[0]}',
                          style: const TextStyle(color: Color(0xFF3B82F6)),
                        ),
                      ),
                      const SizedBox(height: 24),
                      ElevatedButton(
                        onPressed: _saveTask,
                        style: ElevatedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          backgroundColor: const Color(0xFF3B82F6),
                        ),
                        child: const Text('SIMPAN TUGAS', style: TextStyle(fontWeight: FontWeight.bold)),
                      ),
                      const SizedBox(height: 24),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('To-Do List Kognitif', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
        backgroundColor: const Color(0xFF0F172A),
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.sync_rounded),
            onPressed: () async {
              await SyncService.instance.triggerSync();
              _loadTasks();
            },
          )
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _tasks.isEmpty
              ? const Center(child: Text('Belum ada tugas terdaftar.', style: TextStyle(color: Colors.grey)))
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _tasks.length,
                  itemBuilder: (context, index) {
                    final task = _tasks[index];
                    final isCompleted = task['status'] == 'completed';

                    return Card(
                      color: const Color(0xFF1E293B),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      margin: const EdgeInsets.only(bottom: 12),
                      child: ListTile(
                        leading: Checkbox(
                          value: isCompleted,
                          activeColor: const Color(0xFF10B981),
                          onChanged: (_) => _toggleTaskStatus(task),
                        ),
                        title: Text(
                          task['task_name'] ?? '',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            decoration: isCompleted ? TextDecoration.lineThrough : null,
                            color: isCompleted ? Colors.grey : Colors.white,
                          ),
                        ),
                        subtitle: Row(
                          children: [
                            const Icon(Icons.calendar_today, size: 12, color: Colors.grey),
                            const SizedBox(width: 4),
                            Text(task['due_date']?.split('T')[0] ?? '', style: const TextStyle(fontSize: 12)),
                            const SizedBox(width: 12),
                            if (task['is_synced'] == 0)
                              const Icon(Icons.cloud_queue_rounded, size: 14, color: Colors.grey)
                            else
                              const Icon(Icons.cloud_done_rounded, size: 14, color: Colors.green),
                          ],
                        ),
                        trailing: IconButton(
                          icon: const Icon(Icons.delete_outline, color: Color(0xFFEF4444)),
                          onPressed: () async {
                            await _dbHelper.deleteTask(task['id']);
                            _loadTasks();
                          },
                        ),
                      ),
                    );
                  },
                ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showAddTaskDialog,
        backgroundColor: const Color(0xFF3B82F6),
        child: const Icon(Icons.add, color: Colors.white),
      ),
    );
  }
}

// --- Tab 5: Settings / Ego Profile & Sentry tracking test (Layer 12) ---
class NativeSettingsScreen extends StatefulWidget {
  const NativeSettingsScreen({super.key});

  @override
  State<NativeSettingsScreen> createState() => _NativeSettingsScreenState();
}

class _NativeSettingsScreenState extends State<NativeSettingsScreen> {
  final _supabase = Supabase.instance.client;
  String _fullname = 'Memuat...';
  String _assistantName = 'Sobat AI';
  String _selectedPersonality = 'witty_sidekick';
  String _longTermMemory = 'Belum ada data memori kognitif. Gunakan aplikasi dan chat untuk melatih memori AI.';
  String _preferredLanguage = 'id';
  String? _avatarUrl;
  bool _isLoading = true;
  int _morningBriefingHour = 5;

  final List<Map<String, String>> _personalities = [
    {'id': 'witty_sidekick', 'name': 'The Witty Sidekick', 'desc': 'Sarkas, cerdas, setia, menghibur'},
    {'id': 'tough_love_coach', 'name': 'The Tough-Love Coach', 'desc': 'Disiplin, to-the-point, fokus target'},
    {'id': 'ultimate_hype_man', 'name': 'The Ultimate Hype-Man', 'desc': 'Optimis, energetik, suportif'},
    {'id': 'stoic_strategist', 'name': 'The Stoic Strategist', 'desc': 'Dingin, logis, tenang, kalkulatif'},
    {'id': 'elegant_confidant', 'name': 'The Elegant Confidant', 'desc': 'Alfred-vibe, sopan, humor halus'},
  ];

  String _getJoinedDate() {
    final user = _supabase.auth.currentUser;
    if (user == null) return '-';
    try {
      final createdAt = user.createdAt;
      if (createdAt.isEmpty) return '-';
      final dt = DateTime.parse(createdAt);
      final months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
      return '${dt.day} ${months[dt.month - 1]} ${dt.year}';
    } catch (_) {
      return '-';
    }
  }

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    final user = _supabase.auth.currentUser;
    if (user == null) return;

    try {
      var data = await _supabase
          .from('user_profiles')
          .select('fullname, user_nickname, assistant_name, selected_personality, dynamic_metadata')
          .eq('id', user.id)
          .maybeSingle();

      if (data == null) {
        try {
          await _supabase.from('user_profiles').upsert({
            'id': user.id,
            'fullname': user.email?.split('@')[0] ?? 'Pengguna',
            'selected_personality': 'witty_sidekick',
            'assistant_name': 'Sobat AI',
            'user_nickname': user.email?.split('@')[0] ?? 'Pengguna',
            'dynamic_metadata': {
              'future_plans': []
            }
          });
          data = await _supabase
              .from('user_profiles')
              .select('fullname, user_nickname, assistant_name, selected_personality, dynamic_metadata')
              .eq('id', user.id)
              .maybeSingle();
        } catch (e) {
          print("Auto profile creation failed in settings: $e");
        }
      }

      final profileData = data;
      if (profileData != null && mounted) {
        setState(() {
          _fullname = profileData['fullname'] ?? 'Sobat';
          _assistantName = profileData['assistant_name'] ?? 'Sobat AI';
          _selectedPersonality = profileData['selected_personality'] ?? 'witty_sidekick';
          
          final meta = profileData['dynamic_metadata'] as Map<String, dynamic>?;
          _longTermMemory = meta?['long_term_memory'] ?? 
              'Belum ada data memori kognitif. Gunakan aplikasi secara rutin untuk melatih memori AI.';
          _preferredLanguage = meta?['language'] ?? 'id';
          _avatarUrl = meta?['avatar_url'];
          _morningBriefingHour = meta?['morning_briefing_hour'] ?? 5;
          _isLoading = false;
        });
      }
    } catch (e) {
      print("Failed loading settings profile: $e");
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _updatePersonality(String id) async {
    final user = _supabase.auth.currentUser;
    if (user == null) return;

    setState(() {
      _selectedPersonality = id;
    });

    try {
      await _supabase.from('user_profiles').update({
        'selected_personality': id,
      }).eq('id', user.id);
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Ego kepribadian berhasil diubah menjadi: ${_personalities.firstWhere((p) => p['id'] == id)['name']}'),
          backgroundColor: const Color(0xFF10B981),
        ),
      );
    } catch (e) {
      print("Failed to update personality: $e");
      Sentry.captureException(e);
    }
  }

  Future<bool> _verifyAssistantNameLock() async {
    final controller = TextEditingController();
    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        title: const Text('Verifikasi Keamanan', style: TextStyle(color: Colors.white)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Sebutkan nama AI Anda untuk melanjutkan:', style: TextStyle(color: Colors.grey, fontSize: 13)),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: 'Nama AI...',
                hintStyle: const TextStyle(color: Colors.grey),
                filled: true,
                fillColor: const Color(0xFF0F172A),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal', style: TextStyle(color: Colors.grey))),
          TextButton(
            onPressed: () {
              if (controller.text.trim().toLowerCase() == _assistantName.toLowerCase()) {
                Navigator.pop(ctx, true);
              } else {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Nama AI salah!'), backgroundColor: Colors.red));
              }
            },
            child: const Text('Verifikasi', style: TextStyle(color: Color(0xFF3B82F6))),
          ),
        ],
      ),
    );
    return result == true;
  }

  Future<void> _uploadAvatar() async {
    try {
      final picker = ImagePicker();
      final pickedFile = await picker.pickImage(source: ImageSource.gallery, imageQuality: 70);
      if (pickedFile == null) return;
      
      final file = File(pickedFile.path);
      setState(() => _isLoading = true);
      
      final user = _supabase.auth.currentUser;
      final fileExt = pickedFile.path.split('.').last;
      final fileName = '${user!.id}_${DateTime.now().millisecondsSinceEpoch}.$fileExt';
      
      await _supabase.storage.from('avatars').upload(fileName, file);
      final publicUrl = _supabase.storage.from('avatars').getPublicUrl(fileName);
      
      final userProfile = await _supabase.from('user_profiles').select('dynamic_metadata').eq('id', user.id).single();
      final meta = userProfile['dynamic_metadata'] as Map<String, dynamic>? ?? {};
      meta['avatar_url'] = publicUrl;
      
      await _supabase.from('user_profiles').update({'dynamic_metadata': meta}).eq('id', user.id);
      
      setState(() {
        _avatarUrl = publicUrl;
        _isLoading = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Foto profil berhasil diubah')));
    } catch (e) {
      setState(() => _isLoading = false);
      Sentry.captureException(e);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Gagal upload: $e')));
    }
  }

  Future<void> _updateSettingsField(String field, String value) async {
    final user = _supabase.auth.currentUser;
    if (user == null) return;
    try {
      if (field == 'language') {
        final userProfile = await _supabase.from('user_profiles').select('dynamic_metadata').eq('id', user.id).single();
        final meta = userProfile['dynamic_metadata'] as Map<String, dynamic>? ?? {};
        meta['language'] = value;
        await _supabase.from('user_profiles').update({'dynamic_metadata': meta}).eq('id', user.id);
        setState(() { _preferredLanguage = value; });
      } else if (field == 'long_term_memory') {
        final userProfile = await _supabase.from('user_profiles').select('dynamic_metadata').eq('id', user.id).single();
        final meta = userProfile['dynamic_metadata'] as Map<String, dynamic>? ?? {};
        meta['long_term_memory'] = value;
        await _supabase.from('user_profiles').update({'dynamic_metadata': meta}).eq('id', user.id);
        setState(() { _longTermMemory = value; });
      } else {
        if (field == 'fullname') {
          final nickname = value.trim().split(' ')[0];
          await _supabase.from('user_profiles').update({
            'fullname': value,
            'user_nickname': nickname,
          }).eq('id', user.id);
          setState(() {
            _fullname = value;
          });
        } else {
          await _supabase.from('user_profiles').update({field: value}).eq('id', user.id);
          if (field == 'assistant_name') setState(() { _assistantName = value; });
        }
      }
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Pengaturan disimpan'), backgroundColor: Color(0xFF10B981)));
    } catch (e) {
      Sentry.captureException(e);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Gagal: $e'), backgroundColor: Colors.red));
    }
  }

  void _showEditFieldDialog(String title, String field, String currentValue) {
    final controller = TextEditingController(text: currentValue);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        title: Text('Ubah $title', style: const TextStyle(color: Colors.white)),
        content: TextField(
          controller: controller,
          maxLines: field == 'long_term_memory' ? 5 : 1,
          style: const TextStyle(color: Colors.white),
          decoration: InputDecoration(
            filled: true,
            fillColor: const Color(0xFF0F172A),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Batal', style: TextStyle(color: Colors.grey))),
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              _updateSettingsField(field, controller.text.trim());
            },
            child: const Text('Simpan', style: TextStyle(color: Color(0xFF3B82F6))),
          ),
        ],
      ),
    );
  }

  Future<void> _logout() async {
    await _supabase.auth.signOut();
    await LocalDatabaseHelper.instance.clearAllCache();
  }

  // Layer 12 verification: Trigger deliberate crash to check Sentry captures
  void _triggerSentryCrash() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Crash dilaporkan ke Sentry...'),
        backgroundColor: Color(0xFF8B5CF6),
      ),
    );
    throw Exception('Test Sentry Error: Sengaja dipicu dari halaman Pengaturan Sobat AI');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Profil Asisten', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
        backgroundColor: const Color(0xFF0F172A),
        elevation: 0,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Redesigned User Profile Card (Premium Gradient & Glassmorphism)
                  Container(
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          const Color(0xFF1E293B).withOpacity(0.85),
                          const Color(0xFF0F172A).withOpacity(0.95),
                        ],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: const Color(0x22FFFFFF), width: 1.5),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.3),
                          blurRadius: 15,
                          offset: const Offset(0, 8),
                        )
                      ],
                    ),
                    child: Column(
                      children: [
                        Stack(
                          alignment: Alignment.bottomRight,
                          children: [
                            GestureDetector(
                              onTap: _uploadAvatar,
                              child: CircleAvatar(
                                radius: 48,
                                backgroundColor: const Color(0xFF3B82F6).withOpacity(0.15),
                                backgroundImage: _avatarUrl != null ? NetworkImage(_avatarUrl!) : null,
                                child: _avatarUrl == null
                                    ? const Icon(Icons.person, size: 48, color: Color(0xFF3B82F6))
                                    : null,
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.all(6),
                              decoration: const BoxDecoration(
                                color: Color(0xFF3B82F6),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(Icons.camera_alt, size: 14, color: Colors.white),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        // Main Name Row with Edit Button
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Flexible(
                              child: Text(
                                _fullname,
                                style: const TextStyle(
                                  fontSize: 22,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.white,
                                  letterSpacing: 0.5,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            const SizedBox(width: 8),
                            GestureDetector(
                              onTap: () => _showEditFieldDialog('Nama Lengkap', 'fullname', _fullname),
                              child: Container(
                                padding: const EdgeInsets.all(6),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF3B82F6).withOpacity(0.15),
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(Icons.edit, size: 14, color: Color(0xFF3B82F6)),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        const Divider(color: Color(0x11FFFFFF), thickness: 1),
                        const SizedBox(height: 8),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.calendar_today_rounded, size: 14, color: Colors.grey),
                            const SizedBox(width: 6),
                            Text(
                              'Bergabung Sejak: ${_getJoinedDate()}',
                              style: const TextStyle(color: Colors.grey, fontSize: 13),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Redesigned Assistant AI Card
                  Container(
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          const Color(0xFF1E293B).withOpacity(0.85),
                          const Color(0xFF0F172A).withOpacity(0.95),
                        ],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: const Color(0x22FFFFFF), width: 1.5),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.3),
                          blurRadius: 15,
                          offset: const Offset(0, 8),
                        )
                      ],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.psychology_rounded, color: Color(0xFF8B5CF6), size: 24),
                            const SizedBox(width: 10),
                            const Text(
                              'Konfigurasi Asisten AI',
                              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        // Assistant Name Field
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text(
                              'Nama Asisten:',
                              style: TextStyle(color: Colors.grey, fontSize: 14),
                            ),
                            Row(
                              children: [
                                Text(
                                  _assistantName,
                                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
                                ),
                                const SizedBox(width: 6),
                                GestureDetector(
                                  onTap: () => _showEditFieldDialog('Nama Asisten', 'assistant_name', _assistantName),
                                  child: Container(
                                    padding: const EdgeInsets.all(6),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFF8B5CF6).withOpacity(0.15),
                                      shape: BoxShape.circle,
                                    ),
                                    child: const Icon(Icons.edit, size: 14, color: Color(0xFF8B5CF6)),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        // Language Selection
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text(
                              'Bahasa Interaksi:',
                              style: TextStyle(color: Colors.grey, fontSize: 14),
                            ),
                            DropdownButton<String>(
                              value: _preferredLanguage,
                              dropdownColor: const Color(0xFF1E293B),
                              style: const TextStyle(color: Color(0xFF8B5CF6), fontSize: 14, fontWeight: FontWeight.bold),
                              underline: const SizedBox(),
                              items: const [
                                DropdownMenuItem(value: 'id', child: Text('Bahasa Indonesia')),
                                DropdownMenuItem(value: 'en', child: Text('English')),
                              ],
                              onChanged: (val) {
                                if (val != null) _updateSettingsField('language', val);
                              },
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Morning Briefing Hour Setting
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xFF1E293B),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0x11FFFFFF)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(8),
                              decoration: BoxDecoration(
                                color: const Color(0xFFFBBF24).withOpacity(0.2),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: const Icon(Icons.wb_sunny_rounded, color: Color(0xFFFBBF24), size: 20),
                            ),
                            const SizedBox(width: 12),
                            const Expanded(
                              child: Text('Morning Briefing', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: Colors.white)),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'AI akan memberikan briefing harian saat kamu membuka aplikasi setelah jam yang diset.',
                          style: TextStyle(color: Colors.grey, fontSize: 12),
                        ),
                        const SizedBox(height: 12),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text('Jam Briefing:', style: TextStyle(color: Colors.grey, fontSize: 14)),
                            DropdownButton<int>(
                              value: _morningBriefingHour,
                              dropdownColor: const Color(0xFF1E293B),
                              style: const TextStyle(color: Color(0xFFFBBF24), fontSize: 14, fontWeight: FontWeight.bold),
                              underline: const SizedBox(),
                              items: List.generate(24, (i) => DropdownMenuItem(
                                value: i,
                                child: Text('${i.toString().padLeft(2, '0')}:00 ${i < 12 ? 'AM' : 'PM'}'),
                              )),
                              onChanged: (val) async {
                                if (val == null) return;
                                setState(() { _morningBriefingHour = val; });
                                try {
                                  final session = _supabase.auth.currentSession;
                                  if (session == null) return;
                                  await http.post(
                                    Uri.parse('${AppConfig.activeUrl}/api/v1/briefing'),
                                    headers: {
                                      'Content-Type': 'application/json',
                                      'x-jarvis-gateway-key': AppConfig.gatewayKey,
                                      'Authorization': 'Bearer ${session.accessToken}',
                                    },
                                    body: jsonEncode({'morning_briefing_hour': val}),
                                  );
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content: Text('Jam briefing diubah ke ${val.toString().padLeft(2, '0')}:00'),
                                      backgroundColor: const Color(0xFF10B981),
                                    ),
                                  );
                                } catch (e) {
                                  print('Failed to update briefing hour: $e');
                                }
                              },
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  
                  // Cognitive AI Memory Block
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Memori Jangka Panjang AI', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                      IconButton(
                        icon: const Icon(Icons.edit, size: 18, color: Color(0xFF3B82F6)),
                        onPressed: () async {
                          final locked = await _verifyAssistantNameLock();
                          if (locked) {
                            _showEditFieldDialog('Memori Jangka Panjang', 'long_term_memory', _longTermMemory);
                          }
                        },
                      ),
                    ],
                  ),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xFF1E293B),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0x11FFFFFF)),
                    ),
                    child: Text(
                      _longTermMemory,
                      style: const TextStyle(color: Colors.grey, fontSize: 13, height: 1.4),
                    ),
                  ),
                  const SizedBox(height: 24),

                  // Ego Selector
                  const Text('Pilih Ego / Kepribadian Asisten', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                  const SizedBox(height: 12),
                  ListView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: _personalities.length,
                    itemBuilder: (context, index) {
                      final item = _personalities[index];
                      final isSelected = item['id'] == _selectedPersonality;

                      return Card(
                        color: isSelected ? const Color(0xFF3B82F6).withOpacity(0.15) : const Color(0xFF1E293B),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                          side: BorderSide(
                            color: isSelected ? const Color(0xFF3B82F6) : Colors.transparent,
                            width: 1,
                          ),
                        ),
                        margin: const EdgeInsets.only(bottom: 10),
                        child: ListTile(
                          title: Text(item['name'] ?? '', style: const TextStyle(fontWeight: FontWeight.bold)),
                          subtitle: Text(item['desc'] ?? '', style: const TextStyle(color: Colors.grey, fontSize: 12)),
                          trailing: isSelected ? const Icon(Icons.check_circle, color: Color(0xFF3B82F6)) : null,
                          onTap: () async {
                            final locked = await _verifyAssistantNameLock();
                            if (locked) {
                              _updatePersonality(item['id'] as String);
                            }
                          },
                        ),
                      );
                    },
                  ),
                  const SizedBox(height: 24),

                  // Sentry test crash button
                  ElevatedButton.icon(
                    onPressed: _triggerSentryCrash,
                    icon: const Icon(Icons.bug_report, color: Colors.white),
                    label: const Text('TEST CRASH SENTRY (TRACKING)', style: TextStyle(color: Colors.white)),
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      backgroundColor: const Color(0xFF8B5CF6),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Sentry Test Button
                  OutlinedButton.icon(
                    onPressed: () async {
                      try {
                        throw Exception('Test Sentry Error: Sengaja dipicu dari halaman Pengaturan Sobat AI');
                      } catch (e, stackTrace) {
                        await Sentry.captureException(e, stackTrace: stackTrace);
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('✅ Error uji coba berhasil dikirim ke Sentry!'),
                            backgroundColor: Color(0xFF10B981),
                          ),
                        );
                      }
                    },
                    icon: const Icon(Icons.bug_report, color: Color(0xFFF59E0B)),
                    label: const Text('TEST SENTRY CRASH', style: TextStyle(color: Color(0xFFF59E0B))),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      side: const BorderSide(color: Color(0xFFF59E0B)),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Logout button
                  OutlinedButton.icon(
                    onPressed: _logout,
                    icon: const Icon(Icons.logout, color: Color(0xFFEF4444)),
                    label: const Text('LOGOUT / KELUAR', style: TextStyle(color: Color(0xFFEF4444))),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      side: const BorderSide(color: Color(0xFFEF4444)),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                  const SizedBox(height: 24),
                  const Center(
                    child: Text(
                      'v1.0.0',
                      style: TextStyle(
                        color: Colors.white38,
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                        letterSpacing: 0.5,
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                ],
              ),
            ),
    );
  }
}
