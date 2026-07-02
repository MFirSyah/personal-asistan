import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { verifyGatewayAndUser } from '@/lib/middleware/gateway';
import { supabaseAdmin } from '@/lib/services/supabase';
import { getUserAnalysisPreferences, generatePreferencesContext } from '@/lib/services/analysis-preferences';

export async function GET(req: NextRequest) {
  const authResult = await verifyGatewayAndUser(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const { userId } = authResult;

  try {
    // 1. Fetch user profile to get briefing settings
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('fullname, assistant_name, user_nickname, selected_personality, dynamic_metadata')
      .eq('id', userId)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ show_briefing: false, briefing_text: null });
    }

    const metadata = profile.dynamic_metadata || {};
    const briefingHour = metadata.morning_briefing_hour ?? 5; // default 5 AM
    const lastBriefingDate = metadata.last_briefing_date || null;
    const longTermMemory = metadata.long_term_memory || '';
    const personalityId = profile.selected_personality || 'witty_sidekick';
    const assistantName = profile.assistant_name || 'Personal Asistan';
    const userNickname = profile.user_nickname || 'Sobat';

    // 2. Check if briefing should show
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const currentHour = now.getUTCHours() + 7; // WIB offset

    // Already shown today?
    if (lastBriefingDate === todayStr) {
      return NextResponse.json({ show_briefing: false, briefing_text: null });
    }

    // Is it past the briefing hour?
    if (currentHour < briefingHour) {
      return NextResponse.json({ show_briefing: false, briefing_text: null });
    }

    // 3. Parallel fetch: tasks, transactions, and personality
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const [tasksResult, transactionsResult, personalityResult] = await Promise.all([
      // Fetch today's tasks
      supabaseAdmin
        .from('todo_lists')
        .select('task_name, status, due_date')
        .eq('user_id', userId)
        .in('status', ['pending', 'in_progress'])
        .order('due_date', { ascending: true })
        .limit(10),
      // Fetch recent transactions (last 3 days)
      supabaseAdmin
        .from('money_trackers')
        .select('amount, type, description, transaction_date')
        .eq('user_id', userId)
        .gte('transaction_date', threeDaysAgo)
        .order('transaction_date', { ascending: false })
        .limit(15),
      // Fetch personality
      supabaseAdmin
        .from('ai_personalities')
        .select('system_instruction_template')
        .eq('id', personalityId)
        .maybeSingle()
    ]);

    const tasks = tasksResult.data || [];
    const transactions = transactionsResult.data || [];
    const personality = personalityResult?.data || null;

    // Get user's analysis preferences
    const analysisPrefs = await getUserAnalysisPreferences(userId);
    const preferencesContext = generatePreferencesContext(analysisPrefs);

    const personalityHint = personality?.system_instruction_template
      ? personality.system_instruction_template.substring(0, 300)
      : 'Friendly and casual';

    // 4. Generate briefing with Gemini
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ show_briefing: false, briefing_text: null });
    }

    const ai = new GoogleGenAI({ apiKey });

    const tasksSummary = tasks && tasks.length > 0
      ? tasks.map(t => `- ${t.task_name} (${t.status}${t.due_date ? ', due: ' + t.due_date : ''})`).join('\n')
      : 'Tidak ada tugas aktif.';

    const txSummary = transactions && transactions.length > 0
      ? transactions.map(t => `${t.type === 'income' ? '+' : '-'} Rp ${Number(t.amount).toLocaleString('id-ID')} (${t.description})`).join('\n')
      : 'Tidak ada transaksi terbaru.';

    // Get timezone info
    const timezone = req.nextUrl.searchParams.get('timezone') || 'Asia/Jakarta';
    const tzInfo = {
      'Asia/Jayapura': { name: 'WIT', offset: 'UTC+9' },
      'Asia/Makassar': { name: 'WITA', offset: 'UTC+8' },
      'Asia/Jakarta': { name: 'WIB', offset: 'UTC+7' },
    }[timezone] || { name: 'WIB', offset: 'UTC+7' };

    const result = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: `You are ${assistantName}, an AI personal assistant for ${userNickname}.
Your personality: ${personalityHint}

${preferencesContext}

IMPORTANT - Current Date/Time (User's local timezone):
- Today is: ${now.toLocaleDateString('id-ID', { timeZone: timezone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
- Current time: ${now.toLocaleTimeString('id-ID', { timeZone: timezone, hour: '2-digit', minute: '2-digit' })} ${tzInfo.name}
- User is in timezone: ${tzInfo.name} (${tzInfo.offset})

Generate a concise MORNING BRIEFING in Indonesian for ${userNickname}.
Keep it warm, personal, and actionable. Use emojis appropriately.

IMPORTANT RULES:
- Use plain text ONLY, no markdown formatting
- Use numbers (1., 2., 3., 4.) for lists, NOT bullet points (* or -)
- Keep paragraphs short and easy to read
- Do NOT use bold (**text**) or italic (*text*) markers
- FOCUS on the insight types enabled in user's preferences
- ADJUST detail level based on: ${analysisPrefs?.insight_detail_level || 'standard'}

Structure the briefing like this (use plain text):
1. A warm good morning greeting
2. Today's task overview (based on include_priority_matrix preference)
3. Quick financial snapshot (based on include_cash_flow preference)
4. Any alerts based on user settings

Data context:
TASKS TODAY:
${tasksSummary}

RECENT TRANSACTIONS (last 3 days):
${txSummary}

USER MEMORY:
${longTermMemory || 'Belum ada data memori.'}

Keep the entire briefing under 200 words. Be concise but informative.`,
      config: {
        temperature: 0.6,
      },
    });

    const briefingText = result.text ?? '';

    // 5. Update last_briefing_date so it doesn't show again today
    await supabaseAdmin
      .from('user_profiles')
      .update({
        dynamic_metadata: {
          ...metadata,
          last_briefing_date: todayStr,
        },
      })
      .eq('id', userId);

    return NextResponse.json({
      show_briefing: true,
      briefing_text: briefingText.trim(),
      briefing_hour: briefingHour,
    });
  } catch (err: any) {
    console.error('Briefing API error:', err);
    return NextResponse.json({ show_briefing: false, briefing_text: null });
  }
}

// POST endpoint to update briefing hour setting
export async function POST(req: NextRequest) {
  const authResult = await verifyGatewayAndUser(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const { userId } = authResult;

  try {
    const body = await req.json();
    const { morning_briefing_hour } = body;

    if (typeof morning_briefing_hour !== 'number' || morning_briefing_hour < 0 || morning_briefing_hour > 23) {
      return NextResponse.json({ error: 'Invalid hour (0-23)' }, { status: 400 });
    }

    // Fetch current metadata
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('dynamic_metadata')
      .eq('id', userId)
      .maybeSingle();

    const metadata = profile?.dynamic_metadata || {};

    await supabaseAdmin
      .from('user_profiles')
      .update({
        dynamic_metadata: {
          ...metadata,
          morning_briefing_hour,
        },
      })
      .eq('id', userId);

    return NextResponse.json({ success: true, morning_briefing_hour });
  } catch (err: any) {
    console.error('Briefing settings error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
