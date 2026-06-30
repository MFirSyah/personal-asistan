import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/services/supabase';

// Helper to format currency
const formatRupiah = (num: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(num);
};

export async function POST(req: NextRequest) {
  // 1. Gateway key verification (since it is an internal webhook)
  // Use NEXT_PUBLIC_GATEWAY_KEY to match frontend
  const gatewayKey = req.headers.get('x-jarvis-gateway-key');
  const validKey = process.env.NEXT_PUBLIC_GATEWAY_KEY || process.env.GATEWAY_KEY || 'jarvis-super-secret-key-2026';
  if (gatewayKey !== validKey) {
    console.error('Gateway key mismatch:', { received: gatewayKey, expected: validKey });
    return NextResponse.json({ error: 'Unauthorized gateway access' }, { status: 401 });
  }

  try {
    const payload = await req.json();
    console.log('Webhook payload received:', payload);

    // Extract user ID from the webhook record (INSERT/UPDATE will have it in 'record')
    const record = payload.record || payload.old_record;
    const userId = record?.user_id;

    if (!userId) {
      return NextResponse.json({ error: 'User ID not found in webhook record' }, { status: 400 });
    }

    // --- RECOMPUTE INSIGHTS KELAS A ---

    // A. Fetch All Money Tracker Data for this user
    const { data: transactions } = await supabaseAdmin
      .from('money_trackers')
      .select('amount, type, description, transaction_date')
      .eq('user_id', userId);

    // B. Fetch All To-Do List Data for this user
    const { data: todos } = await supabaseAdmin
      .from('todo_lists')
      .select('task_name, status, due_date')
      .eq('user_id', userId);

    const txs = transactions || [];
    const tasks = todos || [];

    // 1. Cash Flow Analysis
    let totalIncome = 0;
    let totalExpense = 0;
    txs.forEach((tx) => {
      const amt = Number(tx.amount || 0);
      if (tx.type === 'income') totalIncome += amt;
      else if (tx.type === 'expense') totalExpense += amt;
    });
    const cashFlowReply = `Analisis Arus Kas Anda:\nTotal Pemasukan: ${formatRupiah(totalIncome)}\nTotal Pengeluaran: ${formatRupiah(totalExpense)}\nSaldo Bersih: ${formatRupiah(totalIncome - totalExpense)}`;

    // 2. Money Leak Auditor
    // Group expense descriptions to find potential leaks
    const leaks: Record<string, number> = {};
    txs.filter(t => t.type === 'expense').forEach((tx) => {
      const desc = (tx.description || 'Lain-lain').toLowerCase().trim();
      leaks[desc] = (leaks[desc] || 0) + Number(tx.amount || 0);
    });
    const sortedLeaks = Object.entries(leaks).sort((a, b) => b[1] - a[1]);
    let leakReply = 'Audit Kebocoran Uang: Pengeluaran Anda terpantau wajar dan hemat.';
    if (sortedLeaks.length > 0) {
      const [topLeakDesc, topLeakAmt] = sortedLeaks[0];
      if (topLeakAmt > 50000) {
        leakReply = `Audit Kebocoran Uang: Hati-hati! Pengeluaran tertinggi ada di "${topLeakDesc}" sebesar ${formatRupiah(topLeakAmt)}. Pertimbangkan untuk membatasi pengeluaran ini.`;
      }
    }

    // 3. Good Habits Tracker & Consistency Graph
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const totalTasksCount = tasks.length;
    const consistencyRate = totalTasksCount > 0 ? Math.round((completedTasks / totalTasksCount) * 100) : 100;
    const consistencyReply = `Grafik Konsistensi & Pelacak Kebiasaan Baik:\nSkor Konsistensi: ${consistencyRate}%\nTugas Selesai: ${completedTasks} dari ${totalTasksCount} tugas. ${consistencyRate >= 80 ? 'Kerja bagus, pertahankan!' : 'Ayo tingkatkan fokusmu!'}`;

    // 4. Weekly Priority Matrix
    // Identify urgent tasks (due soon) vs non-urgent
    const now = new Date();
    const threeDaysLater = new Date();
    threeDaysLater.setDate(now.getDate() + 3);

    const urgentTasks = tasks.filter(t => {
      if (t.status !== 'pending' || !t.due_date) return false;
      const dueDate = new Date(t.due_date);
      return dueDate <= threeDaysLater;
    });
    const priorityReply = `Matriks Prioritas Mingguan:\nAda ${urgentTasks.length} tugas mendesak yang jatuh tempo dalam 3 hari ke depan. ${urgentTasks.length > 0 ? `Prioritas utama: "${urgentTasks[0].task_name}".` : 'Semua aman, tidak ada tugas mendesak yang menumpuk.'}`;

    // 5. Daily Activity Load
    const todayStr = now.toISOString().split('T')[0];
    const todayTasks = tasks.filter(t => {
      if (!t.due_date) return false;
      const dueStr = new Date(t.due_date).toISOString().split('T')[0];
      return dueStr === todayStr && t.status === 'pending';
    });
    const loadReply = `Beban Kerja Harian:\nHari ini ada ${todayTasks.length} tugas aktif yang harus diselesaikan. ${todayTasks.length > 3 ? 'Beban kerja cukup tinggi, istirahatlah yang cukup!' : 'Beban kerja ringan, luangkan waktu untuk bersantai.'}`;

    // Helper to upsert cache
    const upsertCache = async (type: string, reply: string, meta: any) => {
      return supabaseAdmin.from('ai_insights_cache').upsert(
        {
          user_id: userId,
          insight_type: type,
          cached_reply: reply,
          sources_metadata: meta,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days expiry
        },
        { onConflict: 'user_id,insight_type' }
      );
    };

    // Save all to database
    await Promise.all([
      upsertCache('cash_flow_analysis', cashFlowReply, { totalIncome, totalExpense }),
      upsertCache('money_leak_auditor', leakReply, sortedLeaks),
      upsertCache('consistency_graph', consistencyReply, { consistencyRate, completedTasks, totalTasksCount }),
      upsertCache('weekly_priority_matrix', priorityReply, urgentTasks),
      upsertCache('daily_activity_load', loadReply, todayTasks),
    ]);

    return NextResponse.json({
      message: 'Class A Insights recomputed successfully',
      userId,
    });
  } catch (err: any) {
    console.error('Error recomputing insights:', err);
    return NextResponse.json(
      { error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
