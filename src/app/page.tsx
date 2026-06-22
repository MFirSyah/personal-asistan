'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { createClient } from '@supabase/supabase-js';
import './home.css';

// Initialize Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const getSupabaseClient = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }
  return createClient(supabaseUrl, supabaseAnonKey);
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
  const [authError, setAuthError] = useState('');

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
  useEffect(() => {
    const client = getSupabaseClient();
    setSupabaseClient(client);
    
    // Check if user is already authenticated
    if (client) {
      client.auth.getSession().then(({ data: { session } }: any) => {
        if (session) {
          // If already logged in, let's check if user profile exists
          client.from('user_profiles')
            .select('fullname, user_nickname, assistant_name, selected_personality')
            .eq('id', session.user.id)
            .maybeSingle()
            .then(({ data: uProfile }: any) => {
              if (uProfile) {
                localStorage.setItem('access_token', session.access_token);
                localStorage.setItem('refresh_token', session.refresh_token);
                localStorage.setItem('sim_user_profile', JSON.stringify(uProfile));
                // Automatically redirect if fully onboarded
                window.location.href = '/dashboard';
              }
            });
        }
      });
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

      // Save tokens
      localStorage.setItem('access_token', data.session.access_token);
      localStorage.setItem('refresh_token', data.session.refresh_token);

      // Check if profile exists
      const { data: uProfile, error: profileError } = await supabaseClient
        .from('user_profiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();

      if (uProfile) {
        // Fully onboarded, load into local storage and redirect
        localStorage.setItem('sim_user_profile', JSON.stringify({
          fullname: uProfile.fullname,
          user_nickname: uProfile.user_nickname,
          assistant_name: uProfile.assistant_name,
          selected_personality: uProfile.selected_personality
        }));
        window.location.href = '/dashboard';
      } else {
        // User created account but didn't finish profile
        setStep(6);
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setAuthError(err.message || 'Gagal masuk. Periksa kembali email dan sandi Anda.');
    } finally {
      setIsLoading(false);
    }
  };

  // REAL SUPABASE SIGNUP FLOW
  const handleRealRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setAuthError('Email dan Kata Sandi wajib diisi!');
      return;
    }
    if (password.length < 6) {
      setAuthError('Kata Sandi minimal 6 karakter!');
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
        password: password
      });

      if (error) throw error;

      if (data.session) {
        // Automatically authenticated (email confirmation is disabled)
        localStorage.setItem('access_token', data.session.access_token);
        localStorage.setItem('refresh_token', data.session.refresh_token);
        setStep(6); // Setup Profile
      } else {
        // Verification email/OTP required
        setOtpInputs(['', '', '', '', '', '']);
        setOtpError('');
        setStep(5); // OTP input
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
        setTimeout(() => {
          setIsLoading(false);
          window.location.href = '/dashboard';
        }, 1200);
        return;
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
              <input
                type="password"
                id="login_password"
                className="form-text-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
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
              <input
                type="password"
                id="reg_password"
                className="form-text-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
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

        {/* STEP 5: OTP VERIFICATION */}
        {step === 5 && (
          <div className="form-input-container">
            <div className="otp-container">
              <label className="form-group-label" style={{ textAlign: 'center', lineHeight: 1.4 }}>
                Kami telah mengirimkan 6-digit kode verifikasi ke email <strong style={{ color: '#fff' }}>{email}</strong>. 
                Masukkan kode tersebut di bawah ini untuk mengaktifkan sesi:
              </label>
              
              <div className="otp-inputs">
                {otpInputs.map((digit, idx) => (
                  <input
                    key={idx}
                    type="text"
                    ref={otpRefs[idx]}
                    className="otp-box"
                    value={digit}
                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    maxLength={1}
                  />
                ))}
              </div>

              {otpError && (
                <div style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: 500, textAlign: 'center' }}>
                  {otpError}
                </div>
              )}
            </div>

            <div className="footer-nav">
              <button type="button" className="btn-wizard-secondary" onClick={() => setStep(4)}>
                &larr; Ubah Email
              </button>
              <button type="button" className="btn-wizard" onClick={handleRealVerifyOtp} disabled={isLoading}>
                {isLoading ? 'Memverifikasi...' : 'Verifikasi & Lanjut'}
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
