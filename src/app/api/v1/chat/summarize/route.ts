import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';
import { verifyGatewayAndUser } from '@/lib/middleware/gateway';
import { supabaseAdmin } from '@/lib/services/supabase';

const getGenAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not defined in environment variables.');
  }
  return new GoogleGenerativeAI(apiKey);
};

export async function POST(req: NextRequest) {
  // 1. Authenticate Request
  const authResult = await verifyGatewayAndUser(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = authResult;

  try {
    // 2. Fetch all chat messages for this user
    const { data: messages, error: fetchError } = await supabaseAdmin
      .from('app_chat_messages')
      .select('sender_id, sender_personality_id, message, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error('Failed to fetch chat messages for summarization:', fetchError);
      return NextResponse.json({ error: 'Database fetch error' }, { status: 500 });
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json({
        success: true,
        summary: 'Tidak ada percakapan untuk dirangkum.',
        message: 'No messages to summarize.'
      });
    }

    // 3. Fetch User Profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('fullname, assistant_name, user_nickname, dynamic_metadata')
      .eq('id', userId)
      .maybeSingle();

    if (profileError || !profile) {
      console.error('Failed to fetch profile:', profileError);
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const metadata = profile.dynamic_metadata || {};
    const existingMemory = metadata.long_term_memory || 'Belum ada memori jangka panjang terdaftar.';

    // 4. Format Chat Log
    const chatLog = messages
      .map(m => `${m.sender_personality_id ? 'AI' : 'User'}: ${m.message}`)
      .join('\n');

    // 5. Generate Summary and Memory Update with Gemini
    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.1-flash-lite',
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    });

    const prompt = `You are the Core Cognitive Engine. The user is clearing their chat history.
Analyze the following conversation log between User (${profile.user_nickname}) and AI (${profile.assistant_name}) to extract reflections on:
1. "user_preferences": How the user prefers to interact, their tone, favorite topics, or specific request formats observed in the chat.
2. "ai_mistakes": Any mistakes, misunderstandings, incorrect assumptions, or behaviors that the user pointed out, corrected, or complained about regarding the AI.

Also, update the user's long-term memory to integrate these reflections.

Current Date: "${new Date().toISOString()}"
Existing Long-term Memory: "${existingMemory}"

Chat Log:
${chatLog}

Format the response strictly in JSON:
{
  "user_preferences": [
    "String describing preference 1 in Indonesian",
    "String describing preference 2 in Indonesian"
  ],
  "ai_mistakes": [
    "String describing mistake/correction 1 in Indonesian",
    "String describing mistake/correction 2 in Indonesian"
  ],
  "long_term_memory": "An updated summary of key facts, goals, and behavioral patterns about the user. Merge new learnings with the existing memory: '${existingMemory}'."
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(text);

    // Format the summary for display in the mobile app dialog
    const formattedSummary = `👤 PREFERENSI ANDA:\n${(parsed.user_preferences || []).map((p: string) => `- ${p}`).join('\n') || '- (Tidak terdeteksi preferensi baru)'}\n\n🤖 EVALUASI & KOREKSI AI:\n${(parsed.ai_mistakes || []).map((m: string) => `- ${m}`).join('\n') || '- (Tidak terdeteksi keluhan/kesalahan AI)'}`;

    // 6. Save Memory back to User Profile
    const updatedMetadata = {
      ...metadata,
      long_term_memory: parsed.long_term_memory || existingMemory,
    };

    await supabaseAdmin
      .from('user_profiles')
      .update({ dynamic_metadata: updatedMetadata })
      .eq('id', userId);

    // 7. Delete Chat Messages from Supabase to start fresh
    const { error: deleteError } = await supabaseAdmin
      .from('app_chat_messages')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      console.error('Failed to clear chat messages from Supabase:', deleteError);
    }

    // 8. Cache the generated summary in ai_insights_cache for dashboard visibility
    await supabaseAdmin.from('ai_insights_cache').upsert(
      {
        user_id: userId,
        insight_type: 'chat_summary_insight',
        cached_reply: formattedSummary,
        sources_metadata: { processed_at: new Date().toISOString(), message_count: messages.length },
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      },
      { onConflict: 'user_id,insight_type' }
    );

    return NextResponse.json({
      success: true,
      summary: formattedSummary,
      message: 'Chat summarized, merged to long term memory, and cleared successfully.'
    });

  } catch (err: any) {
    console.error('Error in chat summarization endpoint:', err);
    return NextResponse.json(
      { error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
