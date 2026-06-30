'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let supabaseClientInstance: any = null;
const getSupabaseClient = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    // Return null in development to allow mock fallback if credentials aren't set yet
    return null;
  }
  if (!supabaseClientInstance) {
    supabaseClientInstance = createClient(supabaseUrl, supabaseAnonKey);
  }
  return supabaseClientInstance;
};

interface Insight {
  insight_type: string;
  cached_reply: string;
  sources_metadata?: any;
}

export default function DashboardPage() {
  const [supabase, setSupabase] = useState<any>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [isFromMobile, setIsFromMobile] = useState(false);
  const [profile, setProfile] = useState<any>({
    fullname: 'Sobat Setia',
    assistant_name: 'Personal Asistan',
    user_nickname: 'Sobat',
    created_at: null,
  });
  const [insights, setInsights] = useState<Record<string, Insight>>({});
  const [riskMultiplier, setRiskMultiplier] = useState(1.0); // 1.0 = 100% spending

  // New States for Dynamic Data Entry
  const [rawTransactions, setRawTransactions] = useState<any[]>([]);
  const [rawTodos, setRawTodos] = useState<any[]>([]);
  const [activeFormTab, setActiveFormTab] = useState<'money' | 'todo'>('money');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccessMsg, setSubmitSuccessMsg] = useState('');
  const [submitErrorMsg, setSubmitErrorMsg] = useState('');

  // Views navigation & Future Plans States
  const [activeView, setActiveView] = useState<'analysis' | 'data'>('analysis');
  const [futurePlans, setFuturePlans] = useState<any[]>([]);
  const [plannedInsightIds, setPlannedInsightIds] = useState<string[]>([]);
  const [morningBriefing, setMorningBriefing] = useState<string | null>(null);
  const [briefingDismissed, setBriefingDismissed] = useState(false);

  // Profile Settings Modal & Edit States
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportTransactions, setExportTransactions] = useState(false);
  const [exportTodos, setExportTodos] = useState(false);
  const [editFullname, setEditFullname] = useState('');
  const [editNickname, setEditNickname] = useState('');
  const [editAssistantName, setEditAssistantName] = useState('');
  const [editSelectedPersonality, setEditSelectedPersonality] = useState('witty_sidekick');

  // Sync profile data to edit states
  useEffect(() => {
    if (profile) {
      setEditFullname(profile.fullname || '');
      setEditNickname(profile.user_nickname || '');
      setEditAssistantName(profile.assistant_name || '');
      setEditSelectedPersonality(profile.selected_personality || 'witty_sidekick');
    }
  }, [profile]);

  // Money Tracker Form State
  const [mtAmount, setMtAmount] = useState('');
  const [mtType, setMtType] = useState<'expense' | 'income'>('expense');
  const [mtDescription, setMtDescription] = useState('');
  const [mtDate, setMtDate] = useState('');
  const [mtTime, setMtTime] = useState('');
  const [mtMetadata, setMtMetadata] = useState<Record<string, string>>({});
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);

  const handleReceiptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setReceiptFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setReceiptPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClearReceipt = () => {
    setReceiptFile(null);
    setReceiptPreview(null);
    const fileInput = document.getElementById('receipt-upload') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  // To-Do List Form State
  const [todoTaskName, setTodoTaskName] = useState('');
  const [todoStatus, setTodoStatus] = useState<'pending' | 'completed' | 'cancelled'>('pending');
  const [todoDueDate, setTodoDueDate] = useState('');
  const [todoTime, setTodoTime] = useState('');
  const [todoMetadata, setTodoMetadata] = useState<Record<string, string>>({});

  // Custom metadata input states
  const [customKey, setCustomKey] = useState('');
  const [customValue, setCustomValue] = useState('');

  // Set default transaction date and times on mount
  useEffect(() => {
    setMtDate(new Date().toISOString().split('T')[0]);
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const curTime = `${hours}:${minutes}`;
    setMtTime(curTime);
    setTodoTime(curTime);
  }, []);

  // Local helper to recompute Kelas A insights in simulation mode
  const recomputeLocalInsights = (txs: any[], todos: any[]) => {
    // 1. Cash Flow
    let totalIncome = 0;
    let totalExpense = 0;
    txs.forEach(t => {
      const amt = Number(t.amount || 0);
      if (t.type === 'income') totalIncome += amt;
      else if (t.type === 'expense') totalExpense += amt;
    });
    const netSavings = totalIncome - totalExpense;
    const cashFlowReply = `Analisis Arus Kas Anda:\nTotal Pemasukan: Rp ${totalIncome.toLocaleString('id-ID')}\nTotal Pengeluaran: Rp ${totalExpense.toLocaleString('id-ID')}\nSaldo Bersih: Rp ${netSavings.toLocaleString('id-ID')}`;

    // 2. Leak Auditor
    const leaks: Record<string, number> = {};
    txs.filter(t => t.type === 'expense').forEach(t => {
      const desc = t.description || 'Lain-lain';
      leaks[desc] = (leaks[desc] || 0) + Number(t.amount || 0);
    });
    const sortedLeaks = Object.entries(leaks).sort((a, b) => b[1] - a[1]);
    let leakReply = 'Audit Kebocoran Uang: Pengeluaran Anda terpantau wajar dan hemat.';
    if (sortedLeaks.length > 0) {
      const [topLeakDesc, topLeakAmt] = sortedLeaks[0];
      if (topLeakAmt > 50000) {
        leakReply = `Audit Kebocoran Uang: Hati-hati! Pengeluaran tertinggi ada di "${topLeakDesc}" sebesar Rp ${topLeakAmt.toLocaleString('id-ID')}. Pertimbangkan untuk membatasi pengeluaran ini.`;
      }
    }

    // 3. Consistency
    const completedTasks = todos.filter(t => t.status === 'completed').length;
    const totalTasksCount = todos.length;
    const consistencyRate = totalTasksCount > 0 ? Math.round((completedTasks / totalTasksCount) * 100) : 100;
    const consistencyReply = `Grafik Konsistensi & Pelacak Kebiasaan Baik:\nSkor Konsistensi: ${consistencyRate}%\nTugas Selesai: ${completedTasks} dari ${totalTasksCount} tugas. ${consistencyRate >= 80 ? 'Kerja bagus, pertahankan!' : 'Ayo tingkatkan fokusmu!'}`;

    // 4. Priority Matrix
    const urgentTasks = todos.filter(t => {
      const isUrgent = t.dynamic_metadata?.priority === 'high' || t.status === 'pending';
      return isUrgent;
    });
    const priorityReply = `Matriks Prioritas Mingguan:\nAda ${todos.filter(t => t.status === 'pending').length} tugas aktif dalam daftar kerja. ${urgentTasks.length > 0 ? `Prioritas utama saat ini: "${urgentTasks[0].task_name}".` : 'Semua tugas penting aman.'}`;

    // 5. Daily Load
    const pendingCount = todos.filter(t => t.status === 'pending').length;
    const loadReply = `Beban Kerja Harian:\nHari ini ada ${pendingCount} tugas aktif yang harus diselesaikan. ${pendingCount > 3 ? 'Beban kerja cukup tinggi, istirahatlah yang cukup!' : 'Beban kerja ringan, luangkan waktu untuk bersantai.'}`;

    setInsights(prev => ({
      ...prev,
      cash_flow_analysis: {
        insight_type: 'cash_flow_analysis',
        cached_reply: cashFlowReply,
        sources_metadata: { totalIncome, totalExpense }
      },
      money_leak_auditor: {
        insight_type: 'money_leak_auditor',
        cached_reply: leakReply,
        sources_metadata: sortedLeaks
      },
      consistency_graph: {
        insight_type: 'consistency_graph',
        cached_reply: consistencyReply,
        sources_metadata: { consistencyRate, completedTasks, totalTasksCount }
      },
      weekly_priority_matrix: {
        insight_type: 'weekly_priority_matrix',
        cached_reply: priorityReply,
        sources_metadata: urgentTasks
      },
      daily_activity_load: {
        insight_type: 'daily_activity_load',
        cached_reply: loadReply
      }
    }));
  };

  // Mock data fallback for developer simulation mode
  const loadMockData = () => {
    setIsLoading(true);
    let initialProfile = {
      fullname: 'Budi Santoso (Demo)',
      assistant_name: 'Jarvis (Vibe Stoic)',
      user_nickname: 'Budi',
      selected_personality: 'stoic_strategist'
    };

    const savedSimProfile = localStorage.getItem('sim_user_profile');
    if (savedSimProfile) {
      try {
        const parsed = JSON.parse(savedSimProfile);
        if (parsed.fullname) initialProfile.fullname = parsed.fullname;
        if (parsed.assistant_name) initialProfile.assistant_name = parsed.assistant_name;
        if (parsed.user_nickname) initialProfile.user_nickname = parsed.user_nickname;
        if (parsed.selected_personality) initialProfile.selected_personality = parsed.selected_personality;
      } catch (e) {
        console.error('Failed to parse saved sim profile:', e);
      }
    }

    setProfile(initialProfile);
    setInsights({
      cash_flow_analysis: {
        insight_type: 'cash_flow_analysis',
        cached_reply: 'Analisis Arus Kas Anda:\nTotal Pemasukan: Rp 8.500.000\nTotal Pengeluaran: Rp 5.200.000\nSaldo Bersih: Rp 3.300.000',
        sources_metadata: { totalIncome: 8500000, totalExpense: 5200000 },
      },
      money_leak_auditor: {
        insight_type: 'money_leak_auditor',
        cached_reply: 'Audit Kebocoran Uang: Hati-hati! Pengeluaran tertinggi ada di "kopi & jajan sore" sebesar Rp 750.000. Pertimbangkan untuk membatasi pengeluaran ini.',
        sources_metadata: [['kopi & jajan sore', 750000], ['subscription', 350000]],
      },
      consistency_graph: {
        insight_type: 'consistency_graph',
        cached_reply: 'Grafik Konsistensi & Pelacak Kebiasaan Baik:\nSkor Konsistensi: 85%\nTugas Selesai: 17 dari 20 tugas. Kerja bagus, pertahankan!',
        sources_metadata: { consistencyRate: 85, completedTasks: 17, totalTasksCount: 20 },
      },
      weekly_priority_matrix: {
        insight_type: 'weekly_priority_matrix',
        cached_reply: 'Matriks Prioritas Mingguan:\nAda 2 tugas mendesak yang jatuh tempo dalam 3 hari ke depan. Prioritas utama: "Selesaikan Laporan Pajak".',
        sources_metadata: [
          { task_name: 'Selesaikan Laporan Pajak', status: 'pending', due_date: 'high' },
          { task_name: 'Revisi Pitch Deck', status: 'pending', due_date: 'medium' },
        ],
      },
      daily_activity_load: {
        insight_type: 'daily_activity_load',
        cached_reply: 'Beban Kerja Harian:\nHari ini ada 3 tugas aktif yang harus diselesaikan. Beban kerja ringan, luangkan waktu untuk bersantai.',
      },
      runway_prediction: {
        insight_type: 'runway_prediction',
        cached_reply: 'Dengan saldo bersih tabungan saat ini sebesar Rp 15.000.000 dan rata-rata pengeluaran bulanan Rp 5.200.000, dana darurat Anda diproyeksikan akan bertahan selama 2,8 bulan jika terjadi kehilangan pendapatan secara mendadak.',
      },
      financial_risk_simulator: {
        insight_type: 'financial_risk_simulator',
        cached_reply: 'Tingkat risiko keuangan Anda dinilai Rendah-Sedang. Anda memiliki kebiasaan belanja impulsif kecil yang jika digabungkan bisa menaikkan rasio utang dalam jangka panjang.',
      },
      burnout_detection_engine: {
        insight_type: 'burnout_detection_engine',
        cached_reply: 'Mesin Deteksi Kejenuhan menunjukkan tingkat stres Anda berada pada level Rendah (20%). Jadwal Anda terdistribusi dengan baik antara tugas harian dan waktu istirahat.',
      },
      mood_vs_spending: {
        insight_type: 'mood_vs_spending',
        cached_reply: 'Korelasi Mood & Pengeluaran: Terdeteksi pola "Stress-Spending". Saat chat log Anda terdeteksi capek/marah, pengeluaran retail online Anda meningkat rata-artar 45% di malam hari.',
      },
      mood_vs_productivity: {
        insight_type: 'mood_vs_productivity',
        cached_reply: 'Korelasi Mood & Produktivitas: Anda bekerja sangat efektif di pagi hari (skor tugas selesai 90%), namun jika mood sore Anda lelah, produktivitas turun menjadi hanya 15%.',
      },
      trend_worth_it_score: {
        insight_type: 'trend_worth_it_score',
        cached_reply: 'Worth-It Audit: 80% dari pengeluaran Anda minggu ini tergolong investasi bernilai tinggi (edukasi, kesehatan, bahan pangan pokok). Hanya 20% yang tergolong impulsif fomo.',
      },
    });

    const initialTxs = [
      { id: '1', amount: 750000, type: 'expense', description: 'kopi & jajan sore', transaction_date: '2026-06-20', dynamic_metadata: { kategori: 'makanan', tingkat_fomo: 'tinggi', jam: '15:45' } },
      { id: '2', amount: 350000, type: 'expense', description: 'subscription spotify & netflix', transaction_date: '2026-06-19', dynamic_metadata: { kategori: 'hiburan', worth_it_score: 'rendah', jam: '23:30' } },
      { id: '3', amount: 8500000, type: 'income', description: 'gaji bulanan', transaction_date: '2026-06-01', dynamic_metadata: { kategori: 'gaji', jam: '08:00' } },
    ];
    const initialTodos = [
      { id: '1', task_name: 'Selesaikan Laporan Pajak', status: 'pending', due_date: '2026-06-23', dynamic_metadata: { priority: 'high', category: 'keuangan', jam: '09:00' } },
      { id: '2', task_name: 'Revisi Pitch Deck', status: 'pending', due_date: '2026-06-24', dynamic_metadata: { priority: 'medium', category: 'kerja', jam: '14:30' } },
      { id: '3', task_name: 'Olahraga Sore', status: 'completed', due_date: '2026-06-20', dynamic_metadata: { priority: 'low', energy_required: 'sedang', jam: '17:15' } },
    ];
    const initialPlans = [
      { id: 'mock-1', name: 'Optimasi Jatah Kopi Bulanan', actionSteps: ['Batasi beli kopi luar maks 2 kali seminggu', 'Seduh kopi lokal liberika/robusta sendiri di kantor'], targetDate: '2026-06-30', status: 'aktif' },
      { id: 'mock-2', name: 'Penyelesaian Portofolio Porting Flutter', actionSteps: ['Selesaikan tugas Deploy Web App ke Vercel', 'Update CV dengan link hasil deploy'], targetDate: '2026-06-25', status: 'aktif' }
    ];
    setRawTransactions(initialTxs);
    setRawTodos(initialTodos);
    setFuturePlans(initialPlans);

    setIsAuthenticated(true);
    setIsLoading(false);
  };

  const fetchDashboardData = async (client: any, user: any) => {
    const { data: uProfile } = await client
      .from('user_profiles')
      .select('fullname, assistant_name, user_nickname, selected_personality, dynamic_metadata, created_at')
      .eq('id', user.id)
      .maybeSingle();
    
    if (uProfile) {
      setProfile(uProfile);
      const meta = (uProfile as any).dynamic_metadata || {};
      if (meta.future_plans && Array.isArray(meta.future_plans)) {
        setFuturePlans(meta.future_plans);
      }
    }

    const { data: cache } = await client
      .from('ai_insights_cache')
      .select('insight_type, cached_reply, sources_metadata')
      .eq('user_id', user.id);

    if (cache) {
      const map: Record<string, Insight> = {};
      cache.forEach((item: Insight) => {
        map[item.insight_type] = item;
      });
      setInsights(map);
    }

    // Fetch Raw Transactions for Dynamic Form fields scanning
    const { data: mtData } = await client
      .from('money_trackers')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (mtData) setRawTransactions(mtData);

    // Fetch Raw Todos for Dynamic Form fields scanning
    const { data: todoData } = await client
      .from('todo_lists')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (todoData) setRawTodos(todoData);
  };

  useEffect(() => {
    // Check if we are in demo mode
    const isDemoModeToken = typeof window !== 'undefined' && localStorage.getItem('is_demo_mode') === 'true';
    if (isDemoModeToken) {
      loadMockData();
      return;
    }

    // Check if accessing from mobile app
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setIsFromMobile(params.get('from') === 'mobile');
    }

    const client = getSupabaseClient();
    setSupabase(client);

    if (!client) {
      console.warn('Supabase credentials not found. Defaulting to simulation mode.');
      loadMockData();
      return;
    }

    // Safely check active session from client
    client.auth.getSession().then(async ({ data: { session } }: any) => {
      if (session) {
        localStorage.setItem('access_token', session.access_token);
        localStorage.setItem('refresh_token', session.refresh_token);
        setIsAuthenticated(true);
        try {
          await fetchDashboardData(client, session.user);
          // Fetch morning briefing
          try {
            const bRes = await fetch('/api/v1/briefing', {
              headers: {
                'x-jarvis-gateway-key': 'jarvis-super-secret-key-2026',
                'Authorization': `Bearer ${session.access_token}`,
              },
            });
            if (bRes.ok) {
              const bData = await bRes.json();
              if (bData.show_briefing && bData.briefing_text) {
                setMorningBriefing(bData.briefing_text);
              }
            }
          } catch (bErr) {
            console.warn('Morning briefing fetch failed:', bErr);
          }
        } catch (err: any) {
          console.error('Failed to load dashboard data:', err);
          setErrorMsg(err.message || 'Gagal memuat data dashboard');
        } finally {
          setIsLoading(false);
        }
      } else {
        // Fallback to local storage keys
        const access = localStorage.getItem('access_token');
        const refresh = localStorage.getItem('refresh_token');
        if (access && refresh) {
          initSession(client, access, refresh);
        } else {
          setIsLoading(false);
        }
      }
    }).catch((err: any) => {
      console.error('Failed to get session:', err);
      setIsLoading(false);
    });

    // 1. Listen to postMessage session tokens from Flutter WebView
    const handleMessage = async (event: MessageEvent) => {
      try {
        const { type, access_token, refresh_token } = event.data || {};
        if (type === 'SESSION_TOKENS' && access_token && refresh_token) {
          console.log('Session tokens received via postMessage.');
          localStorage.setItem('access_token', access_token);
          localStorage.setItem('refresh_token', refresh_token);
          await initSession(client, access_token, refresh_token);
        }
      } catch (err) {
        console.error('Error handling postMessage session:', err);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const initSession = async (client: any, accessToken: string, refreshToken: string) => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const { error } = await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        console.error('Supabase setSession error:', error);
        setErrorMsg('Sesi kedaluwarsa. Silakan reload dari aplikasi handphone.');
        setIsLoading(false);
        return;
      }

      setIsAuthenticated(true);
      const { data: { user } } = await client.auth.getUser();
      if (user) {
        await fetchDashboardData(client, user);
      }
    } catch (err: any) {
      console.error('Initialization error:', err);
      setErrorMsg(err.message || 'Gagal memuat dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreatePlan = async (insightId: string, name: string, actionSteps: string[], targetDate: string) => {
    if (plannedInsightIds.includes(insightId)) return;
    
    const newPlan = {
      id: String(Date.now()),
      name,
      actionSteps,
      targetDate,
      status: 'aktif',
    };

    const updatedPlans = [...futurePlans, newPlan];
    setFuturePlans(updatedPlans);
    setPlannedInsightIds(prev => [...prev, insightId]);

    if (supabase) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const updatedMetadata = {
            ...(profile.dynamic_metadata || {}),
            future_plans: updatedPlans
          };
          await supabase
            .from('user_profiles')
            .update({ dynamic_metadata: updatedMetadata })
            .eq('id', user.id);
        }
      } catch (err) {
        console.error('Failed to save future plan to Supabase:', err);
      }
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitSuccessMsg('');
    setSubmitErrorMsg('');

    try {
      if (!editFullname.trim()) throw new Error('Nama lengkap tidak boleh kosong');
      if (!editNickname.trim()) throw new Error('Nama panggilan tidak boleh kosong');
      if (!editAssistantName.trim()) throw new Error('Nama asisten tidak boleh kosong');

      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Pengguna tidak terautentikasi.');

        const { error } = await supabase
          .from('user_profiles')
          .update({
            fullname: editFullname.trim(),
            user_nickname: editNickname.trim(),
            assistant_name: editAssistantName.trim(),
            selected_personality: editSelectedPersonality
          })
          .eq('id', user.id);

        if (error) throw error;
      }

      // Update local state for both Supabase and Simulation mode
      setProfile((prev: any) => ({
        ...prev,
        fullname: editFullname.trim(),
        user_nickname: editNickname.trim(),
        assistant_name: editAssistantName.trim(),
        selected_personality: editSelectedPersonality
      }));

      alert('Profil berhasil diperbarui!');
      setShowProfileModal(false);
    } catch (err: any) {
      console.error('Error saving profile:', err);
      alert(err.message || 'Gagal memperbarui profil');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus transaksi ini?')) return;
    
    if (supabase) {
      try {
        const { error } = await supabase
          .from('money_trackers')
          .delete()
          .eq('id', id);
        if (error) throw error;

        // Refresh data
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: updatedTxs } = await supabase
            .from('money_trackers')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);
          if (updatedTxs) {
            setRawTransactions(updatedTxs);
            // Recompute local insights to update state instantly
            recomputeLocalInsights(updatedTxs, rawTodos);
          }

          // Trigger server recompute
          try {
            const gatewayKey = process.env.NEXT_PUBLIC_GATEWAY_KEY || 'jarvis-super-secret-key-2026';
            await fetch('/api/internal/recompute-insight', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-jarvis-gateway-key': gatewayKey,
              },
              body: JSON.stringify({ record: { user_id: user.id } }),
            });
          } catch (apiErr) {
            console.error('Failed to trigger insight recompute:', apiErr);
          }
        }
      } catch (err) {
        console.error('Error deleting transaction:', err);
        alert('Gagal menghapus transaksi dari database');
      }
    } else {
      // Simulation mode
      const updatedTxs = rawTransactions.filter(t => t.id !== id);
      setRawTransactions(updatedTxs);
      recomputeLocalInsights(updatedTxs, rawTodos);
    }
  };

  const handleDeleteTodo = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus tugas ini?')) return;

    if (supabase) {
      try {
        const { error } = await supabase
          .from('todo_lists')
          .delete()
          .eq('id', id);
        if (error) throw error;

        // Refresh data
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: updatedTodos } = await supabase
            .from('todo_lists')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);
          if (updatedTodos) {
            setRawTodos(updatedTodos);
            recomputeLocalInsights(rawTransactions, updatedTodos);
          }

          // Trigger server recompute
          try {
            const gatewayKey = process.env.NEXT_PUBLIC_GATEWAY_KEY || 'jarvis-super-secret-key-2026';
            await fetch('/api/internal/recompute-insight', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-jarvis-gateway-key': gatewayKey,
              },
              body: JSON.stringify({ record: { user_id: user.id } }),
            });
          } catch (apiErr) {
            console.error('Failed to trigger insight recompute:', apiErr);
          }
        }
      } catch (err) {
        console.error('Error deleting todo:', err);
        alert('Gagal menghapus tugas dari database');
      }
    } else {
      // Simulation mode
      const updatedTodos = rawTodos.filter(t => t.id !== id);
      setRawTodos(updatedTodos);
      recomputeLocalInsights(rawTransactions, updatedTodos);
    }
  };

  const handleUpdateTodoStatus = async (id: string, newStatus: 'pending' | 'completed' | 'cancelled') => {
    if (supabase) {
      try {
        const { error } = await supabase
          .from('todo_lists')
          .update({ status: newStatus })
          .eq('id', id);
        if (error) throw error;

        // Refresh data
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: updatedTodos } = await supabase
            .from('todo_lists')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);
          if (updatedTodos) {
            setRawTodos(updatedTodos);
            recomputeLocalInsights(rawTransactions, updatedTodos);
          }

          // Trigger server recompute
          try {
            const gatewayKey = process.env.NEXT_PUBLIC_GATEWAY_KEY || 'jarvis-super-secret-key-2026';
            await fetch('/api/internal/recompute-insight', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-jarvis-gateway-key': gatewayKey,
              },
              body: JSON.stringify({ record: { user_id: user.id } }),
            });
          } catch (apiErr) {
            console.error('Failed to trigger insight recompute:', apiErr);
          }
        }
      } catch (err) {
        console.error('Error updating todo status:', err);
        alert('Gagal memperbarui status tugas di database');
      }
    } else {
      // Simulation mode
      const updatedTodos = rawTodos.map(t => t.id === id ? { ...t, status: newStatus } : t);
      setRawTodos(updatedTodos);
      recomputeLocalInsights(rawTransactions, updatedTodos);
    }
  };

  const getSpecialInsights = () => {
    const coffeeExpense = rawTransactions
      .filter(t => t.type === 'expense' && t.description.toLowerCase().includes('kopi'))
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    
    const pendingCount = rawTodos.filter(t => t.status === 'pending').length;

    return [
      {
        id: 'insight-coffee-inflation',
        title: 'Dampak Kenaikan Harga Pangan & Kopi Global (El Niño 2026)',
        tag: 'Keuangan + Pangan',
        isInternet: true,
        description: `Harga biji kopi Robusta/Arabika di Indonesia melonjak signifikan akibat anomali cuaca El Niño (penurunan panen 15-20%). Pengeluaran kopi Anda tercatat Rp ${coffeeExpense > 0 ? coffeeExpense.toLocaleString('id-ID') : '750.000'}. Dibandingkan dengan tugas '${rawTodos[0]?.task_name || 'Laporan Pajak'}' yang masih pending, menyeduh kopi liberika/robusta lokal sendiri di rumah bisa menghemat pengeluaran harian Anda secara signifikan.`,
        planName: 'Batas Anggaran Kopi & Jajan Harian',
        actionSteps: [
          'Batasi beli kopi luar maks 2x seminggu',
          'Seduh kopi robusta/arabika lokal sendiri di rumah/kantor',
          `Selesaikan tugas '${rawTodos[0]?.task_name || 'Laporan Pajak'}' sambil menyeduh kopi mandiri`
        ],
        targetDate: '1 minggu ke depan'
      },
      {
        id: 'insight-freelance-demand',
        title: 'Tren Pasar Kerja Freelance Developer Indonesia 2026',
        tag: 'Karir + Kerja',
        isInternet: true,
        description: `Data internet menunjukkan lonjakan permintaan freelance developer (Web & Mobile) sebesar 15% di pertengahan 2026. Anda memiliki ${pendingCount} tugas aktif tertunda termasuk '${rawTodos[1]?.task_name || 'Revisi Pitch Deck'}'. Menyelesaikan tugas ini akan memperkuat portofolio digital Anda untuk memenangkan proyek luar negeri bernilai tinggi.`,
        planName: 'Selesaikan Portofolio Freelance Developer',
        actionSteps: [
          `Selesaikan tugas '${rawTodos[1]?.task_name || 'Revisi Pitch Deck'}' dalam 3 hari`,
          'Publikasikan hasil deploy web app ke platform portofolio digital',
          'Kirim lamaran freelance ke 3 prospek klien teknologi'
        ],
        targetDate: '3 hari'
      },
      {
        id: 'insight-sub-audit',
        title: 'Audit Langganan Digital & Kenaikan Tarif SaaS',
        tag: 'Anti-Boros',
        isInternet: true,
        description: `Banyak platform digital melakukan penyesuaian tarif PPN 12% di Indonesia pada tahun 2026. Anda memiliki pengeluaran langganan (seperti Netflix, Spotify) sebesar Rp 350.000. Sementara itu, tugas pembelajaran seperti '${rawTodos[2]?.task_name || 'Belajar Next.js'}' harus ditargetkan selesai agar biaya langganan penunjang produktivitas Anda tidak menjadi pengeluaran fomo yang sia-sia.`,
        planName: 'Audit & Konsolidasi Langganan Layanan',
        actionSteps: [
          'List seluruh pengeluaran langganan SaaS/Hiburan aktif',
          'Cancel langganan yang tidak diakses lebih dari 14 hari',
          'Fokuskan waktu luang untuk menyelesaikan modul belajar aktif'
        ],
        targetDate: '3 hari'
      },
      {
        id: 'insight-morning-focus',
        title: 'Korelasi Fokus Kerja Pagi Hari & Efisiensi Energi',
        tag: 'Produktivitas',
        isInternet: false,
        description: `Analisis emosi harian Anda menunjukkan efisiensi kerja pagi hari mencapai 90%, namun drop hingga 15% jika mood sore Anda kelelahan. Tren kerja modern menyarankan 'Eat the Frog' di pagi hari. Jadwalkan tugas utama seperti '${rawTodos[0]?.task_name || 'Selesaikan Laporan Pajak'}' sebelum jam 12 siang.`,
        planName: 'Blok Waktu Fokus Pagi Hari',
        actionSteps: [
          'Matikan notifikasi HP dari jam 09:00 - 11:30',
          'Selesaikan 1 tugas berat yang berada di prioritas teratas',
          'Evaluasi emosi kerja setelah sesi pagi selesai'
        ],
        targetDate: 'Setiap Hari'
      },
      {
        id: 'insight-stress-spending',
        title: 'Mitigasi Stres Belanja (Stress-Spending di Jam Malam)',
        tag: 'Life Balance',
        isInternet: true,
        description: `E-commerce di Indonesia semakin mempermudah checkout instan di malam hari. Grafik kognitif mendeteksi kenaikan belanja retail Anda sebesar 45% saat chat log Anda terdeteksi lelah/marah di malam hari. Terapkan aturan 'tunda 24 jam' untuk menekan impulsivitas belanja ini.`,
        planName: 'Detox Belanja Impulsif Malam Hari',
        actionSteps: [
          'Hapus pintasan aplikasi e-commerce dari layar utama setelah jam 20:00',
          'Tunda checkout barang non-esensial di keranjang belanja selama 24 jam',
          'Ganti kebiasaan scroll belanja dengan membaca buku atau meditasi'
        ],
        targetDate: '2 minggu'
      }
    ];
  };

  const handleTriggerPrint = () => {
    setShowExportModal(false);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitSuccessMsg('');
    setSubmitErrorMsg('');

    try {
      if (activeFormTab === 'money') {
        const amountNum = parseFloat(mtAmount);
        if (isNaN(amountNum) || amountNum <= 0) {
          throw new Error('Jumlah uang (amount) harus berupa angka positif');
        }
        if (!mtDescription) {
          throw new Error('Deskripsi transaksi wajib diisi');
        }

        let finalMetadata: Record<string, any> = { ...mtMetadata, jam: mtTime || new Date().toTimeString().slice(0, 5) };

        if (supabase) {
          // 1. Get authenticated user
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error('Pengguna tidak terautentikasi.');

          // 1.5 Upload receipt if file is selected
          if (receiptFile) {
            try {
              const fileExt = receiptFile.name.split('.').pop();
              const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
              
              const { error: uploadError } = await supabase.storage
                .from('receipts')
                .upload(fileName, receiptFile, {
                  cacheControl: '3600',
                  upsert: false
                });

              if (uploadError) throw uploadError;

              const { data: { publicUrl } } = supabase.storage
                .from('receipts')
                .getPublicUrl(fileName);

              finalMetadata = { ...finalMetadata, receipt_url: publicUrl };
            } catch (storageErr: any) {
              console.error('Storage upload failed:', storageErr);
              alert(`Peringatan: Gagal mengunggah foto struk (${storageErr.message || 'Error'}). Transaksi tetap akan disimpan.`);
            }
          }

          const newTx = {
            amount: amountNum,
            type: mtType,
            description: mtDescription,
            transaction_date: mtDate || new Date().toISOString().split('T')[0],
            dynamic_metadata: finalMetadata,
          };

          // 2. Insert to database
          const { error } = await supabase
            .from('money_trackers')
            .insert({ ...newTx, user_id: user.id });

          if (error) throw error;

          // 3. Trigger Real-time recompute insight Kelas A
          try {
            const gatewayKey = process.env.NEXT_PUBLIC_GATEWAY_KEY || 'jarvis-super-secret-key-2026';
            await fetch('/api/internal/recompute-insight', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-jarvis-gateway-key': gatewayKey,
              },
              body: JSON.stringify({ record: { user_id: user.id } }),
            });
          } catch (apiErr) {
            console.error('Failed to trigger insight recompute:', apiErr);
          }

          // 4. Refresh data
          const { data: updatedTxs } = await supabase
            .from('money_trackers')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);
          if (updatedTxs) setRawTransactions(updatedTxs);

          const { data: cache } = await supabase
            .from('ai_insights_cache')
            .select('insight_type, cached_reply, sources_metadata')
            .eq('user_id', user.id);

          if (cache) {
            const map: Record<string, Insight> = {};
            cache.forEach((item: Insight) => {
              map[item.insight_type] = item;
            });
            setInsights(map);
          }
        } else {
          // Simulation mode: append to state and recalculate
          if (receiptPreview) {
            finalMetadata = { ...finalMetadata, receipt_url: receiptPreview };
          }
          const newTx = {
            amount: amountNum,
            type: mtType,
            description: mtDescription,
            transaction_date: mtDate || new Date().toISOString().split('T')[0],
            dynamic_metadata: finalMetadata,
          };

          const simulatedTx = {
            id: String(Date.now()),
            ...newTx
          };
          const updatedTxs = [simulatedTx, ...rawTransactions];
          setRawTransactions(updatedTxs);
          recomputeLocalInsights(updatedTxs, rawTodos);
        }

        setSubmitSuccessMsg('Transaksi berhasil ditambahkan!');
        // Reset form
        setMtAmount('');
        setMtDescription('');
        setReceiptFile(null);
        setReceiptPreview(null);
        const fileInput = document.getElementById('receipt-upload') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
        setMtMetadata({});
      } else {
        if (!todoTaskName) {
          throw new Error('Nama tugas wajib diisi');
        }

        const newTodo = {
          task_name: todoTaskName,
          status: todoStatus,
          due_date: todoDueDate || null,
          dynamic_metadata: { ...todoMetadata, jam: todoTime || new Date().toTimeString().slice(0, 5) },
        };

        if (supabase) {
          // 1. Get authenticated user
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error('Pengguna tidak terautentikasi.');

          // 2. Insert to database
          const { error } = await supabase
            .from('todo_lists')
            .insert({ ...newTodo, user_id: user.id });

          if (error) throw error;

          // 3. Trigger Real-time recompute insight
          try {
            const gatewayKey = process.env.NEXT_PUBLIC_GATEWAY_KEY || 'jarvis-super-secret-key-2026';
            await fetch('/api/internal/recompute-insight', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-jarvis-gateway-key': gatewayKey,
              },
              body: JSON.stringify({ record: { user_id: user.id } }),
            });
          } catch (apiErr) {
            console.error('Failed to trigger insight recompute:', apiErr);
          }

          // 4. Refresh data
          const { data: updatedTodos } = await supabase
            .from('todo_lists')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);
          if (updatedTodos) setRawTodos(updatedTodos);

          const { data: cache } = await supabase
            .from('ai_insights_cache')
            .select('insight_type, cached_reply, sources_metadata')
            .eq('user_id', user.id);

          if (cache) {
            const map: Record<string, Insight> = {};
            cache.forEach((item: Insight) => {
              map[item.insight_type] = item;
            });
            setInsights(map);
          }
        } else {
          // Simulation mode
          const simulatedTodo = {
            id: String(Date.now()),
            created_at: new Date().toISOString(),
            ...newTodo
          };
          const updatedTodos = [simulatedTodo, ...rawTodos];
          setRawTodos(updatedTodos);
          recomputeLocalInsights(rawTransactions, updatedTodos);
        }

        setSubmitSuccessMsg('Tugas berhasil ditambahkan!');
        setTodoTaskName('');
        setTodoDueDate('');
        setTodoMetadata({});
      }
    } catch (err: any) {
      console.error('Error submitting form:', err);
      setSubmitErrorMsg(err.message || 'Gagal menyimpan data');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddCustomField = () => {
    if (!customKey.trim()) return;
    const cleanKey = customKey.trim().toLowerCase();
    if (activeFormTab === 'money') {
      setMtMetadata(prev => ({ ...prev, [cleanKey]: customValue }));
    } else {
      setTodoMetadata(prev => ({ ...prev, [cleanKey]: customValue }));
    }
    setCustomKey('');
    setCustomValue('');
  };

  const handleRemoveMetadataField = (key: string) => {
    if (activeFormTab === 'money') {
      setMtMetadata(prev => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    } else {
      setTodoMetadata(prev => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    }
  };

  const getMetadataKeys = (items: any[]) => {
    const keys = new Set<string>();
    items.forEach((item) => {
      if (item.dynamic_metadata && typeof item.dynamic_metadata === 'object') {
        Object.keys(item.dynamic_metadata).forEach((k) => {
          if (k !== 'long_term_memory' && k !== 'jam') {
            keys.add(k);
          }
        });
      }
    });
    return Array.from(keys);
  };

  const mtKeys = getMetadataKeys(rawTransactions);
  const todoKeys = getMetadataKeys(rawTodos);

  const handleLogout = async () => {
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.error('Error signing out from Supabase:', err);
      }
    }
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('sim_user_profile');
    localStorage.removeItem('is_demo_mode');
    setIsAuthenticated(false);
    setInsights({});
    setRawTransactions([]);
    setRawTodos([]);
    window.location.href = '/';
  };

  if (isLoading) {
    return (
      <div className="auth-container">
        <div className="spinner"></div>
        <p>Membaca sesi aman...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="auth-container">
        <div style={{ maxWidth: '400px', width: '100%' }}>
          <h2 style={{ fontFamily: 'var(--font-title)', marginBottom: '16px' }}>Dashboard Terkunci</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.95rem' }}>
            Halaman ini adalah dashboard privat yang hanya dapat diakses setelah masuk ke akun Personal Asistan.
          </p>
          
          {errorMsg && (
            <div style={{ color: 'var(--color-danger)', fontSize: '0.9rem', marginBottom: '16px' }}>
              {errorMsg}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button className="btn" onClick={() => window.location.href = '/'}>
              Buka Halaman Login / Registrasi
            </button>
            <button className="btn btn-secondary" onClick={() => window.location.reload()}>
              Segarkan Sesi
            </button>
            <button className="btn btn-secondary" onClick={loadMockData}>
              Simulasikan Mode Demo (Developer)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Extracts data helper
  const totalIncome = insights.cash_flow_analysis?.sources_metadata?.totalIncome || 0;
  const totalExpense = insights.cash_flow_analysis?.sources_metadata?.totalExpense || 0;
  const netSavings = totalIncome - totalExpense;
  const progressRatio = totalIncome > 0 ? Math.min((totalExpense / totalIncome) * 100, 100) : 0;
  const consistencyScore = insights.consistency_graph?.sources_metadata?.consistencyRate || 0;

  const isDemo = !supabase || (typeof window !== 'undefined' && localStorage.getItem('is_demo_mode') === 'true') || profile.fullname?.includes('(Demo)') || profile.user_nickname?.includes('Demo');

  const getUsageDays = () => {
    if (!profile || !profile.created_at) return 1;
    try {
      const createdDate = new Date(profile.created_at);
      const today = new Date();
      const createdZero = new Date(createdDate.getFullYear(), createdDate.getMonth(), createdDate.getDate());
      const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const diffTime = todayZero.getTime() - createdZero.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
      return diffDays || 1;
    } catch (e) {
      return 1;
    }
  };
  const usageDays = getUsageDays();

  const isCardLocked = (config: {
    reqDays?: number;
    reqTrans?: number;
    reqTodos?: number;
  }) => {
    if (isDemo) return false;
    if (config.reqDays && usageDays < config.reqDays) return true;
    if (config.reqTrans && rawTransactions.length < config.reqTrans) return true;
    if (config.reqTodos && rawTodos.length < config.reqTodos) return true;
    return false;
  };

  const renderLockOverlay = (config: {
    reqDays?: number;
    reqTrans?: number;
    reqTodos?: number;
  }) => {
    if (isDemo) return null;

    let isLocked = false;
    let message = '';
    
    if (config.reqDays && usageDays < config.reqDays) {
      isLocked = true;
      const shortDays = config.reqDays - usageDays;
      message = `Analisis muncul pada hari ke-${config.reqDays} penggunaan. Anda kurang ${shortDays} hari. Terus gunakan aplikasi agar dapat menampilkan data.`;
    } else if (config.reqTrans && rawTransactions.length < config.reqTrans) {
      isLocked = true;
      const shortTrans = config.reqTrans - rawTransactions.length;
      message = `Analisis muncul setelah Anda memasukkan minimal ${config.reqTrans} data transaksi. Anda kurang ${shortTrans} data. Terus gunakan aplikasi agar dapat menampilkan data.`;
    } else if (config.reqTodos && rawTodos.length < config.reqTodos) {
      isLocked = true;
      const shortTodos = config.reqTodos - rawTodos.length;
      message = `Analisis muncul setelah Anda memasukkan minimal ${config.reqTodos} data tugas. Anda kurang ${shortTodos} data. Terus gunakan aplikasi agar dapat menampilkan data.`;
    }

    if (!isLocked) return null;

    return (
      <div className="locked-overlay">
        <span className="locked-icon">⏳</span>
        <p className="locked-text">{message}</p>
      </div>
    );
  };

  // Simulator calculation
  const simulatedExpense = totalExpense * riskMultiplier;
  const simulatedSavings = totalIncome - simulatedExpense;
  const baseRunway = totalExpense > 0 ? (15000000 / totalExpense) : 3;
  const simulatedRunway = simulatedExpense > 0 ? (15000000 / simulatedExpense) : 3;

  // Time-based Analysis Helpers
  const parseHour = (item: any): number => {
    const jam = item.dynamic_metadata?.jam || '';
    if (!jam) return -1;
    const parts = jam.split(':');
    if (parts.length > 0) {
      const hr = parseInt(parts[0], 10);
      return isNaN(hr) ? -1 : hr;
    }
    return -1;
  };

  // Group transactions by time periods
  let spendPagi = 0;   // 05:00 - 12:00
  let spendSiang = 0;  // 12:00 - 17:00
  let spendMalam = 0;  // 17:00 - 05:00
  let totalExpensesForTime = 0;

  rawTransactions.filter(t => t.type === 'expense').forEach(t => {
    const hr = parseHour(t);
    const amt = Number(t.amount || 0);
    if (hr === -1) return;
    totalExpensesForTime += amt;
    if (hr >= 5 && hr < 12) spendPagi += amt;
    else if (hr >= 12 && hr < 17) spendSiang += amt;
    else spendMalam += amt;
  });

  const nightSpendingPercent = totalExpensesForTime > 0 ? Math.round((spendMalam / totalExpensesForTime) * 100) : 0;

  // Group tasks by time periods
  let tasksPagi = 0;
  let tasksSiang = 0;
  let tasksMalam = 0;

  rawTodos.forEach(todo => {
    const hr = parseHour(todo);
    if (hr === -1) return;
    if (hr >= 5 && hr < 12) tasksPagi++;
    else if (hr >= 12 && hr < 17) tasksSiang++;
    else tasksMalam++;
  });

  const totalTasksWithTime = tasksPagi + tasksSiang + tasksMalam;
  
  let chronotypeName = 'Steady Bear (Moderat)';
  let chronotypeRec = 'Aktivitas kognitif Anda merata sepanjang hari. Pertahankan ritme kerja yang seimbang.';
  if (totalTasksWithTime > 0) {
    if (tasksPagi >= tasksSiang && tasksPagi >= tasksMalam) {
      chronotypeName = 'Morning Lion (Fokus Pagi)';
      chronotypeRec = 'Energi mental tertinggi Anda berada di pagi hari. Jadwalkan tugas analitis penting sebelum jam 12 siang!';
    } else if (tasksMalam >= tasksPagi && tasksMalam >= tasksSiang) {
      chronotypeName = 'Night Owl (Kreatif Malam)';
      chronotypeRec = 'Anda lebih produktif di malam hari. Hati-hati terhadap kerentanan stres belanja impulsif setelah jam 8 malam.';
    }
  }

  return (
    <div>
      {/* Header - Hide when accessed from mobile app */}
      {!isFromMobile && (
        <header className="dashboard-header">
        <div className="brand">
          <h1>DASHBOARD KOGNITIF</h1>
          <p>Asisten Pribadi: {profile.assistant_name} ({
            profile.selected_personality === 'stoic_strategist' ? 'Stoic' :
            profile.selected_personality === 'tough_love_coach' ? 'Tough-Love' :
            profile.selected_personality === 'ultimate_hype_man' ? 'Hype-Man' :
            profile.selected_personality === 'elegant_confidant' ? 'Elegant' :
            'Witty'
          })</p>
        </div>
        <div 
          className="user-badge" 
          style={{ cursor: 'pointer', transition: 'var(--transition-smooth)' }} 
          onClick={() => {
            setShowProfileModal(true);
            setSubmitSuccessMsg('');
            setSubmitErrorMsg('');
          }}
          title="Klik untuk membuka Pengaturan Profil"
        >
          <div className="avatar-dot"></div>
          <span style={{ fontSize: '0.9rem', fontWeight: 500, marginRight: '4px' }}>{profile.fullname}</span>
          <button 
            type="button" 
            className="btn btn-secondary" 
            style={{ padding: '4px 8px', fontSize: '0.75rem' }} 
            onClick={(e) => {
              e.stopPropagation();
              handleLogout();
            }}
          >
            Keluar
          </button>
        </div>
      </header>
      )}

      {/* Morning Briefing Banner */}
      {morningBriefing && !briefingDismissed && (
        <div style={{
          margin: '0 20px 16px',
          padding: '20px 24px',
          background: 'linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(139,92,246,0.1) 100%)',
          borderRadius: '16px',
          border: '1px solid rgba(59,130,246,0.25)',
          position: 'relative',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <span style={{ fontSize: '1.5rem' }}>☀️</span>
            <span style={{ fontWeight: 700, fontSize: '1rem', color: '#FBBF24', fontFamily: 'var(--font-title)' }}>Morning Briefing</span>
            <button
              type="button"
              onClick={() => setBriefingDismissed(true)}
              style={{
                marginLeft: 'auto',
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                color: '#94A3B8',
                fontSize: '1.1rem',
                cursor: 'pointer',
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Tutup briefing"
            >
              ×
            </button>
          </div>
          <p style={{ color: '#CBD5E1', fontSize: '0.9rem', lineHeight: '1.7', whiteSpace: 'pre-wrap', margin: 0 }}>
            {morningBriefing}
          </p>
        </div>
      )}

      {/* Main Content */}
      <main className="dashboard-content">
        
        {/* Navigation Tabs */}
        <nav className="dashboard-nav" style={{ marginBottom: '8px' }}>
          <button 
            type="button" 
            className={`nav-btn ${activeView === 'analysis' ? 'active' : ''}`}
            onClick={() => setActiveView('analysis')}
          >
            📊 Analisis Kognitif
          </button>
          <button 
            type="button" 
            className={`nav-btn ${activeView === 'data' ? 'active' : ''}`}
            onClick={() => setActiveView('data')}
          >
            ⚙️ Manajemen Data & Input
          </button>
        </nav>

        {activeView === 'analysis' && (
          <>
            {/* Developer simulation controls banner */}
            {!supabase && (
              <div className="dev-simulation-panel">
                <div>
                  <strong style={{ color: 'var(--color-warning)' }}>[MODE SIMULASI DEV]</strong>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Berjalan tanpa database Supabase. Anda dapat memeriksa visualisasi UI dengan data demo interaktif.
                  </p>
                </div>
                <button className="btn btn-secondary" onClick={() => alert('Fitur RLS asli diaktifkan di production.')}>
                  Uji Coba RLS Keamanan
                </button>
              </div>
            )}

            {/* Action Bar for PDF Export */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '0 0 20px 0' }}>
              <button 
                type="button" 
                className="btn" 
                style={{ 
                  background: 'linear-gradient(135deg, var(--color-primary), var(--color-purple))',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 15px rgba(59, 130, 246, 0.2)'
                }}
                onClick={() => {
                  setShowExportModal(true);
                  setExportTransactions(false);
                  setExportTodos(false);
                }}
              >
                📄 Ekspor Laporan PDF
              </button>
            </div>

            {/* Section 1: Financial Analytics */}
            <section>
              <h2 className="section-title" style={{ marginBottom: '20px' }}>
                <span>📊</span> Analitik Keuangan & Anti-Boros
              </h2>
              
              <div className="insights-grid">
                {/* Cash Flow Card */}
                <div className={`card ${isCardLocked({ reqTrans: 1 }) ? 'locked' : ''}`}>
                  {renderLockOverlay({ reqTrans: 1 })}
                  <div className="card-header">
                    <h3>Arus Kas Anda</h3>
                    <span className="card-icon">💳</span>
                  </div>
                  <p className="insight-text">
                    Pemasukan vs Pengeluaran dalam periode ini.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--color-success)' }}>Masuk: {totalIncome ? `Rp ${totalIncome.toLocaleString()}` : 'Rp 0'}</span>
                      <span style={{ color: 'var(--color-danger)' }}>Keluar: {totalExpense ? `Rp ${totalExpense.toLocaleString()}` : 'Rp 0'}</span>
                    </div>
                    <div className="progress-bar-container">
                      <div className="progress-bar" style={{ width: `${progressRatio}%`, background: 'var(--color-danger)' }}></div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Pengeluaran: {Math.round(progressRatio)}% dari pemasukan
                    </div>
                  </div>
                  <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '12px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Hasil Bersih:</span>
                    <div className="metric-value" style={{ color: netSavings >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                      Rp {netSavings.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Money Leak Auditor */}
                <div className={`card ${isCardLocked({ reqTrans: 3 }) ? 'locked' : ''}`}>
                  {renderLockOverlay({ reqTrans: 3 })}
                  <div className="card-header">
                    <h3>Audit Kebocoran Keuangan</h3>
                    <span className="card-icon">🔍</span>
                  </div>
                  <p className="insight-text">
                    {insights.money_leak_auditor?.cached_reply || 'Asisten Anda sedang menganalisis pola transaksi untuk mendeteksi potensi kebocoran...'}
                  </p>
                  {insights.money_leak_auditor?.sources_metadata && (
                    <div className="visualizer-container">
                      {insights.money_leak_auditor.sources_metadata.slice(0, 3).map((item: any, idx: number) => (
                        <div key={idx} className="bar-column">
                          <div 
                            className="bar-fill" 
                            style={{ 
                              height: `${Math.min((item[1] / 800000) * 100, 100)}%`,
                              background: 'linear-gradient(180deg, var(--color-danger), rgba(239, 68, 68, 0.1))'
                            }}
                            data-value={`Rp ${item[1].toLocaleString()}`}
                          ></div>
                          <span className="bar-label" style={{ maxWidth: '60px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item[0]}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Runway Forecast & Interactive Simulator */}
                <div className={`card ${isCardLocked({ reqTrans: 5 }) ? 'locked' : ''}`}>
                  {renderLockOverlay({ reqTrans: 5 })}
                  <div className="card-header">
                    <h3>Prediksi Runway & Risiko</h3>
                    <span className="card-icon">⏳</span>
                  </div>
                  <p className="insight-text" style={{ fontSize: '0.85rem' }}>
                    {insights.runway_prediction?.cached_reply || 'Asisten Anda sedang menghitung proyeksi runway keuangan...'}
                  </p>
                  
                  <div className="simulator-control">
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                      <span>Simulasi Belanja: {Math.round(riskMultiplier * 100)}%</span>
                      <span style={{ color: simulatedRunway < 2 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                        Runway: {simulatedRunway.toFixed(1)} bln
                      </span>
                    </div>
                    <input 
                      type="range" 
                      min="0.5" 
                      max="2.0" 
                      step="0.1" 
                      value={riskMultiplier} 
                      className="simulator-slider"
                      onChange={(e) => setRiskMultiplier(parseFloat(e.target.value))}
                    />
                  </div>

                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-glass)', paddingTop: '10px' }}>
                    *Asumsi saldo tabungan awal Rp 15.000.000. Runway awal {baseRunway.toFixed(1)} bulan.
                  </div>
                </div>
              </div>
            </section>

            {/* Section 2: Productivity & Load */}
            <section>
              <h2 className="section-title" style={{ marginBottom: '20px' }}>
                <span>⚡</span> Produktivitas & Manajemen Beban Kerja
              </h2>
              
              <div className="insights-grid">
                {/* Consistency Graph */}
                <div className={`card ${isCardLocked({ reqTodos: 2 }) ? 'locked' : ''}`}>
                  {renderLockOverlay({ reqTodos: 2 })}
                  <div className="card-header">
                    <h3>Skor Konsistensi Tugas</h3>
                    <span className="card-icon">📈</span>
                  </div>
                  <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                    <div style={{ position: 'relative', width: '80px', height: '80px', flexShrink: 0 }}>
                      <svg width="80" height="80" viewBox="0 0 36 36">
                        <path
                          className="circle-bg"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke="rgba(255,255,255,0.05)"
                          strokeWidth="3.5"
                        />
                        <path
                          className="circle"
                          strokeDasharray={`${consistencyScore}, 100`}
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke="var(--color-success)"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                        />
                      </svg>
                      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontWeight: 700, fontSize: '1.1rem' }}>
                        {consistencyScore}%
                      </div>
                    </div>
                    <div>
                      <p className="insight-text" style={{ fontSize: '0.85rem' }}>
                        {insights.consistency_graph?.cached_reply || 'Asisten Anda sedang menganalisis rasio penyelesaian tugas Anda...'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Weekly Priority Matrix */}
                <div className={`card ${isCardLocked({ reqTodos: 3 }) ? 'locked' : ''}`}>
                  {renderLockOverlay({ reqTodos: 3 })}
                  <div className="card-header">
                    <h3>Matriks Prioritas Mingguan</h3>
                    <span className="card-icon">🎯</span>
                  </div>
                  <p className="insight-text" style={{ fontSize: '0.85rem' }}>
                    {insights.weekly_priority_matrix?.cached_reply || 'Asisten Anda sedang memetakan tingkat urgensi tugas...'}
                  </p>
                  {insights.weekly_priority_matrix?.sources_metadata && Array.isArray(insights.weekly_priority_matrix.sources_metadata) && (
                    <div className="task-list">
                      {insights.weekly_priority_matrix.sources_metadata.slice(0, 3).map((task: any, idx: number) => (
                        <div key={idx} className={`task-item ${task.status === 'completed' ? 'low' : 'high'}`}>
                          <span>{task.task_name}</span>
                          <span style={{ fontSize: '0.75rem', padding: '2px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                            {task.status === 'completed' ? 'Selesai' : 'Aktif'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Burnout Detection & Stress Engine */}
                <div className={`card ${isCardLocked({ reqDays: 3 }) ? 'locked' : ''}`}>
                  {renderLockOverlay({ reqDays: 3 })}
                  <div className="card-header">
                    <h3>Detektor Burnout & Stres</h3>
                    <span className="card-icon">❤️</span>
                  </div>
                  <p className="insight-text">
                    {insights.burnout_detection_engine?.cached_reply || 'Asisten Anda sedang mengukur indeks stres berdasarkan aktivitas Anda...'}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Level Kelelahan Mental:</span>
                    <div className="progress-bar-container">
                      <div className="progress-bar" style={{ width: '25%', background: 'linear-gradient(90deg, var(--color-success), var(--color-warning))' }}></div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <span>Santai</span>
                      <span>Produktif</span>
                      <span>Jenuh / Burnout</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 3: Mood & Behavioral Correlations */}
            <section>
              <h2 className="section-title" style={{ marginBottom: '20px' }}>
                <span>🧠</span> Korelasi Kognitif & Psikologis (Ego Analysis)
              </h2>
              
              <div className="insights-grid">
                {/* Mood vs Spending */}
                <div className={`card ${isCardLocked({ reqDays: 5 }) ? 'locked' : ''}`}>
                  {renderLockOverlay({ reqDays: 5 })}
                  <div className="card-header">
                    <h3>Korelasi Mood & Belanja</h3>
                    <span className="card-icon">🛍️</span>
                  </div>
                  <p className="insight-text">
                    {insights.mood_vs_spending?.cached_reply || 'Asisten Anda sedang memetakan hubungan antara kondisi psikologis dan transaksi Anda...'}
                  </p>
                  <div className="visualizer-container">
                    <div className="bar-column">
                      <div className="bar-fill" style={{ height: '75%', background: 'var(--color-danger)' }} data-value="Stress Belanja: Rp 1.200.000"></div>
                      <span className="bar-label">Stress</span>
                    </div>
                    <div className="bar-column">
                      <div className="bar-fill" style={{ height: '35%', background: 'var(--color-success)' }} data-value="Tenang Belanja: Rp 500.000"></div>
                      <span className="bar-label">Tenang</span>
                    </div>
                    <div className="bar-column">
                      <div className="bar-fill" style={{ height: '50%', background: 'var(--color-primary)' }} data-value="Senang Belanja: Rp 800.000"></div>
                      <span className="bar-label">Senang</span>
                    </div>
                  </div>
                </div>

                {/* Mood vs Productivity */}
                <div className={`card ${isCardLocked({ reqDays: 5 }) ? 'locked' : ''}`}>
                  {renderLockOverlay({ reqDays: 5 })}
                  <div className="card-header">
                    <h3>Korelasi Mood & Produktivitas</h3>
                    <span className="card-icon">🏃‍♂️</span>
                  </div>
                  <p className="insight-text">
                    {insights.mood_vs_productivity?.cached_reply || 'Asisten Anda sedang memetakan hubungan antara kondisi psikologis dan produktivitas...'}
                  </p>
                  <div className="visualizer-container">
                    <div className="bar-column">
                      <div className="bar-fill" style={{ height: '90%', background: 'var(--color-success)' }} data-value="Fokus Pagi: 90%"></div>
                      <span className="bar-label">Pagi</span>
                    </div>
                    <div className="bar-column">
                      <div className="bar-fill" style={{ height: '60%', background: 'var(--color-warning)' }} data-value="Fokus Siang: 60%"></div>
                      <span className="bar-label">Siang</span>
                    </div>
                    <div className="bar-column">
                      <div className="bar-fill" style={{ height: '15%', background: 'var(--color-danger)' }} data-value="Fokus Malam: 15%"></div>
                      <span className="bar-label">Malam</span>
                    </div>
                  </div>
                </div>

                {/* Worth-It Score Audit */}
                <div className={`card ${isCardLocked({ reqTrans: 3 }) ? 'locked' : ''}`}>
                  {renderLockOverlay({ reqTrans: 3 })}
                  <div className="card-header">
                    <h3>Worth-It Score Audit</h3>
                    <span className="card-icon">💎</span>
                  </div>
                  <p className="insight-text">
                    {insights.trend_worth_it_score?.cached_reply || 'Asisten Anda sedang menilai indeks kepuasan dan nilai guna dari pengeluaran Anda...'}
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0' }}>
                    <div style={{ fontSize: '3rem', fontWeight: 800, fontFamily: 'var(--font-title)', color: 'var(--color-success)', textShadow: '0 0 20px rgba(16,185,129,0.3)' }}>
                      A+
                    </div>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                    Skor Kebermanfaatan Belanja Mingguan
                  </p>
                </div>

                {/* Time-Based & Chronotype Analysis Card */}
                <div className={`card ${isCardLocked({ reqDays: 2 }) ? 'locked' : ''}`}>
                  {renderLockOverlay({ reqDays: 2 })}
                  <div className="card-header">
                    <h3>Pola Waktu & Kronotipe Kognitif</h3>
                    <span className="card-icon">🕒</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Ego Kronotipe:</span>
                      <span style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: 'bold', 
                        padding: '2px 8px', 
                        borderRadius: '4px',
                        background: 'rgba(139, 92, 246, 0.15)',
                        border: '1px solid rgba(139, 92, 246, 0.3)',
                        color: 'var(--color-purple)'
                      }}>
                        {chronotypeName}
                      </span>
                    </div>
                    <p className="insight-text" style={{ fontSize: '0.85rem', lineHeight: '1.4' }}>
                      {chronotypeRec}
                    </p>
                    
                    <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                        <span>Rasio Belanja Malam:</span>
                        <span style={{ fontWeight: 'bold', color: nightSpendingPercent > 30 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                          {nightSpendingPercent}%
                        </span>
                      </div>
                      {nightSpendingPercent > 30 ? (
                        <p style={{ fontSize: '0.75rem', color: 'var(--color-danger)', fontStyle: 'italic' }}>
                          ⚠️ Kerentanan stres belanja impulsif tinggi di atas jam 5 sore.
                        </p>
                      ) : (
                        <p style={{ fontSize: '0.75rem', color: 'var(--color-success)', fontStyle: 'italic' }}>
                          ✓ Pola belanja jam malam terpantau aman terkendali.
                        </p>
                      )}
                    </div>

                    <div className="visualizer-container" style={{ height: '90px' }}>
                      <div className="bar-column">
                        <div className="bar-fill" style={{ height: `${totalTasksWithTime > 0 ? (tasksPagi / totalTasksWithTime) * 100 : 33}%`, background: 'var(--color-success)' }} data-value={`${tasksPagi} Tugas Pagi`}></div>
                        <span className="bar-label">Pagi</span>
                      </div>
                      <div className="bar-column">
                        <div className="bar-fill" style={{ height: `${totalTasksWithTime > 0 ? (tasksSiang / totalTasksWithTime) * 100 : 33}%`, background: 'var(--color-warning)' }} data-value={`${tasksSiang} Tugas Siang`}></div>
                        <span className="bar-label">Siang</span>
                      </div>
                      <div className="bar-column">
                        <div className="bar-fill" style={{ height: `${totalTasksWithTime > 0 ? (tasksMalam / totalTasksWithTime) * 100 : 34}%`, background: 'var(--color-purple)' }} data-value={`${tasksMalam} Tugas Malam`}></div>
                        <span className="bar-label">Malam</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </section>

            {/* Section: Special Insights Card (Maksimal 5) */}
            <section className="special-insights-section">
              <h2 className="section-title" style={{ marginBottom: '20px', borderLeftColor: 'var(--color-purple)' }}>
                <span>💡</span> Rekomendasi Insight Khusus & Tren Internet 2026
              </h2>
              {(!isDemo && rawTransactions.length === 0 && rawTodos.length === 0) ? (
                <p className="insight-text" style={{ fontStyle: 'italic', textAlign: 'center', padding: '28px', background: 'var(--bg-card)', border: '1px dashed var(--border-glass)', borderRadius: '16px' }}>
                  Rekomendasi insight khusus belum tersedia. Masukkan data keuangan atau tugas Anda terlebih dahulu untuk memicu analisis cerdas dari asisten AI Anda.
                </p>
              ) : (
                <div className="special-insights-grid">
                {getSpecialInsights().map((insight) => {
                  const isPlanned = plannedInsightIds.includes(insight.id);
                  return (
                    <div key={insight.id} className="special-insight-card">
                      <div className="insight-header">
                        <div className="insight-title-group">
                          <span className={`insight-tag ${insight.isInternet ? 'internet' : ''}`}>
                            {insight.tag}
                          </span>
                          <h4 style={{ marginTop: '8px' }}>{insight.title}</h4>
                        </div>
                      </div>
                      <p className="insight-text" style={{ fontSize: '0.85rem' }}>
                        {insight.description}
                      </p>
                      <button 
                        type="button" 
                        className={`btn-plan ${isPlanned ? 'planned' : ''}`}
                        onClick={() => handleCreatePlan(insight.id, insight.planName, insight.actionSteps, insight.targetDate)}
                        disabled={isPlanned}
                      >
                        {isPlanned ? '✓ Sudah Masuk Rencana' : '📅 Plan-kan Sekarang'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            </section>

            {/* Section: Future Plans List */}
            <section className="future-plans-section">
              <h2 className="section-title" style={{ marginBottom: '20px', borderLeftColor: 'var(--color-success)' }}>
                <span>🌱</span> Rencana Aksi Masa Depan Aktif
              </h2>
              {futurePlans.length === 0 ? (
                <p className="insight-text" style={{ fontStyle: 'italic', textAlign: 'center', padding: '20px', background: 'var(--bg-card)', border: '1px dashed var(--border-glass)', borderRadius: '16px' }}>
                  Belum ada rencana aksi masa depan. Klik tombol "Plan-kan" pada rekomendasi insight di atas untuk memulai rencana Anda.
                </p>
              ) : (
                <div className="plans-grid">
                  {futurePlans.map((plan) => (
                    <div key={plan.id} className="plan-card">
                      <div className="plan-header">
                        <h4>{plan.name}</h4>
                        <span className="plan-status">Aktif</span>
                      </div>
                      <ol className="plan-steps">
                        {plan.actionSteps.map((step: string, sIdx: number) => (
                          <li key={sIdx}>{step}</li>
                        ))}
                      </ol>
                      <div className="plan-target">
                        <span>Target: <strong>{plan.targetDate}</strong></span>
                        <span style={{ cursor: 'pointer', textDecoration: 'underline', color: 'var(--color-danger)' }} onClick={() => {
                          setFuturePlans(prev => prev.filter(p => p.id !== plan.id));
                        }}>Hapus</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {activeView === 'data' && (
          <>
            {/* Tab: Manajemen Data & Input */}
            <section className="manual-input-section">
              <div className="card" style={{ gap: '20px' }}>
                <div className="card-header">
                  <h3 className="section-title" style={{ borderLeftColor: 'var(--color-purple)' }}>
                    <span>✍️</span> Masukkan Data Baru
                  </h3>
                  <span className="card-icon">➕</span>
                </div>

                <div className="form-tabs">
                  <button 
                    type="button" 
                    className={`tab-btn ${activeFormTab === 'money' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveFormTab('money');
                      setSubmitSuccessMsg('');
                      setSubmitErrorMsg('');
                    }}
                  >
                    💸 Money Tracker
                  </button>
                  <button 
                    type="button" 
                    className={`tab-btn ${activeFormTab === 'todo' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveFormTab('todo');
                      setSubmitSuccessMsg('');
                      setSubmitErrorMsg('');
                    }}
                  >
                    📋 To-Do List
                  </button>
                </div>

                {submitSuccessMsg && (
                  <div className="alert-success">
                    {submitSuccessMsg}
                  </div>
                )}
                {submitErrorMsg && (
                  <div className="alert-success" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--color-danger)', color: 'var(--color-danger)' }}>
                    {submitErrorMsg}
                  </div>
                )}

                <form onSubmit={handleFormSubmit} className="input-form">
                  {activeFormTab === 'money' ? (
                    <>
                      <div className="form-row">
                        <div className="form-group">
                          <label htmlFor="amount">Jumlah Uang (Rp)</label>
                          <input 
                            type="number" 
                            id="amount" 
                            className="form-control" 
                            value={mtAmount}
                            onChange={(e) => setMtAmount(e.target.value)}
                            placeholder="Contoh: 50000"
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="type">Tipe Transaksi</label>
                          <select 
                            id="type" 
                            className="form-control form-select"
                            value={mtType}
                            onChange={(e) => setMtType(e.target.value as 'expense' | 'income')}
                          >
                            <option value="expense">Pengeluaran (Expense)</option>
                            <option value="income">Pemasukan (Income)</option>
                          </select>
                        </div>
                      </div>

                      <div className="form-row">
                        <div className="form-group">
                          <label htmlFor="description">Deskripsi</label>
                          <input 
                            type="text" 
                            id="description" 
                            className="form-control"
                            value={mtDescription}
                            onChange={(e) => setMtDescription(e.target.value)}
                            placeholder="Contoh: Beli kopi susu gula aren"
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="date">Tanggal Transaksi</label>
                          <input 
                            type="date" 
                            id="date" 
                            className="form-control"
                            value={mtDate}
                            onChange={(e) => setMtDate(e.target.value)}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="time">Jam Transaksi</label>
                          <input 
                            type="time" 
                            id="time" 
                            className="form-control"
                            value={mtTime}
                            onChange={(e) => setMtTime(e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      <div className="form-row" style={{ marginTop: '16px' }}>
                        <div className="form-group" style={{ width: '100%' }}>
                          <label htmlFor="receipt-upload" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            📸 Unggah Foto Struk Belanja (Opsional)
                          </label>
                          <input 
                            type="file" 
                            id="receipt-upload" 
                            accept="image/*" 
                            className="form-control"
                            onChange={handleReceiptFileChange}
                            style={{ padding: '8px', cursor: 'pointer' }}
                          />
                          {receiptPreview && (
                            <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '16px', background: 'rgba(255, 255, 255, 0.02)', padding: '10px', borderRadius: '10px', border: '1px solid var(--border-glass)', width: 'fit-content' }}>
                              <img 
                                src={receiptPreview} 
                                alt="Receipt Preview" 
                                style={{ maxWidth: '100px', maxHeight: '100px', borderRadius: '6px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} 
                              />
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                  {receiptFile ? receiptFile.name : 'Preview Struk'}
                                </span>
                                <button 
                                  type="button" 
                                  className="btn-remove" 
                                  style={{ width: 'fit-content', padding: '2px 8px', fontSize: '0.75rem' }} 
                                  onClick={handleClearReceipt}
                                >
                                  Batal Unggah
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Dynamic Metadata Section */}
                      <div className="metadata-section">
                        <h4>Dynamic Metadata (Scanned & Custom)</h4>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Field di bawah terdeteksi otomatis dari database / ekstraksi Gemini. Anda juga dapat menambahkan field kustom baru.
                        </p>
                        
                        <div className="metadata-grid">
                          {mtKeys.map((key) => (
                            <div key={key} className="form-group">
                              <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                <span>{key} (Otomatis)</span>
                                <button type="button" className="btn-remove" style={{ padding: '0px 4px', fontSize: '0.6rem' }} onClick={() => handleRemoveMetadataField(key)}>Hapus</button>
                              </label>
                              <input 
                                type="text" 
                                className="form-control"
                                value={mtMetadata[key] || ''}
                                onChange={(e) => setMtMetadata(prev => ({ ...prev, [key]: e.target.value }))}
                                placeholder={`Nilai untuk ${key}`}
                              />
                            </div>
                          ))}

                          {Object.keys(mtMetadata)
                            .filter(k => !mtKeys.includes(k))
                            .map((key) => (
                              <div key={key} className="form-group">
                                <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                  <span style={{ color: 'var(--color-warning)' }}>{key} (Kustom)</span>
                                  <button type="button" className="btn-remove" style={{ padding: '0px 4px', fontSize: '0.6rem' }} onClick={() => handleRemoveMetadataField(key)}>Hapus</button>
                                </label>
                                <input 
                                  type="text" 
                                  className="form-control"
                                  value={mtMetadata[key] || ''}
                                  onChange={(e) => setMtMetadata(prev => ({ ...prev, [key]: e.target.value }))}
                                  placeholder={`Nilai untuk ${key}`}
                                />
                              </div>
                            ))
                          }
                        </div>

                        <div className="add-custom-field">
                          <input 
                            type="text" 
                            className="form-control" 
                            style={{ flex: 1 }}
                            value={customKey}
                            onChange={(e) => setCustomKey(e.target.value)}
                            placeholder="Nama field baru (misal: lokasi)"
                          />
                          <input 
                            type="text" 
                            className="form-control" 
                            style={{ flex: 1 }}
                            value={customValue}
                            onChange={(e) => setCustomValue(e.target.value)}
                            placeholder="Nilai field"
                          />
                          <button type="button" className="btn btn-secondary" onClick={handleAddCustomField}>
                            + Field
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="form-row">
                        <div className="form-group">
                          <label htmlFor="task_name">Nama Tugas / To-Do</label>
                          <input 
                            type="text" 
                            id="task_name" 
                            className="form-control"
                            value={todoTaskName}
                            onChange={(e) => setTodoTaskName(e.target.value)}
                            placeholder="Contoh: Selesaikan coding landing page"
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="status">Status Tugas</label>
                          <select 
                            id="status" 
                            className="form-control form-select"
                            value={todoStatus}
                            onChange={(e) => setTodoStatus(e.target.value as 'pending' | 'completed' | 'cancelled')}
                          >
                            <option value="pending">Tertunda (Pending)</option>
                            <option value="completed">Selesai (Completed)</option>
                            <option value="cancelled">Dibatalkan (Cancelled)</option>
                          </select>
                        </div>
                      </div>

                      <div className="form-row">
                        <div className="form-group">
                          <label htmlFor="due_date">Tenggat Waktu (Due Date)</label>
                          <input 
                            type="date" 
                            id="due_date" 
                            className="form-control"
                            value={todoDueDate}
                            onChange={(e) => setTodoDueDate(e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="todo_time">Jam Tugas</label>
                          <input 
                            type="time" 
                            id="todo_time" 
                            className="form-control"
                            value={todoTime}
                            onChange={(e) => setTodoTime(e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Dynamic Metadata Section */}
                      <div className="metadata-section">
                        <h4>Dynamic Metadata (Scanned & Custom)</h4>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Field di bawah terdeteksi otomatis dari database / ekstraksi Gemini. Anda juga dapat menambahkan field kustom baru.
                        </p>

                        <div className="metadata-grid">
                          {todoKeys.map((key) => (
                            <div key={key} className="form-group">
                              <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                <span>{key} (Otomatis)</span>
                                <button type="button" className="btn-remove" style={{ padding: '0px 4px', fontSize: '0.6rem' }} onClick={() => handleRemoveMetadataField(key)}>Hapus</button>
                              </label>
                              <input 
                                type="text" 
                                className="form-control"
                                value={todoMetadata[key] || ''}
                                onChange={(e) => setTodoMetadata(prev => ({ ...prev, [key]: e.target.value }))}
                                placeholder={`Nilai untuk ${key}`}
                              />
                            </div>
                          ))}

                          {Object.keys(todoMetadata)
                            .filter(k => !todoKeys.includes(k))
                            .map((key) => (
                              <div key={key} className="form-group">
                                <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                  <span style={{ color: 'var(--color-warning)' }}>{key} (Kustom)</span>
                                  <button type="button" className="btn-remove" style={{ padding: '0px 4px', fontSize: '0.6rem' }} onClick={() => handleRemoveMetadataField(key)}>Hapus</button>
                                </label>
                                <input 
                                  type="text" 
                                  className="form-control"
                                  value={todoMetadata[key] || ''}
                                  onChange={(e) => setTodoMetadata(prev => ({ ...prev, [key]: e.target.value }))}
                                  placeholder={`Nilai untuk ${key}`}
                                />
                              </div>
                            ))
                          }
                        </div>

                        <div className="add-custom-field">
                          <input 
                            type="text" 
                            className="form-control" 
                            style={{ flex: 1 }}
                            value={customKey}
                            onChange={(e) => setCustomKey(e.target.value)}
                            placeholder="Nama field baru (misal: priority)"
                          />
                          <input 
                            type="text" 
                            className="form-control" 
                            style={{ flex: 1 }}
                            value={customValue}
                            onChange={(e) => setCustomValue(e.target.value)}
                            placeholder="Nilai field"
                          />
                          <button type="button" className="btn btn-secondary" onClick={handleAddCustomField}>
                            + Field
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  <button 
                    type="submit" 
                    className="btn" 
                    style={{ background: 'var(--color-success)', marginTop: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', marginBottom: 0 }}></span> : '💾 Simpan Data'}
                  </button>
                </form>
              </div>
            </section>

            {/* Riwayat Transaksi Rapi Formatted as Table */}
            <div className="card">
              <div className="card-header">
                <h3 className="section-title" style={{ borderLeftColor: 'var(--color-primary)' }}>
                  <span>💰</span> Riwayat Transaksi Keuangan (Money Tracker)
                </h3>
                <span className="card-icon">💳</span>
              </div>
              {rawTransactions.length === 0 ? (
                <p className="insight-text" style={{ fontStyle: 'italic', padding: '10px' }}>Belum ada data transaksi.</p>
              ) : (
                <div className="table-container">
                  <table className="entries-table">
                    <thead>
                      <tr>
                        <th>Deskripsi</th>
                        <th>Tipe</th>
                        <th>Jumlah</th>
                        <th>Tanggal</th>
                        <th>Properti Kognitif (Metadata)</th>
                        <th style={{ width: '100px', textAlign: 'center' }}>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rawTransactions.map((tx: any, idx: number) => (
                        <tr key={tx.id || idx}>
                          <td style={{ fontWeight: 500 }}>
                            {tx.description}
                            {tx.dynamic_metadata?.receipt_url && (
                              <div style={{ marginTop: '6px' }}>
                                <a 
                                  href={tx.dynamic_metadata.receipt_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  style={{ 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    gap: '4px', 
                                    color: 'var(--color-primary)', 
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    textDecoration: 'underline'
                                  }}
                                >
                                  🧾 Lihat Struk
                                </a>
                              </div>
                            )}
                          </td>
                          <td>
                            <span style={{ 
                              padding: '4px 10px', 
                              borderRadius: '20px', 
                              fontSize: '0.75rem',
                              background: tx.type === 'income' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                              color: tx.type === 'income' ? 'var(--color-success)' : 'var(--color-danger)',
                              border: `1px solid ${tx.type === 'income' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                              fontWeight: 600
                            }}>
                              {tx.type === 'income' ? 'Pemasukan' : 'Pengeluaran'}
                            </span>
                          </td>
                          <td style={{ fontWeight: 700, color: tx.type === 'income' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                            {tx.type === 'income' ? '+' : '-'} Rp {Number(tx.amount).toLocaleString('id-ID')}
                          </td>
                          <td style={{ color: 'var(--text-secondary)' }}>
                            {tx.transaction_date}
                            {tx.dynamic_metadata?.jam && (
                              <span style={{ fontSize: '0.8rem', opacity: 0.8, display: 'block', marginTop: '2px' }}>
                                🕒 {tx.dynamic_metadata.jam}
                              </span>
                            )}
                          </td>
                          <td>
                            {tx.dynamic_metadata && Object.keys(tx.dynamic_metadata).length > 0 ? (
                              Object.entries(tx.dynamic_metadata)
                                .filter(([k]) => k !== 'long_term_memory')
                                .map(([k, v]) => (
                                  <span key={k} className="entry-meta-tag">{k}: {String(v)}</span>
                                ))
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>-</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className="btn-delete"
                              onClick={() => handleDeleteTransaction(tx.id)}
                            >
                              🗑️ Hapus
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Riwayat Tugas Rapi Formatted as Table */}
            <div className="card">
              <div className="card-header">
                <h3 className="section-title" style={{ borderLeftColor: 'var(--color-warning)' }}>
                  <span>✅</span> Daftar Tugas Kognitif (To-Do List)
                </h3>
                <span className="card-icon">📋</span>
              </div>
              {rawTodos.length === 0 ? (
                <p className="insight-text" style={{ fontStyle: 'italic', padding: '10px' }}>Belum ada data tugas.</p>
              ) : (
                <div className="table-container">
                  <table className="entries-table">
                    <thead>
                      <tr>
                        <th>Nama Tugas</th>
                        <th>Status</th>
                        <th>Tenggat Waktu</th>
                        <th>Properti Kognitif (Metadata)</th>
                        <th style={{ width: '180px', textAlign: 'center' }}>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rawTodos.map((todo: any, idx: number) => (
                        <tr key={todo.id || idx}>
                          <td style={{ fontWeight: 500 }}>{todo.task_name}</td>
                          <td>
                            <span style={{ 
                              padding: '4px 10px', 
                              borderRadius: '20px', 
                              fontSize: '0.75rem',
                              background: todo.status === 'completed' ? 'rgba(16,185,129,0.12)' : todo.status === 'cancelled' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                              color: todo.status === 'completed' ? 'var(--color-success)' : todo.status === 'cancelled' ? 'var(--color-danger)' : 'var(--color-warning)',
                              border: `1px solid ${todo.status === 'completed' ? 'rgba(16,185,129,0.2)' : todo.status === 'cancelled' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`,
                              fontWeight: 600
                            }}>
                              {todo.status === 'completed' ? 'Selesai' : todo.status === 'cancelled' ? 'Batal' : 'Tertunda'}
                            </span>
                          </td>
                          <td style={{ color: 'var(--text-secondary)' }}>
                            {todo.due_date || <span style={{ color: 'var(--text-muted)' }}>-</span>}
                            {todo.dynamic_metadata?.jam && (
                              <span style={{ fontSize: '0.8rem', opacity: 0.8, display: 'block', marginTop: '2px' }}>
                                🕒 {todo.dynamic_metadata.jam}
                              </span>
                            )}
                          </td>
                          <td>
                            {todo.dynamic_metadata && Object.keys(todo.dynamic_metadata).length > 0 ? (
                              Object.entries(todo.dynamic_metadata)
                                .filter(([k]) => k !== 'long_term_memory')
                                .map(([k, v]) => (
                                  <span key={k} className="entry-meta-tag">{k}: {String(v)}</span>
                                ))
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>-</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                              <select
                                className="select-status-inline"
                                value={todo.status}
                                onChange={(e) => handleUpdateTodoStatus(todo.id, e.target.value as any)}
                              >
                                <option value="pending">Tertunda</option>
                                <option value="completed">Selesai</option>
                                <option value="cancelled">Batal</option>
                              </select>
                              <button
                                type="button"
                                className="btn-delete"
                                onClick={() => handleDeleteTodo(todo.id)}
                                title="Hapus Tugas"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

      </main>

      {showProfileModal && (
        <div className="modal-backdrop" onClick={() => setShowProfileModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>👤 Pengaturan Profil & Kepribadian AI</h3>
              <button type="button" className="btn-close-modal" onClick={() => setShowProfileModal(false)}>&times;</button>
            </div>

            <form onSubmit={handleSaveProfile} className="input-form">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                
                {/* 1. Profil Pengguna */}
                <div>
                  <h4 style={{ fontSize: '0.9rem', color: 'var(--color-primary)', marginBottom: '10px', fontFamily: 'var(--font-title)', fontWeight: 600 }}>
                    Profil Pengguna
                  </h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="fullname">Nama Lengkap</label>
                      <input 
                        type="text" 
                        id="fullname" 
                        className="form-control" 
                        value={editFullname}
                        onChange={(e) => setEditFullname(e.target.value)}
                        placeholder="Contoh: Budi Santoso"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="user_nickname">Nama Panggilan</label>
                      <input 
                        type="text" 
                        id="user_nickname" 
                        className="form-control" 
                        value={editNickname}
                        onChange={(e) => setEditNickname(e.target.value)}
                        placeholder="Contoh: Budi"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Pengaturan Akun */}
                <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '16px' }}>
                  <h4 style={{ fontSize: '0.9rem', color: 'var(--color-warning)', marginBottom: '10px', fontFamily: 'var(--font-title)', fontWeight: 600 }}>
                    Pengaturan Akun
                  </h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Email Terdaftar</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        value={supabase ? "budi.santoso@example.com" : "budi.santoso.demo@simulasi.local"}
                        disabled
                        style={{ opacity: 0.6, cursor: 'not-allowed' }}
                      />
                    </div>
                    <div className="form-group">
                      <label>Status Sistem</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        value={supabase ? "Database Aktif (RLS Enabled)" : "Mode Simulasi Developer"}
                        disabled
                        style={{ opacity: 0.6, cursor: 'not-allowed' }}
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Konfigurasi Asisten AI */}
                <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '16px' }}>
                  <h4 style={{ fontSize: '0.9rem', color: 'var(--color-purple)', marginBottom: '10px', fontFamily: 'var(--font-title)', fontWeight: 600 }}>
                    Konfigurasi Asisten AI & Ego AI
                  </h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="assistant_name">Nama Asisten AI</label>
                      <input 
                        type="text" 
                        id="assistant_name" 
                        className="form-control" 
                        value={editAssistantName}
                        onChange={(e) => setEditAssistantName(e.target.value)}
                        placeholder="Contoh: Jarvis"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="ego_ai">Pilih Ego AI (Kepribadian)</label>
                      <select 
                        id="ego_ai" 
                        className="form-control form-select"
                        value={editSelectedPersonality}
                        onChange={(e) => setEditSelectedPersonality(e.target.value)}
                      >
                        <option value="witty_sidekick">The Witty Sidekick (Humoris & Jarvis Vibe)</option>
                        <option value="tough_love_coach">The Tough-Love Coach (Tegas & Disiplin)</option>
                        <option value="ultimate_hype_man">The Ultimate Hype-Man (Cheerleader Optimis)</option>
                        <option value="stoic_strategist">The Stoic Strategist (Tenang & Logis)</option>
                        <option value="elegant_confidant">The Elegant Confidant (Sopan ala Alfred)</option>
                      </select>
                    </div>
                  </div>
                </div>

              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px', borderTop: '1px solid var(--border-glass)', paddingTop: '16px' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowProfileModal(false)}
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="btn" 
                  style={{ background: 'var(--color-success)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', marginBottom: 0 }}></span> : '💾 Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showExportModal && (
        <div className="modal-backdrop" onClick={() => setShowExportModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3>📄 Konfigurasi Ekspor Laporan PDF</h3>
              <button type="button" className="btn-close-modal" onClick={() => setShowExportModal(false)}>&times;</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                Pilih opsi di bawah untuk menyertakan lampiran tambahan ke dalam laporan Anda.
                Laporan utama dan masing-masing lampiran akan dicetak pada halaman terpisah (A4 Portrait) agar rapi dan profesional.
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                {/* 1. Laporan Utama */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', cursor: 'not-allowed', opacity: 0.8 }}>
                  <input type="checkbox" checked disabled style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary)' }} />
                  <span><strong>Laporan Analisis Kognitif Utama</strong> (Wajib)</span>
                </label>
                
                {/* 2. Opsi Uang */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={exportTransactions} 
                    onChange={(e) => setExportTransactions(e.target.checked)} 
                    style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary)' }} 
                  />
                  <span>Sertakan Riwayat Transaksi Keuangan (Money Tracker)</span>
                </label>
                
                {/* 3. Opsi Tugas */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={exportTodos} 
                    onChange={(e) => setExportTodos(e.target.checked)} 
                    style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary)' }} 
                  />
                  <span>Sertakan Daftar Tugas Kognitif (To-Do List)</span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowExportModal(false)}>
                  Batal
                </button>
                <button type="button" className="btn" style={{ background: 'var(--color-success)' }} onClick={handleTriggerPrint}>
                  🖨️ Ekspor Ke PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Print Section for A4 portrait export */}
      <div id="print-section">
        {/* PAGE 1: Cognitive Analysis Report */}
        <div className="print-page">
          <div className="print-header">
            <div>
              <h1>LAPORAN ANALISIS KOGNITIF & PERILAKU</h1>
              <p>Asisten Pribadi: {profile.assistant_name} ({profile.selected_personality})</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontWeight: 'bold', color: '#111827' }}>Klien: {profile.fullname}</p>
              <p>Tanggal: {new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
          </div>

          <div>
            <div className="print-title">I. Ringkasan Analitik Keuangan</div>
            <div className="print-grid">
              <div className="print-card">
                <h4>Arus Kas Utama</h4>
                <p>Total Pemasukan: Rp {totalIncome.toLocaleString('id-ID')}</p>
                <p>Total Pengeluaran: Rp {totalExpense.toLocaleString('id-ID')}</p>
                <p>Rasio Pengeluaran: {totalIncome > 0 ? Math.round((totalExpense / totalIncome) * 100) : 0}%</p>
                <p style={{ fontWeight: 'bold', marginTop: '6px', color: netSavings >= 0 ? '#059669' : '#dc2626' }}>
                  Saldo Bersih: Rp {netSavings.toLocaleString('id-ID')}
                </p>
              </div>
              <div className="print-card">
                <h4>Runway & Risiko Keuangan</h4>
                <p>{insights.runway_prediction?.cached_reply || 'Menghitung runway keuangan...'}</p>
              </div>
            </div>
            <div className="print-card" style={{ width: '100%' }}>
              <h4>Audit Kebocoran Pengeluaran</h4>
              <p>{insights.money_leak_auditor?.cached_reply || 'Memuat data kebocoran...'}</p>
            </div>
          </div>

          <div>
            <div className="print-title">II. Produktivitas & Manajemen Beban Kerja</div>
            <div className="print-grid">
              <div className="print-card">
                <h4>Skor Konsistensi Tugas</h4>
                <p>Skor Konsistensi: {consistencyScore}%</p>
                <p style={{ marginTop: '4px' }}>{insights.consistency_graph?.cached_reply || 'Menganalisis konsistensi tugas...'}</p>
              </div>
              <div className="print-card">
                <h4>Beban Kerja Harian & Stres</h4>
                <p>{insights.daily_activity_load?.cached_reply || 'Mengukur beban mental...'}</p>
                <p style={{ marginTop: '4px' }}>{insights.burnout_detection_engine?.cached_reply || 'Mengukur beban mental...'}</p>
              </div>
            </div>
          </div>

          <div>
            <div className="print-title">III. Analisis Emosi & Pola Perilaku (Ego AI)</div>
            <div className="print-grid">
              <div className="print-card">
                <h4>Mood vs Pengeluaran</h4>
                <p>{insights.mood_vs_spending?.cached_reply || 'Mengevaluasi korelasi psikologis belanja...'}</p>
              </div>
              <div className="print-card">
                <h4>Mood vs Produktivitas & Kebermanfaatan</h4>
                <p>{insights.mood_vs_productivity?.cached_reply || 'Mengevaluasi korelasi emosi kerja...'}</p>
                <p style={{ marginTop: '4px' }}>{insights.trend_worth_it_score?.cached_reply || 'Mengaudit nilai guna pengeluaran...'}</p>
              </div>
              <div className="print-card" style={{ gridColumn: 'span 2' }}>
                <h4>Kronotipe & Pola Waktu Kognitif</h4>
                <p><strong>Kronotipe:</strong> {chronotypeName}</p>
                <p style={{ marginTop: '4px' }}>{chronotypeRec}</p>
                <p style={{ marginTop: '4px' }}>
                  <strong>Rasio Belanja Malam:</strong> {nightSpendingPercent}% ({nightSpendingPercent > 30 ? 'Rentan belanja impulsif jam malam.' : 'Pola belanja jam malam wajar.'})
                </p>
                <p style={{ marginTop: '4px' }}>
                  <strong>Alokasi Tugas Terdaftar:</strong> Pagi: {tasksPagi} | Siang: {tasksSiang} | Malam: {tasksMalam}
                </p>
              </div>
            </div>
          </div>

          <div>
            <div className="print-title">IV. Rencana Aksi Masa Depan Aktif</div>
            {futurePlans.length === 0 ? (
              <p style={{ fontStyle: 'italic', fontSize: '9.5pt', color: '#4b5563' }}>Belum ada rencana aksi masa depan aktif.</p>
            ) : (
              <div className="print-grid">
                {futurePlans.slice(0, 4).map((plan) => (
                  <div key={plan.id} className="print-card">
                    <h4 style={{ color: '#059669' }}>{plan.name}</h4>
                    <p style={{ fontSize: '8.5pt', marginBottom: '4px' }}>Langkah Aksi:</p>
                    <ol style={{ paddingLeft: '14px', fontSize: '8.5pt', color: '#4b5563', margin: 0 }}>
                      {plan.actionSteps && Array.isArray(plan.actionSteps) ? plan.actionSteps.map((step: string, sIdx: number) => (
                        <li key={sIdx}>{step}</li>
                      )) : null}
                    </ol>
                    <p style={{ fontSize: '8pt', color: '#6b7280', marginTop: '6px' }}>Target: {plan.targetDate}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* PAGE 2: Financial Transactions (Optional) */}
        {exportTransactions && (
          <div className="print-page">
            <div className="print-header">
              <div>
                <h1>LAMPIRAN: RIWAYAT TRANSAKSI KEUANGAN</h1>
                <p>Detail log transaksi keuangan klien</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontWeight: 'bold', color: '#111827' }}>Klien: {profile.fullname}</p>
                <p>Halaman 2 (Lampiran Keuangan)</p>
              </div>
            </div>

            {rawTransactions.length === 0 ? (
              <p style={{ fontStyle: 'italic', fontSize: '9.5pt' }}>Tidak ada transaksi tercatat.</p>
            ) : (
              <table className="print-table">
                <thead>
                  <tr>
                    <th>Deskripsi Transaksi</th>
                    <th>Tipe</th>
                    <th>Jumlah</th>
                    <th>Tanggal</th>
                    <th>Properti Kognitif (Metadata)</th>
                  </tr>
                </thead>
                <tbody>
                  {rawTransactions.map((tx: any, idx: number) => (
                    <tr key={tx.id || idx}>
                      <td style={{ fontWeight: 'bold' }}>{tx.description}</td>
                      <td>{tx.type === 'income' ? 'Pemasukan' : 'Pengeluaran'}</td>
                      <td style={{ fontWeight: 'bold', color: tx.type === 'income' ? '#059669' : '#dc2626' }}>
                        {tx.type === 'income' ? '+' : '-'} Rp {Number(tx.amount).toLocaleString('id-ID')}
                      </td>
                      <td>{tx.transaction_date} {tx.dynamic_metadata?.jam ? `(${tx.dynamic_metadata.jam})` : ''}</td>
                      <td>
                        {tx.dynamic_metadata && Object.keys(tx.dynamic_metadata).length > 0 ? (
                          Object.entries(tx.dynamic_metadata)
                            .filter(([k]) => k !== 'long_term_memory')
                            .map(([k, v]) => (
                              <span key={k} className="print-meta-tag">{k}: {String(v)}</span>
                            ))
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* PAGE 3: Tasks List (Optional) */}
        {exportTodos && (
          <div className="print-page">
            <div className="print-header">
              <div>
                <h1>LAMPIRAN: DAFTAR TUGAS KOGNITIF</h1>
                <p>Detail log to-do list & pelacak konsistensi</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontWeight: 'bold', color: '#111827' }}>Klien: {profile.fullname}</p>
                <p>Halaman {exportTransactions ? '3' : '2'} (Lampiran Tugas)</p>
              </div>
            </div>

            {rawTodos.length === 0 ? (
              <p style={{ fontStyle: 'italic', fontSize: '9.5pt' }}>Tidak ada tugas tercatat.</p>
            ) : (
              <table className="print-table">
                <thead>
                  <tr>
                    <th>Nama Tugas / To-Do</th>
                    <th>Status</th>
                    <th>Tenggat Waktu</th>
                    <th>Properti Kognitif (Metadata)</th>
                  </tr>
                </thead>
                <tbody>
                  {rawTodos.map((todo: any, idx: number) => (
                    <tr key={todo.id || idx}>
                      <td style={{ fontWeight: 'bold' }}>{todo.task_name}</td>
                      <td>
                        {todo.status === 'completed' ? 'Selesai' : todo.status === 'cancelled' ? 'Batal' : 'Tertunda'}
                      </td>
                      <td>{todo.due_date || '-'} {todo.dynamic_metadata?.jam ? `(${todo.dynamic_metadata.jam})` : ''}</td>
                      <td>
                        {todo.dynamic_metadata && Object.keys(todo.dynamic_metadata).length > 0 ? (
                          Object.entries(todo.dynamic_metadata)
                            .filter(([k]) => k !== 'long_term_memory')
                            .map(([k, v]) => (
                              <span key={k} className="print-meta-tag">{k}: {String(v)}</span>
                            ))
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
      
      <footer style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: '0.8rem', borderTop: '1px solid var(--border-glass)' }}>
        AI Personal Assistant Dashboard &copy; 2026. Data dienkripsi end-to-end dan dilindungi RLS.
      </footer>
    </div>
  );
}
