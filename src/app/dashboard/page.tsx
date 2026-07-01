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
  const [activeDataTab, setActiveDataTab] = useState<'transactions' | 'todos'>('transactions');
  const [currentTxPage, setCurrentTxPage] = useState(1);
  const [currentTodoPage, setCurrentTodoPage] = useState(1);
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

  // Demo Mode State - Reactive for proper card locking
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Sorting & Filter States for Transactions Table
  const [txSortField, setTxSortField] = useState<'created_at' | 'amount' | 'description'>('created_at');
  const [txSortOrder, setTxSortOrder] = useState<'asc' | 'desc'>('desc');
  const [txFilterType, setTxFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [txSearchQuery, setTxSearchQuery] = useState('');

  // Sorting & Filter States for Todos Table
  const [todoSortField, setTodoSortField] = useState<'created_at' | 'due_date' | 'task_name'>('created_at');
  const [todoSortOrder, setTodoSortOrder] = useState<'asc' | 'desc'>('desc');
  const [todoFilterStatus, setTodoFilterStatus] = useState<'all' | 'pending' | 'completed' | 'cancelled'>('all');
  const [todoSearchQuery, setTodoSearchQuery] = useState('');

  // Refresh insights state with countdown
  const [insightsRefreshCountdown, setInsightsRefreshCountdown] = useState(3600); // 1 hour in seconds
  const [insightsVersion, setInsightsVersion] = useState(0); // Increment to force re-render

  // Countdown timer for insights refresh
  useEffect(() => {
    const timer = setInterval(() => {
      setInsightsRefreshCountdown(prev => {
        if (prev <= 1) {
          // Reset to 1 hour when countdown reaches 0
          return 3600;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format countdown to MM:SS
  const formatCountdown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

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

  // Helper function to parse hour from jam metadata
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

    // ========== NEW: Time-based calculations for additional insights ==========
    // Group transactions by time periods (Pagi: 05-12, Siang: 12-17, Malam: 17-05)
    let spendPagi = 0;
    let spendSiang = 0;
    let spendMalam = 0;
    let totalExpensesForTime = 0;

    txs.filter(t => t.type === 'expense').forEach(t => {
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

    todos.forEach(todo => {
      const hr = parseHour(todo);
      if (hr === -1) return;
      if (hr >= 5 && hr < 12) tasksPagi++;
      else if (hr >= 12 && hr < 17) tasksSiang++;
      else tasksMalam++;
    });

    const totalTasksWithTime = tasksPagi + tasksSiang + tasksMalam;

    // 6. Runway Prediction
    const savingsBalance = 15000000; // Asumsi saldo tabungan darurat
    const monthlyExpense = totalExpense > 0 ? totalExpense : 500000;
    const runwayMonths = monthlyExpense > 0 ? (savingsBalance / monthlyExpense) : 12;
    const runwayReply = `Dengan saldo tabungan tabungan Rp ${savingsBalance.toLocaleString('id-ID')} dan pengeluaran rata-rata Rp ${monthlyExpense.toLocaleString('id-ID')}, dana darurat Anda bertahan selama ${runwayMonths.toFixed(1)} bulan jika terjadi kehilangan pendapatan. ${runwayMonths < 3 ? '⚠️ Peringatan: Dana darurat sangat tipis, segera tingkatkan tabungan!' : runwayMonths < 6 ? 'Dana darurat perlu ditingkatkan.' : 'Dana darurat Anda dalam kondisi aman.'}`;

    // 7. Financial Risk Simulator
    const financialRiskLevel = runwayMonths < 3 ? 'Tinggi' : runwayMonths < 6 ? 'Sedang' : 'Rendah';
    const riskDesc = runwayMonths < 3 ? 'Anda memiliki risiko keuangan tinggi. Segera buat dana darurat minimal 6 bulan pengeluaran.' : runwayMonths < 6 ? 'Tingkat risiko keuangan sedang. Perbaiki kebiasaan belanja dan tingkatkan tabungan.' : 'Anda memiliki kebiasaan keuangan yang sehat dan risiko rendah.';
    const riskSimReply = `Tingkat risiko keuangan Anda dinilai ${financialRiskLevel}. ${riskDesc}`;

    // 8. Burnout Detection Engine
    const burnoutLevel = pendingCount > 10 ? 'Tinggi' : pendingCount > 5 ? 'Sedang' : 'Rendah';
    const burnoutPercent = Math.min(100, pendingCount * 8 + 10);
    const burnoutReply = `Mesin Deteksi Kejenuhan menunjukkan tingkat stres Anda pada level ${burnoutLevel} (~${burnoutPercent}%). ${pendingCount > 10 ? '⚠️ Beban kerja sangat tinggi! Pertimbangkan untuk mendelegasikan atau menunda tugas yang tidak urgent.' : pendingCount > 5 ? 'Beban kerja cukup banyak. Pastikan untuk mengambil waktu istirahat yang cukup.' : 'Jadwal Anda terdistribusi dengan baik. Pertahankan keseimbangan antara kerja dan istirahat.'}`;

    // 9. Mood vs Spending Correlation
    const nightSpendingLabel = nightSpendingPercent > 40 ? 'Sangat Tinggi' : nightSpendingPercent > 25 ? 'Tinggi' : 'Normal';
    const moodSpendReply = `Korelasi Mood & Pengeluaran: ${nightSpendingPercent}% dari pengeluaran Anda terjadi setelah jam 5 sore (${nightSpendingLabel}). ${nightSpendingPercent > 25 ? '⚠️ Terdeteksi kecenderungan stress-spending di malam hari. Pertimbangkan untuk menunda keputusan belanja hingga esok hari.' : 'Pola belanja Anda relatif seimbang sepanjang hari.'}`;

    // 10. Mood vs Productivity Correlation
    const morningProductivity = totalTasksWithTime > 0 ? Math.round((tasksPagi / totalTasksWithTime) * 100) : 33;
    const afternoonProductivity = Math.max(20, 100 - morningProductivity - 15);
    const eveningProductivity = Math.max(10, 100 - morningProductivity - afternoonProductivity);
    const peakTime = tasksPagi >= tasksSiang && tasksPagi >= tasksMalam ? 'pagi hari' : tasksMalam > tasksPagi ? 'malam hari' : 'siang hari';
    const moodProdReply = `Korelasi Mood & Produktivitas: Produktivitas Anda di pagi hari ~${morningProductivity}%, siang ~${afternoonProductivity}%, malam ~${eveningProductivity}%. ${tasksPagi >= tasksSiang && tasksPagi >= tasksMalam ? 'Anda bekerja sangat efektif di pagi hari - jadwalkan tugas berat di jam-jam ini.' : tasksMalam >= tasksPagi ? 'Anda lebih produktif dan kreatif di malam hari. Manfaatkan waktu ini untuk tugas yang membutuhkan fokus tinggi.' : 'Produktivitas Anda merata sepanjang hari.'}`;

    // 11. Worth-It Score Audit
    const worthItScore = totalIncome > 0 ? Math.max(0, Math.min(100, Math.round(((totalIncome - totalExpense) / totalIncome) * 100))) : 50;
    const worthItGrade = worthItScore >= 80 ? 'A+' : worthItScore >= 60 ? 'A' : worthItScore >= 40 ? 'B' : worthItScore >= 20 ? 'C' : 'D';
    const worthItDesc = worthItScore >= 80 ? 'Pengeluaran Anda sangat efisien dan bernilai!' : worthItScore >= 60 ? 'Kebiasaan keuangan Anda sehat.' : worthItScore >= 40 ? 'Perlu evaluasi pengeluaran yang lebih selektif.' : worthItScore >= 20 ? 'Tingkat tabungan sangat rendah. Perlu perubahan kebiasaan keuangan signifikan.' : 'Pengeluaran melebihi pemasukan. Segera buat anggaran ketat!';
    const worthItReply = `Worth-It Audit: ${worthItScore}% dari pengeluaran Anda tergolong investasi bernilai tinggi atau kebutuhan pokok. Grade: ${worthItGrade}. ${worthItDesc}`;

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
      },
      // NEW: Additional insights
      runway_prediction: {
        insight_type: 'runway_prediction',
        cached_reply: runwayReply,
        sources_metadata: { savingsBalance, monthlyExpense, runwayMonths }
      },
      financial_risk_simulator: {
        insight_type: 'financial_risk_simulator',
        cached_reply: riskSimReply,
        sources_metadata: { riskLevel: financialRiskLevel }
      },
      burnout_detection_engine: {
        insight_type: 'burnout_detection_engine',
        cached_reply: burnoutReply,
        sources_metadata: { burnoutLevel, burnoutPercent, pendingTasks: pendingCount }
      },
      mood_vs_spending: {
        insight_type: 'mood_vs_spending',
        cached_reply: moodSpendReply,
        sources_metadata: { nightSpendingPercent, spendPagi, spendSiang, spendMalam }
      },
      mood_vs_productivity: {
        insight_type: 'mood_vs_productivity',
        cached_reply: moodProdReply,
        sources_metadata: { tasksPagi, tasksSiang, tasksMalam, totalTasksWithTime }
      },
      trend_worth_it_score: {
        insight_type: 'trend_worth_it_score',
        cached_reply: worthItReply,
        sources_metadata: { worthItScore, worthItGrade, netSavings }
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
    } else {
      // If no cache, compute local insights immediately
      // Will be recomputed by server via trigger, but show data now
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

    // After fetching transactions and todos, compute local insights if cache was empty
    const txData = mtData || [];
    const todoDataList = todoData || [];
    if (txData.length > 0 || todoDataList.length > 0) {
      recomputeLocalInsights(txData, todoDataList);
    }

    // Trigger server recompute in background (this populates the cache)
    try {
      const gatewayKey = process.env.NEXT_PUBLIC_GATEWAY_KEY || 'jarvis-super-secret-key-2026';
      fetch('/api/internal/recompute-insight', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-jarvis-gateway-key': gatewayKey,
        },
        body: JSON.stringify({ record: { user_id: user.id } }),
      });
    } catch (recomputeErr) {
      console.warn('Background insight recompute failed:', recomputeErr);
    }

  useEffect(() => {
    // Check if we are in demo mode
    const isDemoModeToken = typeof window !== 'undefined' && localStorage.getItem('is_demo_mode') === 'true';
    if (isDemoModeToken) {
      setIsDemoMode(true);
      loadMockData();
      return;
    }
    setIsDemoMode(false);

    // Check if accessing from mobile app
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setIsFromMobile(params.get('from') === 'mobile');
    }

    const client = getSupabaseClient();
    setSupabase(client);

    if (!client) {
      console.warn('Supabase credentials not found. Defaulting to simulation mode.');
      setIsDemoMode(true);
      loadMockData();
      return;
    }

    // Safely check active session from client
    client.auth.getSession().then(async ({ data: { session } }: any) => {
      if (session) {
        setIsDemoMode(false); // Real authenticated user
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

  const handleDeletePlan = async (planId: string) => {
    // Find the plan first before filtering
    const planToDelete = futurePlans.find(p => p.id === planId);
    const updatedPlans = futurePlans.filter(p => p.id !== planId);
    setFuturePlans(updatedPlans);

    // Also unmark this insight from planned list
    const insightIdToRemove = planId;
    const insightGeneratedId = planToDelete ? `insight-${planToDelete.name?.toLowerCase().replace(/\s+/g, '-')}` : null;
    setPlannedInsightIds(prev => prev.filter(id => id !== insightIdToRemove && id !== insightGeneratedId));

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
        console.error('Failed to delete future plan from Supabase:', err);
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

  // Dynamic Special Insights - analyzes actual user data
  // insightsVersion is used as dependency to force re-computation on refresh
  const getSpecialInsights = () => {
    // Use insightsVersion to trigger re-computation
    void insightsVersion;

    const insights: Array<{
      id: string;
      title: string;
      tag: string;
      isInternet: boolean;
      description: string;
      planName: string;
      actionSteps: string[];
      targetDate: string;
    }> = [];

    // Calculate metrics from raw data
    const totalIncome = rawTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const totalExpense = rawTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const netSavings = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? ((netSavings / totalIncome) * 100) : 0;

    const pendingTodos = rawTodos.filter(t => t.status === 'pending');
    const completedTodos = rawTodos.filter(t => t.status === 'completed');
    const consistencyRate = rawTodos.length > 0
      ? Math.round((completedTodos.length / rawTodos.length) * 100)
      : 100;

    // Calculate time-based metrics
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

    let spendMalam = 0;
    let totalExpenseForTime = 0;
    rawTransactions.filter(t => t.type === 'expense').forEach(t => {
      const hr = parseHour(t);
      const amt = Number(t.amount || 0);
      if (hr !== -1 && hr >= 17) {
        spendMalam += amt;
        totalExpenseForTime += amt;
      } else if (hr !== -1) {
        totalExpenseForTime += amt;
      }
    });
    const nightSpendingPercent = totalExpenseForTime > 0
      ? Math.round((spendMalam / totalExpenseForTime) * 100)
      : 0;

    // Find largest expense
    const sortedExpenses = rawTransactions
      .filter(t => t.type === 'expense')
      .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
    const largestExpense = sortedExpenses[0];

    // Find highest category of spending
    const categorySpending: Record<string, number> = {};
    rawTransactions.filter(t => t.type === 'expense').forEach(t => {
      const kat = t.dynamic_metadata?.kategori || 'Lainnya';
      categorySpending[kat] = (categorySpending[kat] || 0) + Number(t.amount || 0);
    });
    const topCategory = Object.entries(categorySpending)
      .sort((a, b) => b[1] - a[1])[0];

    // 1. Largest Expense Analysis (only if we have transactions)
    if (largestExpense) {
      const largestPercent = totalExpense > 0 ? Math.round((Number(largestExpense.amount) / totalExpense) * 100) : 0;
      const isLargeExpense = largestPercent > 30;

      let urgencyLevel = 'normal';
      let nextStep = 'Pertahankan pengeluaran ini karena masih dalam batas wajar.';

      if (largestPercent > 50) {
        urgencyLevel = 'kritis';
        nextStep = `Pengeluaran ini 占 ${largestPercent}% dari total! Sangat direkomendasikan untuk evaluasi mendalam.`;
      } else if (largestPercent > 30) {
        urgencyLevel = 'perlu perhatian';
        nextStep = 'Sebaiknya buat anggaran khusus untuk kategori ini.';
      }

      insights.push({
        id: 'insight-largest-expense',
        title: `Pengeluaran Terbesar: ${largestExpense.description}`,
        tag: 'Keuangan',
        isInternet: false,
        description: `"${largestExpense.description}" = Rp ${Number(largestExpense.amount).toLocaleString('id-ID')} (${largestPercent}% dari total Rp ${totalExpense.toLocaleString('id-ID')}). Tanggal: ${largestExpense.transaction_date || 'tidak tercatat'}. Urgensi: ${urgencyLevel}. ${nextStep}`,
        planName: `Evaluasi: ${largestExpense.description}`,
        actionSteps: [
          `Apakah "${largestExpense.description}" kebutuhan pokok atau keinginan?`,
          isLargeExpense ? `Cari 2 alternatif yang lebih hemat` : 'Pertahankan jika ini kebutuhan penting',
          'Review pengeluaran ini di akhir bulan'
        ],
        targetDate: '1 minggu'
      });
    }

    // 2. Top Spending Category - Detailed Analysis
    if (topCategory) {
      const [category, amount] = topCategory;
      if (category !== 'Lainnya' && amount > 0) {
        const categoryPercent = totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0;
        const transactionCount = rawTransactions.filter(t =>
          t.type === 'expense' && (t.dynamic_metadata?.kategori === category)
        ).length;

        let analysis = '';
        let suggestion = '';

        if (categoryPercent > 50) {
          analysis = `Dominan banget! ${categoryPercent}% dari semua pengeluaran Anda hanya untuk ${category}.`;
          suggestion = 'Ini tergolong tidak seimbang. Sebaiknya buat limit khusus.';
        } else if (categoryPercent > 35) {
          analysis = `Cukup signifikan. ${categoryPercent}% dari pengeluaran untuk ${category} (rata-rata Rp ${Math.round(amount / Math.max(transactionCount, 1)).toLocaleString('id-ID')}/transaksi).`;
          suggestion = 'Kategorinya perlu diawasi agar tidak membengkak.';
        } else {
          analysis = `Normal. ${categoryPercent}% dari pengeluaran untuk ${category}.`;
          suggestion = 'Kategorinya masih dalam batas wajar.';
        }

        insights.push({
          id: 'insight-top-category',
          title: `Fokus: Kategori "${category}"`,
          tag: 'Pengeluaran',
          isInternet: false,
          description: `${analysis} Total: Rp ${amount.toLocaleString('id-ID')} dari ${transactionCount} transaksi. ${suggestion}`,
          planName: `Optimasi Pengeluaran ${category}`,
          actionSteps: [
            `Hitung budget bulanan untuk ${category}: Rp ${Math.round(amount / 1).toLocaleString('id-ID')}/bulan`,
            `Review setiap pengeluaran ${category} - apa yang bisa dikurangi?`,
            'Gunakan prinsip "ingin vs perlu" sebelum membeli'
          ],
          targetDate: 'Bulan ini'
        });
      }
    }

    // 3. Night Spending Warning - Data-Driven Analysis
    if (nightSpendingPercent > 0 && rawTransactions.length > 0) {
      const spendMalamAmount = rawTransactions.filter(t => {
        const hr = parseHour(t);
        return t.type === 'expense' && hr >= 17;
      }).reduce((sum, t) => sum + Number(t.amount || 0), 0);

      let warningLevel = 'rendah';
      let recommendation = 'Pola belanja Anda cukup merata sepanjang hari.';

      if (nightSpendingPercent > 40) {
        warningLevel = 'tinggi';
        recommendation = 'Sebagian besar pengeluaran terjadi di malam hari. Risiko belanja impulsif meningkat saat malam karena menurunnya kemampuan membuat keputusan rasional.';
      } else if (nightSpendingPercent > 25) {
        warningLevel = 'sedang';
        recommendation = 'Terdapat kecenderungan belanja di malam hari. Perhatikan apakah ini冲动购物 (belanja impulsif) atau kebutuhan sebenarnya.';
      }

      insights.push({
        id: 'insight-night-spending',
        title: nightSpendingPercent > 40 ? '⚠️ Belanja Malam Sangat Tinggi!' : nightSpendingPercent > 25 ? '⚠️ Perhatikan Pola Belanja Malam' : '📊 Analisis Pola Belanja Harian',
        tag: 'Perilaku',
        isInternet: false,
        description: `${nightSpendingPercent}% dari total pengeluaran Rp ${totalExpense.toLocaleString('id-ID')} (Rp ${spendMalamAmount.toLocaleString('id-ID')}) terjadi setelah jam 5 sore. Level risiko: ${warningLevel}. ${recommendation}`,
        planName: 'Optimalkan Waktu Belanja',
        actionSteps: [
          nightSpendingPercent > 25 ? 'Catat setiap pengeluaran malam selama 1 minggu untuk identifikasi pola' : 'Pertahankan pola belanja yang sudah baik',
          nightSpendingPercent > 25 ? 'Tunda keputusan belanja non-esensial sampai besok pagi' : 'Lanjutkan kebiasaan belanja yang bijak',
          'Identifikasi apakah belanja malam adalah kebutuhan atau impulse'
        ],
        targetDate: nightSpendingPercent > 25 ? '1 minggu' : '3 bulan'
      });
    }

    // 4. Savings Rate Analysis - Comprehensive
    if (totalIncome > 0) {
      const targetSavings = Math.round(totalIncome * 0.2);
      const currentSavings = Math.max(0, netSavings);
      const gap = targetSavings - currentSavings;

      if (savingsRate < 20) {
        let severity = 'ringan';
        let advice = 'Ayo tingkatkan tabungan Anda!';

        if (savingsRate < 5) {
          severity = 'parah';
          advice = 'Pola saat ini unsustainable. Immediate action diperlukan!';
        } else if (savingsRate < 10) {
          severity = 'sedang';
          advice = 'Tabungan sangat minim. Perlu strategi agresif.';
        }

        insights.push({
          id: 'insight-savings-rate',
          title: `Tabungan: ${savingsRate.toFixed(1)}% (Target: 20%)`,
          tag: 'Tabungan',
          isInternet: false,
          description: `Dari penghasilan Rp ${totalIncome.toLocaleString('id-ID')}/bulan, Anda mengeluarkan Rp ${totalExpense.toLocaleString('id-ID')} dan menabung Rp ${currentSavings.toLocaleString('id-ID')} (${savingsRate.toFixed(1)}%). Severity: ${severity}. Anda perlu tambahan Rp ${Math.max(0, gap).toLocaleString('id-ID')}/bulan untuk capai target 20%. ${advice}`,
          planName: 'Naik Tabungan ke 20%',
          actionSteps: [
            'Gunakan rumus 50/30/20: 50% kebutuhan, 30% keinginan, 20% tabungan',
            `Potong 1 langganan tidak penting untuk tambah tabungan`,
            'Set up auto-debit ke tabungan saat gajian'
          ],
          targetDate: 'Bulan ini'
        });
      } else {
        insights.push({
          id: 'insight-good-savings',
          title: `🎉 Tabungan Excellent: ${savingsRate.toFixed(1)}%`,
          tag: 'Tabungan',
          isInternet: false,
          description: `Dari penghasilan Rp ${totalIncome.toLocaleString('id-ID')}, Anda berhasil menyisihkan ${savingsRate.toFixed(1)}% = Rp ${currentSavings.toLocaleString('id-ID')}! Ini di atas target 20%. 💪 Maintain this dan pertimbangkan untuk mulai investasi.`,
          planName: 'Pertahankan & Invest',
          actionSteps: [
            `Pertahankan savings rate minimal ${savingsRate.toFixed(0)}% setiap bulan`,
            'Setelah dana darurat 6x expenses terpenuhi, mulai investasi',
            'Pertimbangkan reksa dana index fund untuk jangka panjang'
          ],
          targetDate: '3 bulan'
        });
      }
    }

    // 5. Task Priority Analysis
    if (pendingTodos.length > 0) {
      const urgentTodo = pendingTodos[0];
      const overdueTodos = pendingTodos.filter(t => {
        if (!t.due_date) return false;
        return new Date(t.due_date) < new Date();
      });

      insights.push({
        id: 'insight-urgent-task',
        title: `Prioritas Tertinggi: ${urgentTodo.task_name}`,
        tag: 'Produktivitas',
        isInternet: false,
        description: `Anda memiliki ${pendingTodos.length} tugas aktif. Prioritas utama: "${urgentTodo.task_name}"${urgentTodo.due_date ? ` (tenggat: ${new Date(urgentTodo.due_date).toLocaleDateString('id-ID')})` : ' (tanpa tenggat)'}. ${overdueTodos.length > 0 ? `⚠️ Anda memiliki ${overdueTodos.length} tugas terlambat!` : pendingTodos.length > 5 ? 'Beban tugas cukup banyak. Selesaikan satu per satu.' : 'Beban tugas masih manageable.'}`,
        planName: 'Fokus Tugas Prioritas',
        actionSteps: [
          `Prioritaskan "${urgentTodo.task_name}" untuk diselesaikan pertama`,
          'Breakdown tugas menjadi step-step kecil',
          'Set timer 25 menit (Pomodoro) untuk fokus'
        ],
        targetDate: urgentTodo.due_date || '3 hari'
      });
    }

    // 6. Consistency Challenge
    if (consistencyRate < 70 && rawTodos.length >= 3) {
      insights.push({
        id: 'insight-consistency',
        title: 'Tantangan Konsistensi Penyelesaian Tugas',
        tag: 'Produktivitas',
        isInternet: false,
        description: `Skor konsistensi Anda ${consistencyRate}%. Dari ${rawTodos.length} tugas, hanya ${completedTodos.length} yang terselesaikan. ${consistencyRate < 50 ? '⚠️ Konsistensi sangat rendah.' : ''}`,
        planName: 'Tingkatkan Konsistensi 70%+',
        actionSteps: [
          'Mulai dengan tugas terkecil untuk membangun momentum',
          'Gunakan teknik Pomodoro: 25 menit fokus, 5 menit istirahat',
          'Celebrate setiap keberhasilan menyelesaikan tugas'
        ],
        targetDate: '1 bulan'
      });
    }

    // 7. Overflow Insights (only if we have enough data)
    if (rawTransactions.length >= 10 && sortedExpenses.length >= 3) {
      const avgExpense = totalExpense / sortedExpenses.length;
      const highExpenses = sortedExpenses.filter(e => Number(e.amount) > avgExpense);

      if (highExpenses.length > 0) {
        insights.push({
          id: 'insight-expense-pattern',
          title: 'Pola Pengeluaran Tidak Merata',
          tag: 'Anti-Boros',
          isInternet: false,
          description: `Dari ${rawTransactions.filter(t => t.type === 'expense').length} transaksi pengeluaran, ${highExpenses.length} di antaranya tergolong besar (di atas rata-rata Rp ${Math.round(avgExpense).toLocaleString()}). Ini mengindikasikan pola pengeluaran tidak merata.`,
          planName: 'Ratakan Pola Pengeluaran',
          actionSteps: [
            'Buat anggaran bulanan per kategori',
            'Catat setiap transaksi untuk awareness',
            'Kurangi pengeluaran besar yang berulang'
          ],
          targetDate: 'Bulan ini'
        });
      }
    }

    return insights.slice(0, 5); // Max 5 insights
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

  // Extracts data helper - COMPUTE from rawTransactions for immediate display
  const computedIncome = rawTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const computedExpense = rawTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const totalIncome = insights.cash_flow_analysis?.sources_metadata?.totalIncome || computedIncome;
  const totalExpense = insights.cash_flow_analysis?.sources_metadata?.totalExpense || computedExpense;
  const netSavings = totalIncome - totalExpense;
  const progressRatio = totalIncome > 0 ? Math.min((totalExpense / totalIncome) * 100, 100) : 0;

  // Compute consistency score from rawTodos
  const completedTodosCount = rawTodos.filter(t => t.status === 'completed').length;
  const totalTodosCount = rawTodos.length;
  const computedConsistency = totalTodosCount > 0 ? Math.round((completedTodosCount / totalTodosCount) * 100) : 0;
  const consistencyScore = insights.consistency_graph?.sources_metadata?.consistencyRate || computedConsistency;

  // isDemo - reactive state-based version
  const isDemo = isDemoMode || !supabase;

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

  // Extract time-based data from insights OR compute from raw data
  const moodSpendingData = insights.mood_vs_spending?.sources_metadata || {};
  const moodProductivityData = insights.mood_vs_productivity?.sources_metadata || {};

  // Compute time-based spending from rawTransactions if not in insights
  const parseHourFromItem = (item: any): number => {
    const jam = item.dynamic_metadata?.jam || '';
    if (!jam) return -1;
    const parts = jam.split(':');
    if (parts.length > 0) {
      const hr = parseInt(parts[0], 10);
      return isNaN(hr) ? -1 : hr;
    }
    return -1;
  };

  // Calculate spending by time period from raw data
  let rawSpendPagi = 0, rawSpendSiang = 0, rawSpendMalam = 0, rawTotalExpenseForTime = 0;
  rawTransactions.filter(t => t.type === 'expense').forEach(t => {
    const hr = parseHourFromItem(t);
    const amt = Number(t.amount || 0);
    if (hr !== -1) {
      rawTotalExpenseForTime += amt;
      if (hr >= 5 && hr < 12) rawSpendPagi += amt;
      else if (hr >= 12 && hr < 17) rawSpendSiang += amt;
      else rawSpendMalam += amt;
    }
  });

  // Calculate tasks by time period from raw data
  let rawTasksPagi = 0, rawTasksSiang = 0, rawTasksMalam = 0, rawTotalTasksWithTime = 0;
  rawTodos.forEach(t => {
    const hr = parseHourFromItem(t);
    if (hr !== -1) {
      rawTotalTasksWithTime += 1;
      if (hr >= 5 && hr < 12) rawTasksPagi += 1;
      else if (hr >= 12 && hr < 17) rawTasksSiang += 1;
      else rawTasksMalam += 1;
    }
  });

  // Use computed values if insights don't have them
  const nightSpendingPercent = moodSpendingData.nightSpendingPercent || (rawTotalExpenseForTime > 0 ? Math.round((rawSpendMalam / rawTotalExpenseForTime) * 100) : 0);
  const tasksPagi = moodProductivityData.tasksPagi || rawTasksPagi;
  const tasksSiang = moodProductivityData.tasksSiang || rawTasksSiang;
  const tasksMalam = moodProductivityData.tasksMalam || rawTasksMalam;
  const totalTasksWithTime = moodProductivityData.totalTasksWithTime || rawTotalTasksWithTime;

  // Chronotype calculation based on task distribution
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
          <div className="fragment-wrapper">
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
                      <div className="bar-fill" style={{ height: `${moodSpendingData.spendPagi ? Math.min(100, (moodSpendingData.spendPagi / (moodSpendingData.spendPagi + moodSpendingData.spendSiang + moodSpendingData.spendMalam || 1)) * 100) : 33}%`, background: 'var(--color-success)' }} data-value={`Pagi: Rp ${(moodSpendingData.spendPagi || 0).toLocaleString()}`}></div>
                      <span className="bar-label">Pagi</span>
                    </div>
                    <div className="bar-column">
                      <div className="bar-fill" style={{ height: `${moodSpendingData.spendSiang ? Math.min(100, (moodSpendingData.spendSiang / (moodSpendingData.spendPagi + moodSpendingData.spendSiang + moodSpendingData.spendMalam || 1)) * 100) : 33}%`, background: 'var(--color-warning)' }} data-value={`Siang: Rp ${(moodSpendingData.spendSiang || 0).toLocaleString()}`}></div>
                      <span className="bar-label">Siang</span>
                    </div>
                    <div className="bar-column">
                      <div className="bar-fill" style={{ height: `${nightSpendingPercent}%`, background: nightSpendingPercent > 30 ? 'var(--color-danger)' : 'var(--color-primary)' }} data-value={`Malam: ${nightSpendingPercent}%`}></div>
                      <span className="bar-label">Malam</span>
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
                      <div className="bar-fill" style={{ height: `${totalTasksWithTime > 0 ? (tasksPagi / totalTasksWithTime) * 100 : 33}%`, background: 'var(--color-success)' }} data-value={`Pagi: ${tasksPagi} tugas`}></div>
                      <span className="bar-label">Pagi</span>
                    </div>
                    <div className="bar-column">
                      <div className="bar-fill" style={{ height: `${totalTasksWithTime > 0 ? (tasksSiang / totalTasksWithTime) * 100 : 33}%`, background: 'var(--color-warning)' }} data-value={`Siang: ${tasksSiang} tugas`}></div>
                      <span className="bar-label">Siang</span>
                    </div>
                    <div className="bar-column">
                      <div className="bar-fill" style={{ height: `${totalTasksWithTime > 0 ? (tasksMalam / totalTasksWithTime) * 100 : 34}%`, background: 'var(--color-purple)' }} data-value={`Malam: ${tasksMalam} tugas`}></div>
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
                    <div style={{ fontSize: '3rem', fontWeight: 800, fontFamily: 'var(--font-title)', color: insights.trend_worth_it_score?.sources_metadata?.worthItScore >= 60 ? 'var(--color-success)' : insights.trend_worth_it_score?.sources_metadata?.worthItScore >= 40 ? 'var(--color-warning)' : 'var(--color-danger)', textShadow: '0 0 20px rgba(16,185,129,0.3)' }}>
                      {insights.trend_worth_it_score?.sources_metadata?.worthItGrade || 'N/A'}
                    </div>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                    Skor Kebermanfaatan Belanja: {insights.trend_worth_it_score?.sources_metadata?.worthItScore || 0}%
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <h2 className="section-title" style={{ marginBottom: 0, borderLeftColor: 'var(--color-purple)' }}>
                  <span>💡</span> Rekomendasi & Analisis Data
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setInsightsRefreshCountdown(3600); // Reset countdown
                    setInsightsVersion(prev => prev + 1); // Force re-compute insights
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    background: insightsRefreshCountdown > 0 ? 'rgba(255,255,255,0.05)' : 'var(--color-primary)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '8px',
                    color: insightsRefreshCountdown > 0 ? 'var(--text-muted)' : 'white',
                    cursor: insightsRefreshCountdown > 0 ? 'not-allowed' : 'pointer',
                    fontSize: '0.85rem',
                    transition: 'all 0.2s ease',
                  }}
                  disabled={insightsRefreshCountdown > 0}
                >
                  🔄 Refresh
                  <span style={{
                    fontSize: '0.75rem',
                    padding: '2px 6px',
                    background: insightsRefreshCountdown > 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.2)',
                    borderRadius: '4px',
                  }}>
                    {formatCountdown(insightsRefreshCountdown)}
                  </span>
                </button>
              </div>
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
                        <span style={{ cursor: 'pointer', textDecoration: 'underline', color: 'var(--color-danger)' }} onClick={() => handleDeletePlan(plan.id)}>Hapus</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {activeView === 'data' && (
          <div className="fragment-wrapper">
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
                    <div className="fragment-wrapper">
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
                    </div>
                  ) : (
                    <div className="fragment-wrapper">
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
                    </div>
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

            {/* ============================================================ */}
            {/* DATA TABS: Transactions vs Todos - Separate Views */}
            {/* ============================================================ */}

            {/* Tab Switcher for Data Views */}
            <div className="card" style={{ padding: '0' }}>
              <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveDataTab('transactions');
                    setCurrentTxPage(1);
                  }}
                  style={{
                    flex: 1,
                    padding: '14px 16px',
                    background: activeDataTab === 'transactions' ? 'var(--color-primary)' : 'transparent',
                    color: activeDataTab === 'transactions' ? 'white' : 'var(--text-secondary)',
                    border: 'none',
                    borderBottom: activeDataTab === 'transactions' ? '2px solid var(--color-primary)' : '2px solid transparent',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  💰 Transaksi ({rawTransactions.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveDataTab('todos');
                    setCurrentTodoPage(1);
                  }}
                  style={{
                    flex: 1,
                    padding: '14px 16px',
                    background: activeDataTab === 'todos' ? 'var(--color-warning)' : 'transparent',
                    color: activeDataTab === 'todos' ? 'black' : 'var(--text-secondary)',
                    border: 'none',
                    borderBottom: activeDataTab === 'todos' ? '2px solid var(--color-warning)' : '2px solid transparent',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  📋 Tugas ({rawTodos.length})
                </button>
              </div>

              {/* ============================================================ */}
              {/* TRANSACTIONS TABLE */}
              {/* ============================================================ */}
              {activeDataTab === 'transactions' && (
                <div style={{ padding: '16px' }}>
                  {rawTransactions.length === 0 ? (
                    <p style={{
                      color: 'var(--text-secondary)',
                      fontStyle: 'italic',
                      textAlign: 'center',
                      padding: '40px 0'
                    }}>
                      Belum ada data transaksi. Mulai chat dengan AI untuk mencatat transaksi!
                    </p>
                  ) : (
                    <div className="fragment-wrapper">
                      {/* Filter & Sort Controls */}
                      <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '12px',
                        marginBottom: '16px',
                        padding: '12px',
                        background: 'rgba(255,255,255,0.02)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-glass)',
                      }}>
                        {/* Search */}
                        <div style={{ flex: '1 1 200px' }}>
                          <input
                            type="text"
                            placeholder="🔍 Cari transaksi..."
                            value={txSearchQuery}
                            onChange={(e) => setTxSearchQuery(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              background: 'var(--color-bg)',
                              border: '1px solid var(--border-glass)',
                              borderRadius: '6px',
                              color: 'var(--text-primary)',
                              fontSize: '0.85rem',
                            }}
                          />
                        </div>
                        {/* Filter by Type */}
                        <div style={{ flex: '0 0 auto' }}>
                          <select
                            value={txFilterType}
                            onChange={(e) => setTxFilterType(e.target.value as any)}
                            style={{
                              padding: '8px 12px',
                              background: 'var(--color-bg)',
                              border: '1px solid var(--border-glass)',
                              borderRadius: '6px',
                              color: 'var(--text-primary)',
                              fontSize: '0.85rem',
                              cursor: 'pointer',
                            }}
                          >
                            <option value="all">Semua Tipe</option>
                            <option value="income">📥 Pemasukan</option>
                            <option value="expense">📤 Pengeluaran</option>
                          </select>
                        </div>
                        {/* Sort */}
                        <div style={{ flex: '0 0 auto', display: 'flex', gap: '8px' }}>
                          <select
                            value={txSortField}
                            onChange={(e) => setTxSortField(e.target.value as any)}
                            style={{
                              padding: '8px 12px',
                              background: 'var(--color-bg)',
                              border: '1px solid var(--border-glass)',
                              borderRadius: '6px',
                              color: 'var(--text-primary)',
                              fontSize: '0.85rem',
                              cursor: 'pointer',
                            }}
                          >
                            <option value="created_at">Tanggal</option>
                            <option value="amount">Jumlah</option>
                            <option value="description">Deskripsi</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => setTxSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                            style={{
                              padding: '8px 12px',
                              background: 'var(--color-bg)',
                              border: '1px solid var(--border-glass)',
                              borderRadius: '6px',
                              color: 'var(--text-primary)',
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                            }}
                            title={txSortOrder === 'asc' ? 'Urutkan descending' : 'Urutkan ascending'}
                          >
                            {txSortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
                          </button>
                        </div>
                      </div>

                      {/* Processed transactions with filter & sort */}
                      {(() => {
                        let filtered = [...rawTransactions];
                        // Apply type filter
                        if (txFilterType !== 'all') {
                          filtered = filtered.filter(t => t.type === txFilterType);
                        }
                        // Apply search
                        if (txSearchQuery) {
                          const q = txSearchQuery.toLowerCase();
                          filtered = filtered.filter(t =>
                            (t.description || '').toLowerCase().includes(q) ||
                            String(t.amount).includes(q)
                          );
                        }
                        // Apply sort
                        filtered.sort((a, b) => {
                          let valA: any, valB: any;
                          switch (txSortField) {
                            case 'created_at':
                              valA = new Date(a.created_at || 0).getTime();
                              valB = new Date(b.created_at || 0).getTime();
                              break;
                            case 'amount':
                              valA = Number(a.amount || 0);
                              valB = Number(b.amount || 0);
                              break;
                            case 'description':
                              valA = (a.description || '').toLowerCase();
                              valB = (b.description || '').toLowerCase();
                              break;
                            default:
                              valA = a.created_at;
                              valB = b.created_at;
                          }
                          if (txSortOrder === 'asc') {
                            return valA > valB ? 1 : -1;
                          }
                          return valA < valB ? 1 : -1;
                        });
                        return filtered;
                      })().length === 0 ? (
                        <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
                          Tidak ada transaksi yang cocok dengan filter.
                        </p>
                      ) : (
                        <div className="fragment-wrapper">
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                            Menampilkan {(() => {
                              let filtered = [...rawTransactions];
                              if (txFilterType !== 'all') filtered = filtered.filter(t => t.type === txFilterType);
                              if (txSearchQuery) {
                                const q = txSearchQuery.toLowerCase();
                                filtered = filtered.filter(t => (t.description || '').toLowerCase().includes(q) || String(t.amount).includes(q));
                              }
                              return filtered.length;
                            })()} dari {rawTransactions.length} transaksi
                          </div>
                          {/* Sticky Table Container */}
                          <div style={{
                            maxHeight: '500px',
                            overflowY: 'auto',
                            borderRadius: '8px',
                            border: '1px solid var(--color-border)',
                          }}>
                            <table style={{
                              width: '100%',
                              borderCollapse: 'collapse',
                              fontSize: '0.85rem',
                            }}>
                              <thead style={{
                                position: 'sticky',
                                top: 0,
                                background: 'var(--color-surface)',
                                zIndex: 10,
                              }}>
                                <tr>
                                  <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid var(--color-border)', fontWeight: 600, whiteSpace: 'nowrap' }}>Deskripsi</th>
                                  <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid var(--color-border)', fontWeight: 600, whiteSpace: 'nowrap' }}>Tipe</th>
                                  <th style={{ padding: '12px 16px', textAlign: 'right', borderBottom: '2px solid var(--color-border)', fontWeight: 600, whiteSpace: 'nowrap' }}>Jumlah</th>
                                  <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid var(--color-border)', fontWeight: 600, whiteSpace: 'nowrap' }}>Tanggal & Waktu</th>
                                  <th style={{ padding: '12px 16px', textAlign: 'center', borderBottom: '2px solid var(--color-border)', fontWeight: 600, whiteSpace: 'nowrap' }}>Aksi</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(() => {
                                  let filtered = [...rawTransactions];
                                  if (txFilterType !== 'all') filtered = filtered.filter(t => t.type === txFilterType);
                                  if (txSearchQuery) {
                                    const q = txSearchQuery.toLowerCase();
                                    filtered = filtered.filter(t => (t.description || '').toLowerCase().includes(q) || String(t.amount).includes(q));
                                  }
                                  filtered.sort((a, b) => {
                                    let valA: any, valB: any;
                                    switch (txSortField) {
                                      case 'created_at':
                                        valA = new Date(a.created_at || 0).getTime();
                                        valB = new Date(b.created_at || 0).getTime();
                                        break;
                                      case 'amount':
                                        valA = Number(a.amount || 0);
                                        valB = Number(b.amount || 0);
                                        break;
                                      case 'description':
                                        valA = (a.description || '').toLowerCase();
                                        valB = (b.description || '').toLowerCase();
                                        break;
                                      default:
                                        valA = a.created_at;
                                        valB = b.created_at;
                                    }
                                    return txSortOrder === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
                                  });
                                  return filtered;
                                })().slice((currentTxPage - 1) * 10, currentTxPage * 10).map((tx: any, idx: number) => (
                                <tr key={tx.id || idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                  <td style={{ padding: '12px 16px', fontWeight: 500 }}>
                                    {tx.description}
                                    {tx.dynamic_metadata?.receipt_url && (
                                      <div style={{ marginTop: '4px' }}>
                                        <a
                                          href={tx.dynamic_metadata.receipt_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          style={{
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
                                  <td style={{ padding: '12px 16px' }}>
                                    <span style={{
                                      padding: '4px 10px',
                                      borderRadius: '20px',
                                      fontSize: '0.75rem',
                                      background: tx.type === 'income' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                                      color: tx.type === 'income' ? 'var(--color-success)' : 'var(--color-danger)',
                                      fontWeight: 600
                                    }}>
                                      {tx.type === 'income' ? '📥 Masuk' : '📤 Keluar'}
                                    </span>
                                  </td>
                                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: tx.type === 'income' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                                    {tx.type === 'income' ? '+' : '-'} Rp {Number(tx.amount).toLocaleString('id-ID')}
                                  </td>
                                  <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                    <div>{tx.transaction_date || '-'}</div>
                                    {tx.dynamic_metadata?.jam && (
                                      <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                                        🕒 {tx.dynamic_metadata.jam}
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteTransaction(tx.id)}
                                      style={{
                                        background: 'rgba(239, 68, 68, 0.1)',
                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                        color: 'var(--color-danger)',
                                        padding: '6px 12px',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '0.75rem',
                                      }}
                                    >
                                      🗑️ Hapus
                                    </button>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination */}
                      {(() => {
                        let filtered = [...rawTransactions];
                        if (txFilterType !== 'all') filtered = filtered.filter(t => t.type === txFilterType);
                        if (txSearchQuery) {
                          const q = txSearchQuery.toLowerCase();
                          filtered = filtered.filter(t => (t.description || '').toLowerCase().includes(q) || String(t.amount).includes(q));
                        }
                        const totalPages = Math.ceil(filtered.length / 10);
                        if (totalPages <= 1) return null;
                        return (
                          <div style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: '8px',
                            marginTop: '16px',
                            padding: '12px',
                            background: 'var(--color-bg)',
                            borderRadius: '8px',
                          }}>
                            <button
                              type="button"
                              onClick={() => setCurrentTxPage(p => Math.max(1, p - 1))}
                              disabled={currentTxPage === 1}
                              style={{
                                padding: '6px 12px',
                                background: 'var(--color-surface)',
                                border: '1px solid var(--color-border)',
                                borderRadius: '6px',
                                color: 'var(--text-primary)',
                                cursor: currentTxPage === 1 ? 'not-allowed' : 'pointer',
                                opacity: currentTxPage === 1 ? 0.5 : 1,
                              }}
                            >
                              ←
                            </button>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                              Halaman {currentTxPage} dari {totalPages}
                            </span>
                            <button
                              type="button"
                              onClick={() => setCurrentTxPage(p => Math.min(totalPages, p + 1))}
                              disabled={currentTxPage >= totalPages}
                              style={{
                                padding: '6px 12px',
                                background: 'var(--color-surface)',
                                border: '1px solid var(--color-border)',
                                borderRadius: '6px',
                                color: 'var(--text-primary)',
                                cursor: currentTxPage >= totalPages ? 'not-allowed' : 'pointer',
                                opacity: currentTxPage >= totalPages ? 0.5 : 1,
                              }}
                            >
                              →
                            </button>
                          </div>
                        );
                      })()}
                    </div>)}
                </div>
              {/* ============================================================ */}
              {/* TODOS TABLE */}
              {/* ============================================================ */}
              {activeDataTab === 'todos' && (
                <div style={{ padding: '16px' }}>
                  {rawTodos.length === 0 ? (
                    <p style={{
                      color: 'var(--text-secondary)',
                      fontStyle: 'italic',
                      textAlign: 'center',
                      padding: '40px 0'
                    }}>
                      Belum ada tugas. Mulai chat dengan AI untuk mencatat tugas!
                    </p>
                  ) : (
                    <div className="fragment-wrapper">
                      {/* Filter & Sort Controls for Todos */}
                      <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '12px',
                        marginBottom: '16px',
                        padding: '12px',
                        background: 'rgba(255,255,255,0.02)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-glass)',
                      }}>
                        {/* Search */}
                        <div style={{ flex: '1 1 200px' }}>
                          <input
                            type="text"
                            placeholder="🔍 Cari tugas..."
                            value={todoSearchQuery}
                            onChange={(e) => setTodoSearchQuery(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              background: 'var(--color-bg)',
                              border: '1px solid var(--border-glass)',
                              borderRadius: '6px',
                              color: 'var(--text-primary)',
                              fontSize: '0.85rem',
                            }}
                          />
                        </div>
                        {/* Filter by Status */}
                        <div style={{ flex: '0 0 auto' }}>
                          <select
                            value={todoFilterStatus}
                            onChange={(e) => setTodoFilterStatus(e.target.value as any)}
                            style={{
                              padding: '8px 12px',
                              background: 'var(--color-bg)',
                              border: '1px solid var(--border-glass)',
                              borderRadius: '6px',
                              color: 'var(--text-primary)',
                              fontSize: '0.85rem',
                              cursor: 'pointer',
                            }}
                          >
                            <option value="all">Semua Status</option>
                            <option value="pending">⏳ Tertunda</option>
                            <option value="completed">✅ Selesai</option>
                            <option value="cancelled">❌ Batal</option>
                          </select>
                        </div>
                        {/* Sort */}
                        <div style={{ flex: '0 0 auto', display: 'flex', gap: '8px' }}>
                          <select
                            value={todoSortField}
                            onChange={(e) => setTodoSortField(e.target.value as any)}
                            style={{
                              padding: '8px 12px',
                              background: 'var(--color-bg)',
                              border: '1px solid var(--border-glass)',
                              borderRadius: '6px',
                              color: 'var(--text-primary)',
                              fontSize: '0.85rem',
                              cursor: 'pointer',
                            }}
                          >
                            <option value="created_at">Tanggal Buat</option>
                            <option value="due_date">Tenggat</option>
                            <option value="task_name">Nama</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => setTodoSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                            style={{
                              padding: '8px 12px',
                              background: 'var(--color-bg)',
                              border: '1px solid var(--border-glass)',
                              borderRadius: '6px',
                              color: 'var(--text-primary)',
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                            }}
                            title={todoSortOrder === 'asc' ? 'Urutkan descending' : 'Urutkan ascending'}
                          >
                            {todoSortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
                          </button>
                        </div>
                      </div>

                      {/* Processed todos with filter & sort */}
                      {(() => {
                        let filtered = [...rawTodos];
                        if (todoFilterStatus !== 'all') {
                          filtered = filtered.filter(t => t.status === todoFilterStatus);
                        }
                        if (todoSearchQuery) {
                          const q = todoSearchQuery.toLowerCase();
                          filtered = filtered.filter(t => (t.task_name || '').toLowerCase().includes(q));
                        }
                        filtered.sort((a, b) => {
                          let valA: any, valB: any;
                          switch (todoSortField) {
                            case 'created_at':
                              valA = new Date(a.created_at || 0).getTime();
                              valB = new Date(b.created_at || 0).getTime();
                              break;
                            case 'due_date':
                              valA = a.due_date ? new Date(a.due_date).getTime() : Infinity;
                              valB = b.due_date ? new Date(b.due_date).getTime() : Infinity;
                              break;
                            case 'task_name':
                              valA = (a.task_name || '').toLowerCase();
                              valB = (b.task_name || '').toLowerCase();
                              break;
                            default:
                              valA = a.created_at;
                              valB = b.created_at;
                          }
                          return todoSortOrder === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
                        });
                        return filtered;
                      })().length === 0 ? (
                        <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
                          Tidak ada tugas yang cocok dengan filter.
                        </p>
                      ) : (
                        <div className="fragment-wrapper">
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                            Menampilkan {(() => {
                              let filtered = [...rawTodos];
                              if (todoFilterStatus !== 'all') filtered = filtered.filter(t => t.status === todoFilterStatus);
                              if (todoSearchQuery) {
                                const q = todoSearchQuery.toLowerCase();
                                filtered = filtered.filter(t => (t.task_name || '').toLowerCase().includes(q));
                              }
                              return filtered.length;
                            })()} dari {rawTodos.length} tugas
                          </div>
                          {/* Sticky Table Container */}
                          <div style={{
                            maxHeight: '500px',
                            overflowY: 'auto',
                            borderRadius: '8px',
                            border: '1px solid var(--color-border)',
                          }}>
                        <table style={{
                          width: '100%',
                          borderCollapse: 'collapse',
                          fontSize: '0.85rem',
                        }}>
                          <thead style={{
                            position: 'sticky',
                            top: 0,
                            background: 'var(--color-surface)',
                            zIndex: 10,
                          }}>
                            <tr>
                              <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid var(--color-border)', fontWeight: 600, whiteSpace: 'nowrap' }}>Nama Tugas</th>
                              <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid var(--color-border)', fontWeight: 600, whiteSpace: 'nowrap' }}>Status</th>
                              <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid var(--color-border)', fontWeight: 600, whiteSpace: 'nowrap' }}>Waktu Mulai</th>
                              <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid var(--color-border)', fontWeight: 600, whiteSpace: 'nowrap' }}>Pengingat</th>
                              <th style={{ padding: '12px 16px', textAlign: 'center', borderBottom: '2px solid var(--color-border)', fontWeight: 600, whiteSpace: 'nowrap' }}>Aksi</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              let filtered = [...rawTodos];
                              if (todoFilterStatus !== 'all') filtered = filtered.filter(t => t.status === todoFilterStatus);
                              if (todoSearchQuery) {
                                const q = todoSearchQuery.toLowerCase();
                                filtered = filtered.filter(t => (t.task_name || '').toLowerCase().includes(q));
                              }
                              filtered.sort((a, b) => {
                                let valA: any, valB: any;
                                switch (todoSortField) {
                                  case 'created_at':
                                    valA = new Date(a.created_at || 0).getTime();
                                    valB = new Date(b.created_at || 0).getTime();
                                    break;
                                  case 'due_date':
                                    valA = a.due_date ? new Date(a.due_date).getTime() : Infinity;
                                    valB = b.due_date ? new Date(b.due_date).getTime() : Infinity;
                                    break;
                                  case 'task_name':
                                    valA = (a.task_name || '').toLowerCase();
                                    valB = (b.task_name || '').toLowerCase();
                                    break;
                                  default:
                                    valA = a.created_at;
                                    valB = b.created_at;
                                }
                                return todoSortOrder === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
                              });
                              return filtered;
                            })().slice((currentTodoPage - 1) * 10, currentTodoPage * 10).map((todo: any, idx: number) => (
                                <tr key={todo.id || idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                  <td style={{ padding: '12px 16px', fontWeight: 500 }}>
                                    {todo.task_name}
                                  </td>
                                  <td style={{ padding: '12px 16px' }}>
                                    <span style={{
                                      padding: '4px 10px',
                                      borderRadius: '20px',
                                      fontSize: '0.75rem',
                                      background: todo.status === 'completed' ? 'rgba(16,185,129,0.12)' : todo.status === 'cancelled' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                                      color: todo.status === 'completed' ? 'var(--color-success)' : todo.status === 'cancelled' ? 'var(--color-danger)' : 'var(--color-warning)',
                                      fontWeight: 600
                                    }}>
                                      {todo.status === 'completed' ? '✅ Selesai' : todo.status === 'cancelled' ? '❌ Batal' : '⏳ Tertunda'}
                                    </span>
                                  </td>
                                  <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                    <div>{todo.waktu_mulai ? new Date(todo.waktu_mulai).toLocaleDateString('id-ID') : (todo.due_date ? new Date(todo.due_date).toLocaleDateString('id-ID') : '-')}</div>
                                    {(todo.waktu_mulai ? todo.waktu_mulai : todo.dynamic_metadata?.jam) && (
                                      <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                                        🕒 {(todo.waktu_mulai || todo.dynamic_metadata?.jam)?.slice(11, 16) || ''}
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                    {todo.pengingat ? (
                                      <div className="fragment-wrapper">
                                        <div>{new Date(todo.pengingat).toLocaleDateString('id-ID')}</div>
                                        <div style={{ fontSize: '0.8rem', opacity: 0.8, color: 'var(--color-warning)' }}>
                                          🔔 {todo.pengingat.slice(11, 16)}
                                        </div>
                                      </div>
                                    ) : '-'}
                                  </td>
                                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                                      <select
                                        value={todo.status}
                                        onChange={(e) => handleUpdateTodoStatus(todo.id, e.target.value as any)}
                                        style={{
                                          padding: '6px 10px',
                                          background: 'var(--color-surface)',
                                          border: '1px solid var(--color-border)',
                                          borderRadius: '6px',
                                          color: 'var(--text-primary)',
                                          cursor: 'pointer',
                                          fontSize: '0.75rem',
                                        }}
                                      >
                                        <option value="pending">Tertunda</option>
                                        <option value="completed">Selesai</option>
                                        <option value="cancelled">Batal</option>
                                      </select>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteTodo(todo.id)}
                                        style={{
                                          background: 'rgba(239, 68, 68, 0.1)',
                                          border: '1px solid rgba(239, 68, 68, 0.3)',
                                          color: 'var(--color-danger)',
                                          padding: '6px 10px',
                                          borderRadius: '6px',
                                          cursor: 'pointer',
                                          fontSize: '0.75rem',
                                        }}
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

                      {/* Pagination for Todos */}
                      {(() => {
                        let filtered = [...rawTodos];
                        if (todoFilterStatus !== 'all') filtered = filtered.filter(t => t.status === todoFilterStatus);
                        if (todoSearchQuery) {
                          const q = todoSearchQuery.toLowerCase();
                          filtered = filtered.filter(t => (t.task_name || '').toLowerCase().includes(q));
                        }
                        filtered.sort((a, b) => {
                          let valA: any, valB: any;
                          switch (todoSortField) {
                            case 'created_at':
                              valA = new Date(a.created_at || 0).getTime();
                              valB = new Date(b.created_at || 0).getTime();
                              break;
                            case 'due_date':
                              valA = a.due_date ? new Date(a.due_date).getTime() : Infinity;
                              valB = b.due_date ? new Date(b.due_date).getTime() : Infinity;
                              break;
                            case 'task_name':
                              valA = (a.task_name || '').toLowerCase();
                              valB = (b.task_name || '').toLowerCase();
                              break;
                            default:
                              valA = a.created_at;
                              valB = b.created_at;
                          }
                          return todoSortOrder === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
                        });
                        const totalPages = Math.ceil(filtered.length / 10);
                        if (totalPages <= 1) return null;
                        return (
                          <div style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: '8px',
                            marginTop: '16px',
                            padding: '12px',
                            background: 'var(--color-bg)',
                            borderRadius: '8px',
                          }}>
                            <button
                              type="button"
                              onClick={() => setCurrentTodoPage(p => Math.max(1, p - 1))}
                              disabled={currentTodoPage === 1}
                              style={{
                                padding: '6px 12px',
                                background: 'var(--color-surface)',
                                border: '1px solid var(--color-border)',
                                borderRadius: '6px',
                                color: 'var(--text-primary)',
                                cursor: currentTodoPage === 1 ? 'not-allowed' : 'pointer',
                                opacity: currentTodoPage === 1 ? 0.5 : 1,
                              }}
                            >
                              ←
                            </button>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                              Halaman {currentTodoPage} dari {totalPages}
                            </span>
                            <button
                              type="button"
                              onClick={() => setCurrentTodoPage(p => Math.min(totalPages, p + 1))}
                              disabled={currentTodoPage >= totalPages}
                              style={{
                                padding: '6px 12px',
                                background: 'var(--color-surface)',
                                border: '1px solid var(--color-border)',
                                borderRadius: '6px',
                                color: 'var(--text-primary)',
                                cursor: currentTodoPage >= totalPages ? 'not-allowed' : 'pointer',
                                opacity: currentTodoPage >= totalPages ? 0.5 : 1,
                              }}
                            >
                              →
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  )}
            </div>
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
