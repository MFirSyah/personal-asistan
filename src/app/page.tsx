'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import './home.css';

export default function Home() {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Step 1 States: Identitas
  const [fullname, setFullname] = useState('');
  const [nickname, setNickname] = useState('');
  const [assistantName, setAssistantName] = useState('');

  // Step 2 States: Kepribadian AI
  const [selectedPersonality, setSelectedPersonality] = useState('witty_sidekick');

  // Step 3 States: Sign Up
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Step 4 States: OTP
  const [generatedOtp, setGeneratedOtp] = useState('');
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

  // Auto prefill mock email/password in signup step if empty
  const handleNextStep1 = () => {
    if (!fullname.trim() || !nickname.trim() || !assistantName.trim()) {
      alert('Semua kolom identitas wajib diisi!');
      return;
    }
    setStep(2);
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      alert('Email dan Kata Sandi wajib diisi!');
      return;
    }
    if (password.length < 6) {
      alert('Kata Sandi minimal 6 karakter!');
      return;
    }

    // Generate random 6-digit simulated OTP code
    const mockOtp = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedOtp(mockOtp);
    setOtpInputs(['', '', '', '', '', '']);
    setOtpError('');
    setStep(4);
  };

  // OTP Input Auto-focus next logic
  const handleOtpChange = (index: number, val: string) => {
    if (isNaN(Number(val))) return;
    const newOtp = [...otpInputs];
    newOtp[index] = val.slice(-1); // Only keep the last character
    setOtpInputs(newOtp);

    // Auto-focus next input
    if (val !== '' && index < 5) {
      otpRefs[index + 1].current?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && otpInputs[index] === '' && index > 0) {
      otpRefs[index - 1].current?.focus();
    }
  };

  const handleVerifyOtp = () => {
    const enteredOtp = otpInputs.join('');
    if (enteredOtp.length < 6) {
      setOtpError('Harap isi lengkap 6 digit kode OTP');
      return;
    }

    if (enteredOtp !== generatedOtp) {
      setOtpError('Kode OTP salah! Silakan coba lagi.');
      return;
    }

    // OTP Validated!
    setStep(5);
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Save profile to localStorage for dynamic dashboard loading
    const userProfile = {
      fullname: fullname.trim(),
      user_nickname: nickname.trim(),
      assistant_name: assistantName.trim(),
      selected_personality: selectedPersonality
    };

    localStorage.setItem('sim_user_profile', JSON.stringify(userProfile));
    
    // Simulate short network delay
    setTimeout(() => {
      setIsLoading(false);
      window.location.href = '/dashboard';
    }, 1200);
  };

  return (
    <div className="onboarding-container">
      <div className="wizard-card">
        
        {/* Logo and Intro header */}
        <div className="wizard-header">
          <Image
            src="/next.svg"
            alt="Sobat AI Logo"
            width={90}
            height={20}
            style={{ marginBottom: '12px', opacity: 0.85 }}
            priority
          />
          <h2>SOBAT AI — ASISTEN PRIBADI</h2>
          <p>
            {step === 1 && 'Langkah 1: Tentukan nama panggilan Anda dan asisten AI Anda'}
            {step === 2 && 'Langkah 2: Pilih kepribadian (Ego AI) untuk asisten Anda'}
            {step === 3 && 'Langkah 3: Pendaftaran akun privat terenkripsi'}
            {step === 4 && 'Langkah 4: Masukkan kode verifikasi OTP'}
            {step === 5 && 'Langkah 5: Masuk dan hubungkan asisten pribadi Anda'}
          </p>
        </div>

        {/* Step dots indicator */}
        <div className="step-indicator">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={`indicator-dot ${step === i ? 'active' : ''}`}></div>
          ))}
        </div>

        {/* Step 1: Identitas */}
        {step === 1 && (
          <div className="form-input-container">
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

            <div className="footer-nav" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn-wizard" onClick={handleNextStep1}>
                Pilih Ego AI &rarr;
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Ego Selection */}
        {step === 2 && (
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
              <button type="button" className="btn-wizard-secondary" onClick={() => setStep(1)}>
                &larr; Kembali
              </button>
              <button type="button" className="btn-wizard" onClick={() => setStep(3)}>
                Daftar Akun &rarr;
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Sign Up Form */}
        {step === 3 && (
          <form onSubmit={handleRegisterSubmit} className="form-input-container">
            <div className="form-group">
              <label className="form-group-label" htmlFor="signup_email">Alamat Email</label>
              <input
                type="email"
                id="signup_email"
                className="form-text-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="budi.santoso@example.com"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-group-label" htmlFor="signup_password">Kata Sandi (Min. 6 karakter)</label>
              <input
                type="password"
                id="signup_password"
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
                Saya setuju dengan enkripsi data chat, RLS database pribadi, dan sensor PII otomatis Sobat AI.
              </label>
            </div>

            <div className="footer-nav">
              <button type="button" className="btn-wizard-secondary" onClick={() => setStep(2)}>
                &larr; Kembali
              </button>
              <button type="submit" className="btn-wizard">
                Kirim Kode OTP &rarr;
              </button>
            </div>
          </form>
        )}

        {/* Step 4: OTP Verification Code */}
        {step === 4 && (
          <div className="form-input-container">
            <div className="otp-container">
              <label className="form-group-label" style={{ textAlign: 'center' }}>
                Kami telah mengirimkan 6-digit kode verifikasi simulasi. Masukkan kode tersebut di bawah ini:
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
                <div style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: 500 }}>
                  {otpError}
                </div>
              )}

              {/* Simulation Banner showing OTP Code */}
              <div className="sim-otp-banner">
                <span>[SIMULASI BANNER OTP]</span>
                <span>Gunakan kode verifikasi berikut untuk melanjutkan pendaftaran:</span>
                <strong>{generatedOtp}</strong>
              </div>
            </div>

            <div className="footer-nav">
              <button type="button" className="btn-wizard-secondary" onClick={() => setStep(3)}>
                &larr; Kembali
              </button>
              <button type="button" className="btn-wizard" onClick={handleVerifyOtp}>
                Verifikasi Kode &rarr;
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Login */}
        {step === 5 && (
          <form onSubmit={handleLoginSubmit} className="form-input-container">
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', color: '#10b981', padding: '12px 16px', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 500, textAlign: 'center', marginBottom: '8px' }}>
              ✓ Akun Anda berhasil diverifikasi. Silakan masuk untuk mengaktifkan sesi.
            </div>

            <div className="form-group">
              <label className="form-group-label" htmlFor="login_email">Email</label>
              <input
                type="email"
                id="login_email"
                className="form-text-input"
                value={email}
                disabled
                style={{ opacity: 0.6, cursor: 'not-allowed' }}
              />
            </div>
            <div className="form-group">
              <label className="form-group-label" htmlFor="login_password">Kata Sandi</label>
              <input
                type="password"
                id="login_password"
                className="form-text-input"
                value={password}
                disabled
                style={{ opacity: 0.6, cursor: 'not-allowed' }}
              />
            </div>

            <div className="footer-nav" style={{ justifyContent: 'flex-end' }}>
              <button type="submit" className="btn-wizard" disabled={isLoading} style={{ width: '100%' }}>
                {isLoading ? (
                  <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', borderColor: '#fff', borderTopColor: 'transparent', marginBottom: 0 }}></span>
                ) : (
                  'Masuk & Buka Dashboard'
                )}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}
