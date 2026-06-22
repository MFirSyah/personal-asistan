import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/services/supabase';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini client helper
const getGenAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not defined in environment variables.');
  }
  return new GoogleGenerativeAI(apiKey);
};

export async function POST(req: NextRequest) {
  // 1. Verify Gateway Key
  const gatewayKey = req.headers.get('x-jarvis-gateway-key');
  if (gatewayKey !== process.env.GATEWAY_KEY) {
    return NextResponse.json({ error: 'Unauthorized gateway access' }, { status: 401 });
  }

  try {
    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    });

    // 2. Fetch all users in the system to run the batch process
    const { data: users, error: usersError } = await supabaseAdmin
      .from('user_profiles')
      .select('id, fullname, dynamic_metadata, assistant_name, user_nickname');

    if (usersError || !users) {
      console.error('Failed to retrieve users:', usersError);
      return NextResponse.json({ error: 'Failed to fetch users from database' }, { status: 500 });
    }

    console.log(`Starting continuous learning cycle for ${users.length} users...`);
    const results = [];

    for (const user of users) {
      const userId = user.id;
      const metadata = user.dynamic_metadata || {};
      const existingMemory = metadata.long_term_memory || 'Belum ada memori jangka panjang terdaftar.';

      // Fetch money tracker data
      const { data: transactions } = await supabaseAdmin
        .from('money_trackers')
        .select('amount, type, description, transaction_date')
        .eq('user_id', userId)
        .order('transaction_date', { ascending: false })
        .limit(50);

      // Fetch to-do list data
      const { data: todos } = await supabaseAdmin
        .from('todo_lists')
        .select('task_name, status, due_date, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      // Fetch chat messages history (last 24 hours or last 30 messages)
      const { data: chatMessages } = await supabaseAdmin
        .from('app_chat_messages')
        .select('sender_id, sender_personality_id, message, created_at')
        .or(`room_id.is.null,and(sender_id.eq.${userId})`) // select private chat or user messages
        .order('created_at', { ascending: false })
        .limit(30);

      const txsSummary = JSON.stringify(transactions || []);
      const todosSummary = JSON.stringify(todos || []);
      const chatsSummary = (chatMessages || [])
        .reverse()
        .map((m) => `${m.sender_personality_id ? 'AI' : 'User'}: ${m.message}`)
        .join('\n');

      const prompt = `You are the Core Cognitive Engine for this AI Personal Assistant. You must analyze the user's logs and generate 6 analytics reports (each written as an engaging, personalized paragraph in Indonesian) and update their long-term memory.

User Info:
- Name: ${user.fullname}
- Assistant Name: ${user.assistant_name}
- Nickname: ${user.user_nickname}
- Current Long-term Memory: "${existingMemory}"

User Logs (Last 24-48 Hours):
- Money Tracker Transactions: ${txsSummary}
- To-Do Tasks: ${todosSummary}
- Chat Conversation Log:
${chatsSummary}

Analyze this data and generate a JSON response with the following keys:
1. 'runway_prediction': Estimating how long the user's money will last based on historical cash flow and average daily spend. Be conversational but analytical.
2. 'financial_risk_simulator': Identifying stability threats or high-risk spending behaviors.
3. 'burnout_detection_engine': Identifying fatigue, stress patterns, or work overload based on pending tasks and chat tone.
4. 'mood_vs_spending': Correlating user feelings/chats with financial expenditures.
5. 'mood_vs_productivity': Correlating user mood/chats with task completion.
6. 'trend_worth_it_score': Auditing if recent expense descriptions align with long-term goals or are wasteful.
7. 'long_term_memory': An updated summary of key facts, goals, and behavioral patterns about the user. Please MERGE new learnings with the existing memory: "${existingMemory}". Do not overwrite completely; maintain important previous facts.

Format response strictly in JSON:
{
  "runway_prediction": "...",
  "financial_risk_simulator": "...",
  "burnout_detection_engine": "...",
  "mood_vs_spending": "...",
  "mood_vs_productivity": "...",
  "trend_worth_it_score": "...",
  "long_term_memory": "..."
}
Do not include any extra text.`;

      try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const parsed = JSON.parse(text);

        // 3. Save Memory back to User Profile (Merge, not overwrite)
        const updatedMetadata = {
          ...metadata,
          long_term_memory: parsed.long_term_memory || existingMemory,
        };

        await supabaseAdmin
          .from('user_profiles')
          .update({ dynamic_metadata: updatedMetadata })
          .eq('id', userId);

        // 4. Save Heavy Insights into Insights Cache
        const upsertCache = async (type: string, reply: string) => {
          return supabaseAdmin.from('ai_insights_cache').upsert(
            {
              user_id: userId,
              insight_type: type,
              cached_reply: reply,
              sources_metadata: { processed_at: new Date().toISOString() },
              expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            },
            { onConflict: 'user_id,insight_type' }
          );
        };

        await Promise.all([
          upsertCache('runway_prediction', parsed.runway_prediction),
          upsertCache('financial_risk_simulator', parsed.financial_risk_simulator),
          upsertCache('burnout_detection_engine', parsed.burnout_detection_engine),
          upsertCache('mood_vs_spending', parsed.mood_vs_spending),
          upsertCache('mood_vs_productivity', parsed.mood_vs_productivity),
          upsertCache('trend_worth_it_score', parsed.trend_worth_it_score),
        ]);

        results.push({ userId, status: 'success' });
      } catch (err: any) {
        console.error(`Failed to process user ${userId}:`, err);
        results.push({ userId, status: 'error', error: err.message || err });
      }
    }

    return NextResponse.json({
      message: 'Continuous learning cycle completed',
      results,
    });
  } catch (err: any) {
    console.error('Error in learning cycle endpoint:', err);
    return NextResponse.json(
      { error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
