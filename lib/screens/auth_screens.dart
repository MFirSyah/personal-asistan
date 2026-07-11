// ====================================================================
// AUTH SCREENS - Login, Register, Profile Setup
// ====================================================================

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../config.dart';
import '../widgets/glass_container.dart';
import '../widgets/mesh_gradient_bg.dart';

class AuthScreens extends StatelessWidget {
  final bool initialShowProfileSetup;
  final String? initialUserId;

  const AuthScreens({
    super.key,
    this.initialShowProfileSetup = false,
    this.initialUserId,
  });

  @override
  Widget build(BuildContext context) {
    return LoginRegisterScreen(
      initialShowProfileSetup: initialShowProfileSetup,
      initialUserId: initialUserId,
    );
  }
}

// --- Login/Registration Screen ---
class LoginRegisterScreen extends StatefulWidget {
  final bool initialShowProfileSetup;
  final String? initialUserId;

  const LoginRegisterScreen({
    super.key,
    this.initialShowProfileSetup = false,
    this.initialUserId,
  });

  @override
  State<LoginRegisterScreen> createState() => _LoginRegisterScreenState();
}

class _LoginRegisterScreenState extends State<LoginRegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isRegister = false;
  bool _isLoading = false;
  bool _obscurePassword = true;
  String _errorMsg = '';

  final List<Map<String, dynamic>> _egoOptions = [
    {'id': 'witty_sidekick', 'name': 'The Witty Sidekick', 'desc': 'Ramah & Humoris', 'icon': Icons.chat_bubble},
    {'id': 'tough_love_coach', 'name': 'The Tough-Love Coach', 'desc': 'Tegas & Disiplin', 'icon': Icons.fitness_center},
    {'id': 'ultimate_hype_man', 'name': 'The Ultimate Hype-Man', 'desc': 'Energetik & Optimis', 'icon': Icons.celebration},
    {'id': 'stoic_strategist', 'name': 'The Stoic Strategist', 'desc': 'Dingin & Logis', 'icon': Icons.psychology},
    {'id': 'elegant_confidant', 'name': 'The Elegant Confidant', 'desc': 'Sopan & Berkelas', 'icon': Icons.spa},
  ];

  late bool _showProfileSetup;
  String? _pendingUserId;
  final _usernameController = TextEditingController();
  final _assistantNameController = TextEditingController();
  String _selectedEgo = 'witty_sidekick';

  @override
  void initState() {
    super.initState();
    _showProfileSetup = widget.initialShowProfileSetup;
    _pendingUserId = widget.initialUserId;
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _usernameController.dispose();
    _assistantNameController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _errorMsg = '';
    });

    try {
      final supabase = Supabase.instance.client;

      if (_isRegister) {
        final res = await supabase.auth.signUp(
          email: _emailController.text.trim(),
          password: _passwordController.text,
        );

        if (res.user != null) {
          _pendingUserId = res.user!.id;
          if (res.session != null) {
            setState(() => _showProfileSetup = true);
          }
        }
      } else {
        await supabase.auth.signInWithPassword(
          email: _emailController.text.trim(),
          password: _passwordController.text,
        );
      }
    } on AuthException catch (e) {
      setState(() => _errorMsg = _getFriendlyError(e.message));
    } catch (e) {
      setState(() => _errorMsg = _getFriendlyError(e.toString()));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _submitProfileSetup() async {
    if (_pendingUserId == null) {
      setState(() {
        _errorMsg = 'Sesi habis. Silakan daftar ulang.';
        _showProfileSetup = false;
      });
      return;
    }

    setState(() => _isLoading = true);

    try {
      final supabase = Supabase.instance.client;

      await supabase.auth.updateUser(UserAttributes(
        data: {'user_nickname': _usernameController.text.trim().split(' ')[0]},
      ));

      final selectedEgoData = _egoOptions.firstWhere((e) => e['id'] == _selectedEgo);

      await supabase.from('user_profiles').upsert({
        'id': _pendingUserId,
        'fullname': _usernameController.text.trim(),
        'user_nickname': _usernameController.text.trim().split(' ')[0],
        'selected_personality': _selectedEgo,
        'assistant_name': _assistantNameController.text.trim().isNotEmpty
            ? _assistantNameController.text.trim()
            : selectedEgoData['name'],
      });

      _pendingUserId = null;
      _usernameController.clear();
      _assistantNameController.clear();
      _showProfileSetup = false;
      _isRegister = false;
    } catch (e) {
      setState(() => _errorMsg = _getFriendlyError(e.toString()));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  String _getFriendlyError(String msg) {
    final lower = msg.toLowerCase();
    if (lower.contains('invalid login')) return '🔐 Email atau password salah.';
    if (lower.contains('already registered')) return '📝 Email ini sudah terdaftar.';
    if (lower.contains('email not confirmed')) return '📧 Cek email untuk verifikasi.';
    if (lower.contains('weak password')) return '🔒 Password minimal 6 karakter.';
    if (lower.contains('network')) return '🌐 Periksa koneksi internet.';
    return '⚠️ Terjadi kesalahan: $msg';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: MeshGradientBg(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 300),
              child: _showProfileSetup
                  ? _buildProfileSetupForm()
                  : _buildLoginRegisterForm(),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLoginRegisterForm() {
    return GlassContainer(
      key: const ValueKey('auth_form'),
      padding: const EdgeInsets.all(28),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Logo
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
                        color: const Color(0xFF3B82F6).withValues(alpha: 0.3),
                        blurRadius: 10,
                      )
                    ],
                  ),
                  child: const Icon(Icons.rocket_launch, size: 28, color: Colors.white),
                ),
                const SizedBox(width: 12),
                const Text(
                  'Personal Asistan',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 32),

            // Email
            TextFormField(
              controller: _emailController,
              keyboardType: TextInputType.emailAddress,
              decoration: _inputDecoration('Email', Icons.email),
              validator: (v) => v?.isEmpty == true ? 'Wajib diisi' : null,
            ),
            const SizedBox(height: 16),

            // Password
            TextFormField(
              controller: _passwordController,
              obscureText: _obscurePassword,
              decoration: InputDecoration(
                labelText: 'Password',
                prefixIcon: const Icon(Icons.lock),
                suffixIcon: IconButton(
                  icon: Icon(_obscurePassword ? Icons.visibility_off : Icons.visibility),
                  onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                ),
                filled: true,
                fillColor: const Color(0xFFFFFFFF).withValues(alpha: 0.05),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: const BorderSide(color: Color(0x1AFFFFFF)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: const BorderSide(color: Color(0x1AFFFFFF)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: const BorderSide(color: Color(0xFF3B82F6)),
                ),
              ),
              validator: (v) => (v?.length ?? 0) < 6 ? 'Minimal 6 karakter' : null,
            ),

            if (_errorMsg.isNotEmpty) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(_errorMsg, style: const TextStyle(color: Colors.red)),
              ),
            ],

            const SizedBox(height: 24),

            // Submit Button
            FilledButton(
              onPressed: _isLoading ? null : _submit,
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: _isLoading
                  ? const SizedBox(
                      width: 20, height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(_isRegister ? 'Daftar' : 'Masuk'),
            ),

            const SizedBox(height: 16),

            // Toggle
            TextButton(
              onPressed: () => setState(() {
                _isRegister = !_isRegister;
                _errorMsg = '';
              }),
              child: Text(
                _isRegister
                    ? 'Sudah punya akun? Masuk'
                    : 'Belum punya akun? Daftar',
                style: const TextStyle(color: Color(0xFF3B82F6)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildProfileSetupForm() {
    return GlassContainer(
      key: const ValueKey('profile_form'),
      padding: const EdgeInsets.all(28),
      child: Form(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Selamat Datang! 👋',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            const Text(
              'Lengkapi profil Anda untuk memulai',
              style: TextStyle(color: Colors.grey),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),

            // Nama
            TextFormField(
              controller: _usernameController,
              decoration: _inputDecoration('Nama Lengkap', Icons.person),
              validator: (v) => v?.isEmpty == true ? 'Wajib diisi' : null,
            ),
            const SizedBox(height: 16),

            // Nama AI
            TextFormField(
              controller: _assistantNameController,
              decoration: _inputDecoration('Nama AI (opsional)', Icons.smart_toy),
            ),
            const SizedBox(height: 24),

            // Personality Selection
            const Text(
              'Pilih Karakter AI',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 12),

            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _egoOptions.map((ego) {
                final isSelected = _selectedEgo == ego['id'];
                return ChoiceChip(
                  label: Text(ego['name']),
                  selected: isSelected,
                  onSelected: (s) {
                    if (s) setState(() => _selectedEgo = ego['id']);
                  },
                  avatar: Icon(ego['icon'], size: 18),
                  selectedColor: const Color(0xFF3B82F6),
                );
              }).toList(),
            ),

            const SizedBox(height: 24),

            if (_errorMsg.isNotEmpty) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(_errorMsg, style: const TextStyle(color: Colors.red)),
              ),
              const SizedBox(height: 16),
            ],

            FilledButton(
              onPressed: _isLoading ? null : _submitProfileSetup,
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: _isLoading
                  ? const SizedBox(
                      width: 20, height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Lanjutkan'),
            ),
          ],
        ),
      ),
    );
  }

  InputDecoration _inputDecoration(String label, IconData icon) {
    return InputDecoration(
      labelText: label,
      prefixIcon: Icon(icon),
      filled: true,
      fillColor: const Color(0xFFFFFFFF).withValues(alpha: 0.05),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: Color(0x1AFFFFFF)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: Color(0x1AFFFFFF)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: Color(0xFF3B82F6)),
      ),
    );
  }
}
