import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/services/supabase';
import { GoogleGenAI } from '@google/genai';

// Initialize Gemini client helper
const getGenAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not defined in environment variables.');
  }
  return new GoogleGenAI({ apiKey });
};

const DELAY_BETWEEN_USERS_MS = 2000; // 2 seconds delay to avoid rate limiting
const ACTIVE_THRESHOLD_HOURS = 24; // Only process users active within this time

export async function POST(req: NextRequest) {
  // 1. Verify Gateway Key
  const gatewayKey = req.headers.get('x-jarvis-gateway-key');
  if (gatewayKey !== process.env.GATEWAY_KEY) {
    return NextResponse.json({ error: 'Unauthorized gateway access' }, { status: 401 });
  }

  try {
    const ai = getGenAI();

    // 2. Fetch all users with their last activity timestamp
    const { data: users, error: usersError } = await supabaseAdmin
      .from('user_profiles')
      .select('id, fullname, dynamic_metadata, assistant_name, user_nickname');

    if (usersError || !users) {
      console.error('Failed to retrieve users:', usersError);
      return NextResponse.json({ error: 'Failed to fetch users from database' }, { status: 500 });
    }

    // 3. Filter to only users active in the last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - ACTIVE_THRESHOLD_HOURS * 60 * 60 * 1000).toISOString();

    // Get last message timestamp for each user
    const userIds = users.map(u => u.id);
    const { data: lastMessages } = await supabaseAdmin
      .from('app_chat_messages')
      .select('user_id, created_at')
      .in('user_id', userIds)
      .gte('created_at', twentyFourHoursAgo);

    // Create a set of active user IDs
    const activeUserIds = new Set(lastMessages?.map(m => m.user_id) || []);

    // Also include users who opened the app recently (check dynamic_metadata for last_app_open)
    const recentlyActiveUsers = users.filter(user => {
      const meta = user.dynamic_metadata || {};
      const lastOpen = meta.last_app_open;
      if (lastOpen && new Date(lastOpen) > new Date(twentyFourHoursAgo)) {
        return true;
      }
      return activeUserIds.has(user.id);
    });

    console.log(`[LearningCycle] Found ${users.length} total users, ${recentlyActiveUsers.length} active in last ${ACTIVE_THRESHOLD_HOURS}h`);
    const results = [];

    for (const user of recentlyActiveUsers) {
      const userId = user.id;
      const metadata = user.dynamic_metadata || {};
      const existingMemory = metadata.long_term_memory || 'Belum ada memori jangka panjang terdaftar.';

      console.log(`[LearningCycle] Processing user ${userId.substring(0, 8)}...`);

      // Fetch user data in parallel
      const [transactionsResult, todosResult, chatMessagesResult] = await Promise.all([
        // Fetch money tracker data
        supabaseAdmin
          .from('money_trackers')
          .select('amount, type, description, transaction_date')
          .eq('user_id', userId)
          .order('transaction_date', { ascending: false })
          .limit(50),
        // Fetch to-do list data
        supabaseAdmin
          .from('todo_lists')
          .select('task_name, status, due_date, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50),
        // Fetch chat messages history (last 24 hours or last 30 messages)
        supabaseAdmin
          .from('app_chat_messages')
          .select('sender_id, sender_personality_id, message, created_at')
          .or(`and(room_id.is.null,user_id.eq.${userId}),and(room_id.not.is.null,sender_id.eq.${userId})`)
          .order('created_at', { ascending: false })
          .limit(30)
      ]);

      const transactions = transactionsResult.data || [];
      const todos = todosResult.data || [];
      const chatMessages = chatMessagesResult.data || [];

      const txsSummary = JSON.stringify(transactions);
      const todosSummary = JSON.stringify(todos);
      const chatsSummary = chatMessages
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
        const result = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: prompt,
          config: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        });
        const text = result.text ?? '';
        const parsed = JSON.parse(text);

        // Save Memory back to User Profile (Merge, not overwrite)
        const updatedMetadata = {
          ...metadata,
          long_term_memory: parsed.long_term_memory || existingMemory,
          last_learning_cycle: new Date().toISOString(),
        };

        // Save Heavy Insights into Insights Cache in parallel
        await Promise.all([
          supabaseAdmin
            .from('user_profiles')
            .update({ dynamic_metadata: updatedMetadata })
            .eq('id', userId),
          supabaseAdmin.from('ai_insights_cache').upsert(
            { user_id: userId, insight_type: 'runway_prediction', cached_reply: parsed.runway_prediction, sources_metadata: { processed_at: new Date().toISOString() }, expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() },
            { onConflict: 'user_id,insight_type' }
          ),
          supabaseAdmin.from('ai_insights_cache').upsert(
            { user_id: userId, insight_type: 'financial_risk_simulator', cached_reply: parsed.financial_risk_simulator, sources_metadata: { processed_at: new Date().toISOString() }, expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() },
            { onConflict: 'user_id,insight_type' }
          ),
          supabaseAdmin.from('ai_insights_cache').upsert(
            { user_id: userId, insight_type: 'burnout_detection_engine', cached_reply: parsed.burnout_detection_engine, sources_metadata: { processed_at: new Date().toISOString() }, expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() },
            { onConflict: 'user_id,insight_type' }
          ),
          supabaseAdmin.from('ai_insights_cache').upsert(
            { user_id: userId, insight_type: 'mood_vs_spending', cached_reply: parsed.mood_vs_spending, sources_metadata: { processed_at: new Date().toISOString() }, expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() },
            { onConflict: 'user_id,insight_type' }
          ),
          supabaseAdmin.from('ai_insights_cache').upsert(
            { user_id: userId, insight_type: 'mood_vs_productivity', cached_reply: parsed.mood_vs_productivity, sources_metadata: { processed_at: new Date().toISOString() }, expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() },
            { onConflict: 'user_id,insight_type' }
          ),
          supabaseAdmin.from('ai_insights_cache').upsert(
            { user_id: userId, insight_type: 'trend_worth_it_score', cached_reply: parsed.trend_worth_it_score, sources_metadata: { processed_at: new Date().toISOString() }, expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() },
            { onConflict: 'user_id,insight_type' }
          )
        ]);

        results.push({ userId, status: 'success' });
        console.log(`[LearningCycle] ✓ Completed for user ${userId.substring(0, 8)}`);

        // 2 second delay between users to avoid rate limiting
        if (recentlyActiveUsers.indexOf(user) < recentlyActiveUsers.length - 1) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_USERS_MS));
        }
      } catch (err: any) {
        console.error(`[LearningCycle] ✗ Failed for user ${userId.substring(0, 8)}:`, err);
        results.push({ userId, status: 'error', error: err.message || err });
      }
    }

    return NextResponse.json({
      message: 'Continuous learning cycle completed',
      totalUsers: users.length,
      activeUsersProcessed: recentlyActiveUsers.length,
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
