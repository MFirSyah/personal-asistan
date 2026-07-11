import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { verifyGatewayAndUser } from '@/lib/middleware/gateway';
import { supabaseAdmin } from '@/lib/services/supabase';

export async function GET(req: NextRequest) {
  const authResult = await verifyGatewayAndUser(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const { userId } = authResult;

  try {
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Fetch profile and pending tasks
    const [profileResult, todosResult] = await Promise.all([
      supabaseAdmin
        .from('user_profiles')
        .select('fullname, assistant_name, user_nickname, selected_personality, dynamic_metadata')
        .eq('id', userId)
        .maybeSingle(),
      supabaseAdmin
        .from('app_todos')
        .select('task_name, due_date')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('due_date', { ascending: true })
        .limit(10)
    ]);

    const profile = profileResult.data;
    const todos = todosResult.data || [];
    
    const todayTodos = todos.filter(t => t.due_date && t.due_date.startsWith(todayStr));
    const upcomingTodos = todos.filter(t => !t.due_date || !t.due_date.startsWith(todayStr));

    const assistantName = profile?.assistant_name || 'Personal Asistan';
    const userNickname = profile?.user_nickname || 'Sobat';
    
    // Get personality
    let personalityHint = 'Friendly and casual';
    if (profile?.selected_personality) {
      const { data: personality } = await supabaseAdmin
        .from('ai_personalities')
        .select('system_instruction_template')
        .eq('id', profile.selected_personality)
        .maybeSingle();
      if (personality?.system_instruction_template) {
        personalityHint = personality.system_instruction_template.substring(0, 200);
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ briefing: "Selamat pagi! (API Key tidak ditemukan)" });
    }

    const ai = new GoogleGenAI({ apiKey });
    const now = new Date();
    
    let tasksContext = "Tidak ada tugas penting hari ini.";
    if (todayTodos.length > 0) {
      tasksContext = `Tugas hari ini: ${todayTodos.map(t => t.task_name).join(', ')}.`;
    } else if (upcomingTodos.length > 0) {
      tasksContext = `Tidak ada tugas hari ini, tapi ada tugas mendatang: ${upcomingTodos.slice(0,2).map(t => t.task_name).join(', ')}.`;
    }

    const prompt = `You are ${assistantName}, an AI personal assistant for ${userNickname}.
Your personality: ${personalityHint}
Current Date/Time: ${now.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} ${now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' })} WIB

Generate a short "Morning Briefing" in Indonesian (2-3 sentences max).
Context: ${tasksContext}
Include a short motivational phrase at the end. Do not use markdown headers.`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.7,
      },
    });

    return NextResponse.json({
      briefing: result.text?.trim() || "Selamat pagi! Semoga harimu menyenangkan."
    });

  } catch (err: any) {
    console.error('Briefing API error:', err);
    return NextResponse.json({ briefing: "Selamat pagi! Mari kita mulai hari ini." });
  }
}
