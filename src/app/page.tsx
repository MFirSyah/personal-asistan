'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { createClient } from '@supabase/supabase-js';
import './home.css';

// Initialize Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let supabaseClientInstance: any = null;
const getSupabaseClient = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }
  if (!supabaseClientInstance) {
    supabaseClientInstance = createClient(supabaseUrl, supabaseAnonKey);
  }
  return supabaseClientInstance;
};

export default function Home() {
  // Steps: 
  // 1 = Onboarding Intro Splash
  // 2 = Auth Switcher (Login/Register/Demo)
  // 3 = Login Form
  // 4 = Register Form
  // 5 = OTP Verification
  // 6 = Profile Setup (fullname, nickname, assistantName)
  // 7 = Pilih Ego AI (Personality Selector)
  const [step, setStep] = useState(1);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [supabaseClient, setSupabaseClient] = useState<any>(null);

  // Auth Inputs
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Password Visibility States
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Resend Verification Email Cooldown
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMessage, setResendMessage] = useState('');

  // Step 6 Inputs: Identitas
  const [fullname, setFullname] = useState('');
  const [nickname, setNickname] = useState('');
  const [assistantName, setAssistantName] = useState('');

  // Step 7 Inputs: Kepribadian AI
  const [selectedPersonality, setSelectedPersonality] = useState('witty_sidekick');

  // OTP Inputs
  const [otpInputs, setOtpInputs] = useState<string[]>(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const otpRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null)
  ];

  // Initialize Supabase Client in client side safely
  // Initialize Supabase Client in client side safely
  useEffect(() => {
    const client = getSupabaseClient();
    setSupabaseClient(client);
    
    if (client) {
      // 1. Check existing session
      client.auth.getSession().then(async (res: any) => {
        const session = res?.data?.session;
        const error = res?.error;
        if (error) {
          console.error('Session check error:', error);
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('is_demo_mode');
          client.auth.signOut().catch(() => {});
          return;
        }

        if (session) {
          localStorage.removeItem('is_demo_mode');
          localStorage.setItem('access_token', session.access_token);
          localStorage.setItem('refresh_token', session.refresh_token);
          
          try {
            const { data: uProfile, error: profileErr } = await client.from('user_profiles')
              .select('fullname, user_nickname, assistant_name, selected_personality')
              .eq('id', session.user.id)
              .maybeSingle();

            if (profileErr) throw profileErr;

            if (uProfile) {
              localStorage.setItem('sim_user_profile', JSON.stringify(uProfile));
              window.location.href = '/dashboard';
            } else {
              setStep(6); // Setup Profile
            }
          } catch (err: any) {
            console.error('Profile fetch error on mount:', err);
            window.location.href = '/dashboard';
          }
        }
      }).catch((err: any) => {
        console.error('Auto-login session restoration failed:', err);
      });

      // 2. Listen to active auth state changes (e.g. from magic links, redirect_to callbacks)
      const { data: { subscription } } = client.auth.onAuthStateChange(async (event: string, session: any) => {
        if (session) {
          localStorage.removeItem('is_demo_mode');
          localStorage.setItem('access_token', session.access_token);
          localStorage.setItem('refresh_token', session.refresh_token);
          
          try {
            const { data: uProfile, error: profileErr } = await client.from('user_profiles')
              .select('fullname, user_nickname, assistant_name, selected_personality')
              .eq('id', session.user.id)
              .maybeSingle();

            if (profileErr) throw profileErr;

            if (uProfile) {
              localStorage.setItem('sim_user_profile', JSON.stringify(uProfile));
              window.location.href = '/dashboard';
            } else {
              setStep(6);
            }
          } catch (err: any) {
            console.error('Failed to query profile on auth state change:', err);
            // Default fallback: assume profile exists (or let dashboard handle it) and redirect
            window.location.href = '/dashboard';
          }
        } else if (event === 'SIGNED_OUT' || !session) {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('sim_user_profile');
          localStorage.removeItem('is_demo_mode');
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }
  }, []);

  // AI Personalities Metadata
  const personalities = [
    {
      id: 'witty_sidekick',
      name: 'The Witty Sidekick',
      vibe: 'Cerdas, humoris, sedikit sarkas namun aman & setia.',
      instruction: 'Jarvis versi santai yang siap menghibur hari Anda.'
    },
    {
      id: 'tough_love_coach',
      name: 'The Tough-Love Coach',
      vibe: 'Disiplin, alarm produktivitas, to-the-point tanpa basa-basi.',
      instruction: 'Mentor tegas untuk menghentikan kebiasaan menunda.'
    },
    {
      id: 'ultimate_hype_man',
      name: 'The Ultimate Hype-Man',
      vibe: 'Energetik, cheerleader optimis, super suportif.',
      instruction: 'Teman setia yang selalu merayakan setiap progres kecil Anda.'
    },
    {
      id: 'stoic_strategist',
      name: 'The Stoic Strategist',
      vibe: 'Tenang, dingin di bawah tekanan, logis & berorientasi rencana aksi.',
      instruction: 'Ahli strategi tenang untuk keputusan yang matang.'
    },
    {
      id: 'elegant_confidant',
      name: 'The Elegant Confidant',
      vibe: 'Sopan, berkelas, pendengar yang penuh hormat.',
      instruction: 'Vibe asisten setia ala Alfred di komik Batman.'
    }
  ];

  // REAL SUPABASE LOGIN FLOW
  const handleRealLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setAuthError('Email dan Kata Sandi wajib diisi!');
      return;
    }

    setIsLoading(true);
    setAuthError('');

    try {
      if (!supabaseClient) {
        throw new Error('Supabase client tidak terdeteksi. Silakan coba kembali atau gunakan Mode Demo.');
      }

      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email.trim(),
        password: password
      });

      if (error) throw error;
      
      if (!data.session) {
        throw new Error('Email belum dikonfirmasi atau sesi gagal dibuat.');
      }
      
      // Explicitly trigger the next step if onAuthStateChange is slow
      // It will redirect or go to step 6 based on profile
      const { data: uProfile } = await supabaseClient.from('user_profiles')
        .select('fullname')
        .eq('id', data.session.user.id)
        .maybeSingle();
        
      if (uProfile) {
        window.location.href = '/dashboard';
      } else {
        setStep(6);
        setIsLoading(false);
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setAuthError(err.message || 'Gagal masuk. Periksa kembali email dan sandi Anda.');
      setIsLoading(false);
    }
  };

  // Resend Email Cooldown Effect
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => {
      setResendCooldown(prev => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Kirim Ulang Email Verifikasi
  const handleResendEmail = async () => {
    if (resendCooldown > 0) return;
    setIsLoading(true);
    setResendMessage('');
    try {
      if (!supabaseClient) throw new Error('Supabase client tidak terdeteksi.');
      const { error } = await supabaseClient.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: {
          emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined
        }
      });
      if (error) throw error;
      setResendMessage('Tautan konfirmasi baru berhasil dikirim!');
      setResendCooldown(60); // 60 seconds cooldown
    } catch (err: any) {
      console.error('Failed to resend confirmation email:', err);
      setResendMessage(`Gagal mengirim ulang: ${err.message || 'Silakan coba lagi.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // REAL SUPABASE SIGNUP FLOW
  const handleRealRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim() || !confirmPassword.trim()) {
      setAuthError('Semua kolom formulir wajib diisi!');
      return;
    }
    if (password.length < 6) {
      setAuthError('Kata Sandi minimal 6 karakter!');
      return;
    }
    if (password !== confirmPassword) {
      setAuthError('Kata Sandi dan Konfirmasi Kata Sandi tidak cocok!');
      return;
    }

    setIsLoading(true);
    setAuthError('');

    try {
      if (!supabaseClient) {
        throw new Error('Supabase client tidak terdeteksi. Gunakan Mode Demo jika berjalan offline.');
      }

      const { data, error } = await supabaseClient.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined
        }
      });

      if (error) throw error;

      if (data.session) {
        // Automatically authenticated (email confirmation is disabled)
        localStorage.setItem('access_token', data.session.access_token);
        localStorage.setItem('refresh_token', data.session.refresh_token);
        setStep(6); // Setup Profile
      } else {
        // Verification email required
        setResendMessage('');
        setResendCooldown(30); // 30s initial resend cooldown
        setStep(5); // Link confirmation waiting screen
      }
    } catch (err: any) {
      console.error('Registration error:', err);
      setAuthError(err.message || 'Pendaftaran gagal. Silakan coba kembali.');
    } finally {
      setIsLoading(false);
    }
  };

  // OTP Input Auto-focus next logic
  const handleOtpChange = (index: number, val: string) => {
    if (isNaN(Number(val))) return;
    const newOtp = [...otpInputs];
    newOtp[index] = val.slice(-1);
    setOtpInputs(newOtp);

    if (val !== '' && index < 5) {
      otpRefs[index + 1].current?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && otpInputs[index] === '' && index > 0) {
      otpRefs[index - 1].current?.focus();
    }
  };

  // REAL SUPABASE OTP VERIFICATION
  const handleRealVerifyOtp = async () => {
    const enteredOtp = otpInputs.join('');
    if (enteredOtp.length < 6) {
      setOtpError('Harap isi lengkap 6 digit kode OTP');
      return;
    }

    setIsLoading(true);
    setOtpError('');

    try {
      if (!supabaseClient) throw new Error('Supabase client is not loaded');

      const { data, error } = await supabaseClient.auth.verifyOtp({
        email: email.trim(),
        token: enteredOtp,
        type: 'signup'
      });

      if (error) throw error;

      if (data.session) {
        localStorage.setItem('access_token', data.session.access_token);
        localStorage.setItem('refresh_token', data.session.refresh_token);
      }

      setStep(6); // Go to Profile Setup
    } catch (err: any) {
      console.error('OTP verification error:', err);
      setOtpError(err.message || 'Kode OTP salah. Silakan periksa kotak masuk email Anda.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 6 handler: Go to Ego Selector
  const handleNextProfileSetup = () => {
    if (!fullname.trim() || !nickname.trim() || !assistantName.trim()) {
      alert('Semua kolom profil wajib diisi!');
      return;
    }
    setStep(7);
  };

  // FINAL STEP: SAVE PROFILE AND LAUNCH
  const handleFinalizeProfile = async () => {
    setIsLoading(true);
    try {
      const userProfile = {
        fullname: fullname.trim(),
        user_nickname: nickname.trim(),
        assistant_name: assistantName.trim(),
        selected_personality: selectedPersonality
      };

      // Always save to localStorage for fallback compatibility
      localStorage.setItem('sim_user_profile', JSON.stringify(userProfile));

      if (isDemoMode || !supabaseClient) {
        // Demo Mode / Simulation Bypass
        localStorage.setItem('is_demo_mode', 'true');
        setTimeout(() => {
          setIsLoading(false);
          window.location.href = '/dashboard';
        }, 1200);
        return;
      } else {
        localStorage.removeItem('is_demo_mode');
      }

      // Live mode - Save to Remote database
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) {
        throw new Error('Sesi pengguna tidak ditemukan. Silakan masuk kembali.');
      }

      const { error } = await supabaseClient
        .from('user_profiles')
        .upsert({
          id: user.id,
          fullname: fullname.trim(),
          user_nickname: nickname.trim(),
          assistant_name: assistantName.trim(),
          selected_personality: selectedPersonality,
          dynamic_metadata: {
            future_plans: []
          }
        });

      if (error) throw error;

      // Sync latest tokens just in case
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (session) {
        localStorage.setItem('access_token', session.access_token);
        localStorage.setItem('refresh_token', session.refresh_token);
      }

      window.location.href = '/dashboard';
    } catch (err: any) {
      console.error('Failed to save profile:', err);
      alert(err.message || 'Gagal menyimpan profil ke database.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="onboarding-container">
      <div className="wizard-card">
        
        {/* Wizard Header */}
        <div className="wizard-header">
          <Image
            src="/next.svg"
            alt="Sobat AI Logo"
            width={95}
            height={22}
            style={{ marginBottom: '16px', opacity: 0.9 }}
            priority
          />
          <h2>SOBAT AI — ASISTEN PRIBADI</h2>
          <p>
            {step === 1 && 'Selamat datang di Sobat AI — Asisten Waktu & Kognitif Anda'}
            {step === 2 && 'Pilih cara untuk terhubung ke Dasbor Pribadi Anda'}
            {step === 3 && 'Masuk dengan Akun Sesi Aktif'}
            {step === 4 && 'Daftar Akun Baru (Database Aman & Terenkripsi)'}
            {step === 5 && 'Verifikasi Kode OTP Email Anda'}
            {step === 6 && 'Langkah Setup: Lengkapi profil nama Anda'}
            {step === 7 && 'Langkah Akhir: Tentukan Ego Kepribadian Asisten AI'}
          </p>
        </div>

        {/* Step dots indicator (Only show for Profile Setup onward or show all) */}
        <div className="step-indicator">
          {[1, 2, 3, 4, 5].map((i) => {
            let active = false;
            if (step <= 2 && i === 1) active = true;
            else if ((step === 3 || step === 4) && i === 2) active = true;
            else if (step === 5 && i === 3) active = true;
            else if (step === 6 && i === 4) active = true;
            else if (step === 7 && i === 5) active = true;
            return <div key={i} className={`indicator-dot ${active ? 'active' : ''}`}></div>;
          })}
        </div>

        {/* STEP 1: ONBOARDING INTRO (SPLASH) */}
        {step === 1 && (
          <div className="form-input-container" style={{ textAlign: 'center', gap: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', margin: '10px 0', textAlign: 'left' }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <strong style={{ color: '#3b82f6', fontSize: '0.95rem' }}>⏱️ Analisis Pola Waktu & Kronotipe</strong>
                <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginTop: '4px', lineHeight: '1.4' }}>
                  Memetakan jam kerja produktif biologis Anda (Morning Lion vs Night Owl) untuk menjadwalkan tugas penting pada waktu fokus puncak Anda.
                </p>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <strong style={{ color: '#a78bfa', fontSize: '0.95rem' }}>💳 Audit Kebocoran Malam (Leak Auditor)</strong>
                <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginTop: '4px', lineHeight: '1.4' }}>
                  Deteksi dini pengeluaran impulsif malam hari akibat stres kognitif dan dapatkan rekomendasi mitigasi anggaran instan.
                </p>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <strong style={{ color: '#10b981', fontSize: '0.95rem' }}>🔒 Row Level Security & Enkripsi</strong>
                <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginTop: '4px', lineHeight: '1.4' }}>
                  Semua data riwayat, catatan keuangan, dan chat log diisolasi secara ketat per user menggunakan kebijakan RLS Supabase.
                </p>
              </div>
            </div>

            <button type="button" className="btn-wizard" style={{ width: '100%' }} onClick={() => setStep(2)}>
              Mulai Sekarang &rarr;
            </button>
          </div>
        )}

        {/* STEP 2: AUTH SWITCHER */}
        {step === 2 && (
          <div className="form-input-container" style={{ gap: '16px' }}>
            <button type="button" className="btn-wizard" style={{ width: '100%', padding: '16px' }} onClick={() => setStep(4)}>
              📝 Daftar Akun Baru
            </button>
            <button type="button" className="btn-wizard-secondary" style={{ width: '100%', padding: '16px' }} onClick={() => setStep(3)}>
              🔑 Masuk dengan Sesi Terdaftar
            </button>
            <div style={{ textAlign: 'center', margin: '8px 0', fontSize: '0.85rem', color: '#6b7280' }}>— atau —</div>
            <button 
              type="button" 
              className="btn-wizard-secondary" 
              style={{ width: '100%', padding: '14px', borderStyle: 'dashed', borderColor: '#f59e0b', color: '#f59e0b' }} 
              onClick={() => {
                setIsDemoMode(true);
                localStorage.setItem('is_demo_mode', 'true');
                setFullname('Budi Santoso (Demo)');
                setNickname('Budi');
                setAssistantName('Jarvis');
                setStep(6);
              }}
            >
              🚀 Coba Langsung (Mode Demo Offline)
            </button>
            
            <div className="footer-nav">
              <button type="button" className="btn-wizard-secondary" onClick={() => setStep(1)}>
                &larr; Kembali
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: LOGIN FORM */}
        {step === 3 && (
          <form onSubmit={handleRealLogin} className="form-input-container">
            {authError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', color: '#ef4444', padding: '12px', borderRadius: '10px', fontSize: '0.85rem' }}>
                {authError}
              </div>
            )}
            
            <div className="form-group">
              <label className="form-group-label" htmlFor="login_email">Alamat Email</label>
              <input
                type="email"
                id="login_email"
                className="form-text-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@email.com"
                required
              />
            </div>
            
            <div className="form-group">
              <label className="form-group-label" htmlFor="login_password">Kata Sandi</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  id="login_password"
                  className="form-text-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{ paddingRight: '45px' }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '1.1rem',
                    userSelect: 'none'
                  }}
                  title={showLoginPassword ? 'Sembunyikan Kata Sandi' : 'Lihat Kata Sandi'}
                >
                  {showLoginPassword ? '👁️' : '🙈'}
                </button>
              </div>
            </div>

            <div className="footer-nav">
              <button type="button" className="btn-wizard-secondary" onClick={() => setStep(2)}>
                &larr; Kembali
              </button>
              <button type="submit" className="btn-wizard" disabled={isLoading}>
                {isLoading ? 'Menghubungkan...' : 'Masuk Akun'}
              </button>
            </div>
          </form>
        )}

        {/* STEP 4: REGISTER FORM */}
        {step === 4 && (
          <form onSubmit={handleRealRegister} className="form-input-container">
            {authError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', color: '#ef4444', padding: '12px', borderRadius: '10px', fontSize: '0.85rem' }}>
                {authError}
              </div>
            )}

            <div className="form-group">
              <label className="form-group-label" htmlFor="reg_email">Alamat Email Aktif</label>
              <input
                type="email"
                id="reg_email"
                className="form-text-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contoh@email.com"
                required
              />
            </div>
            
            <div className="form-group">
              <label className="form-group-label" htmlFor="reg_password">Kata Sandi (Min. 6 karakter)</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type={showRegisterPassword ? 'text' : 'password'}
                  id="reg_password"
                  className="form-text-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{ paddingRight: '45px' }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '1.1rem',
                    userSelect: 'none'
                  }}
                  title={showRegisterPassword ? 'Sembunyikan Kata Sandi' : 'Lihat Kata Sandi'}
                >
                  {showRegisterPassword ? '👁️' : '🙈'}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-group-label" htmlFor="reg_password_confirm">Konfirmasi Kata Sandi</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  id="reg_password_confirm"
                  className="form-text-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{ paddingRight: '45px' }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '1.1rem',
                    userSelect: 'none'
                  }}
                  title={showConfirmPassword ? 'Sembunyikan Kata Sandi' : 'Lihat Kata Sandi'}
                >
                  {showConfirmPassword ? '👁️' : '🙈'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginTop: '4px' }}>
              <input type="checkbox" id="terms" defaultChecked style={{ marginTop: '4px', cursor: 'pointer' }} required />
              <label htmlFor="terms" style={{ fontSize: '0.8rem', color: '#9ca3af', cursor: 'pointer', lineHeight: 1.4 }}>
                Saya setuju dengan enkripsi data pribadi, sensor PII otomatis, dan aturan isolasi Row Level Security (RLS).
              </label>
            </div>

            <div className="footer-nav">
              <button type="button" className="btn-wizard-secondary" onClick={() => setStep(2)}>
                &larr; Kembali
              </button>
              <button type="submit" className="btn-wizard" disabled={isLoading}>
                {isLoading ? 'Membuat Akun...' : 'Daftar Akun'}
              </button>
            </div>
          </form>
        )}

        {/* STEP 5: EMAIL CONFIRMATION WAITING SCREEN */}
        {step === 5 && (
          <div className="form-input-container" style={{ textAlign: 'center', gap: '24px' }}>
            <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', color: '#60a5fa', padding: '24px', borderRadius: '16px', fontSize: '0.95rem', lineHeight: 1.6, textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>✉️</div>
              <strong style={{ fontSize: '1.1rem', color: '#fff', display: 'block', marginBottom: '8px' }}>Tautan Konfirmasi Dikirim!</strong>
              Kami telah mengirimkan tautan konfirmasi ke email:<br />
              <strong style={{ color: '#fff', fontSize: '1rem', display: 'block', margin: '6px 0' }}>{email}</strong>
              Silakan buka kotak masuk email Anda dan klik **Link Konfirmasi** untuk menyelesaikan pendaftaran.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <span className="spinner" style={{ width: '28px', height: '28px', borderWidth: '3px', borderColor: '#3b82f6', borderTopColor: 'transparent', margin: '0 auto' }}></span>
              <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>Menunggu Anda mengklik link konfirmasi...</span>
              
              <button 
                type="button" 
                className="btn-wizard-secondary" 
                style={{ marginTop: '12px', fontSize: '0.85rem', padding: '8px 16px' }}
                disabled={resendCooldown > 0 || isLoading}
                onClick={handleResendEmail}
              >
                {resendCooldown > 0 ? `Kirim Ulang Link (${resendCooldown}s)` : '✉️ Kirim Ulang Link Konfirmasi'}
              </button>
              
              {resendMessage && (
                <div style={{ color: resendMessage.includes('Gagal') ? '#ef4444' : '#10b981', fontSize: '0.8rem', marginTop: '4px', fontWeight: 500 }}>
                  {resendMessage}
                </div>
              )}
            </div>

            <div className="footer-nav" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn-wizard-secondary" onClick={() => setStep(4)}>
                &larr; Ganti Email atau Coba Lagi
              </button>
            </div>
          </div>
        )}

        {/* STEP 6: PROFILE SETUP */}
        {step === 6 && (
          <div className="form-input-container">
            {isDemoMode && (
              <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid #f59e0b', color: '#f59e0b', padding: '10px 14px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 500 }}>
                ⚠️ Berjalan dalam Mode Demo (Bypass Auth). Profil ini hanya akan disimpan sementara di peramban.
              </div>
            )}

            <div className="form-group">
              <label className="form-group-label" htmlFor="user_fullname">Nama Lengkap Anda</label>
              <input
                type="text"
                id="user_fullname"
                className="form-text-input"
                value={fullname}
                onChange={(e) => setFullname(e.target.value)}
                placeholder="Contoh: Budi Santoso"
                required
              />
            </div>
            
            <div className="form-group">
              <label className="form-group-label" htmlFor="user_nickname">Nama Panggilan Anda</label>
              <input
                type="text"
                id="user_nickname"
                className="form-text-input"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Contoh: Budi"
                required
              />
            </div>
            
            <div className="form-group">
              <label className="form-group-label" htmlFor="assistant_name">Nama Asisten AI Anda</label>
              <input
                type="text"
                id="assistant_name"
                className="form-text-input"
                value={assistantName}
                onChange={(e) => setAssistantName(e.target.value)}
                placeholder="Contoh: Jarvis / Friday"
                required
              />
            </div>

            <div className="footer-nav">
              <button 
                type="button" 
                className="btn-wizard-secondary" 
                onClick={() => {
                  if (isDemoMode) {
                    setIsDemoMode(false);
                    localStorage.removeItem('is_demo_mode');
                    setStep(2);
                  } else {
                    setStep(3);
                  }
                }}
              >
                &larr; Kembali
              </button>
              <button type="button" className="btn-wizard" onClick={handleNextProfileSetup}>
                Pilih Kepribadian AI &rarr;
              </button>
            </div>
          </div>
        )}

        {/* STEP 7: PERSONALITY SELECTOR */}
        {step === 7 && (
          <div className="form-input-container">
            <label className="form-group-label">Pilih Kepribadian Asisten AI (Ego AI)</label>
            
            <div className="personality-grid">
              {personalities.map((pers) => (
                <div
                  key={pers.id}
                  className={`personality-card ${selectedPersonality === pers.id ? 'selected' : ''}`}
                  onClick={() => setSelectedPersonality(pers.id)}
                >
                  <div className="personality-title">
                    <span>{pers.name}</span>
                    {selectedPersonality === pers.id && <span style={{ fontSize: '0.8rem' }}>● Terpilih</span>}
                  </div>
                  <div className="personality-desc">{pers.vibe}</div>
                  <div className="personality-instruction">{pers.instruction}</div>
                </div>
              ))}
            </div>

            <div className="footer-nav">
              <button type="button" className="btn-wizard-secondary" onClick={() => setStep(6)}>
                &larr; Kembali
              </button>
              <button type="button" className="btn-wizard" onClick={handleFinalizeProfile} disabled={isLoading}>
                {isLoading ? 'Menyiapkan Dasbor...' : 'Selesaikan & Buka Dashboard'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
