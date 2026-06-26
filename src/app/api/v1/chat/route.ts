import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';
import { verifyGatewayAndUser } from '@/lib/middleware/gateway';
import { scrubPII } from '@/lib/utils/scrubber';
import { supabaseAdmin } from '@/lib/services/supabase';
import { runStage1Extraction, runStage2Chat } from '@/lib/services/gemini';

// Simple in-memory rate limiter (5 requests per minute per user)
const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 5;

  if (!rateLimitMap.has(userId)) {
    rateLimitMap.set(userId, [now]);
    return true;
  }

  const timestamps = rateLimitMap.get(userId)!;
  const validTimestamps = timestamps.filter(ts => now - ts < windowMs);
  
  if (validTimestamps.length >= maxRequests) {
    return false;
  }

  validTimestamps.push(now);
  rateLimitMap.set(userId, validTimestamps);
  return true;
}

export async function POST(req: NextRequest) {
  // 1. Authenticate Request (Gateway & JWT Verification)
  const authResult = await verifyGatewayAndUser(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = authResult;

  // Rate Limiting: Max 5 requests per minute
  if (!checkRateLimit(userId)) {
    return NextResponse.json(
      { error: 'Terlalu banyak permintaan. Maksimal 5 pesan per menit.' },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const { message, room_id, language } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const roomId = room_id || null;

    // 2. Room membership check (for group chat)
    if (roomId) {
      const { data: member, error: memberError } = await supabaseAdmin
        .from('app_room_members')
        .select('id')
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .maybeSingle();

      if (memberError || !member) {
        return NextResponse.json(
          { error: 'Forbidden: You are not a member of this chat room' },
          { status: 403 }
        );
      }
    }

    // 3. PII Scrubbing
    const scrubbedMessage = scrubPII(message);

    // 4. Save User Message to Database (using Admin Client)
    const { error: insertUserMsgError } = await supabaseAdmin
      .from('app_chat_messages')
      .insert({
        room_id: roomId,
        sender_id: userId,
        user_id: userId,
        sender_personality_id: null,
        message: scrubbedMessage,
      });

    if (insertUserMsgError) {
      console.error('Failed to insert user message:', insertUserMsgError);
      return NextResponse.json(
        { error: 'Database error writing message' },
        { status: 500 }
      );
    }

    // 5. Fetch User Profile & selected personality
    let { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('fullname, selected_personality, assistant_name, user_nickname, dynamic_metadata')
      .eq('id', userId)
      .maybeSingle();

    if (!profile) {
      // Create a default profile if it doesn't exist yet
      const { data: newProfile, error: profileCreateError } = await supabaseAdmin
        .from('user_profiles')
        .insert({
          id: userId,
          fullname: 'Sobat Baru',
          selected_personality: 'witty_sidekick',
          assistant_name: 'Sobat AI',
          user_nickname: 'Sobat',
        })
        .select()
        .single();

      if (profileCreateError) {
        console.error('Profile auto-creation failed:', profileCreateError);
      }
      profile = newProfile || {
        fullname: 'Sobat Baru',
        selected_personality: 'witty_sidekick',
        assistant_name: 'Sobat AI',
        user_nickname: 'Sobat',
        dynamic_metadata: {},
      };
    }

    const personalityId = profile?.selected_personality || 'witty_sidekick';
    const assistantName = profile?.assistant_name || 'Sobat AI';
    const userNickname = profile?.user_nickname || 'Sobat';

    // Get personality template
    const { data: personality } = await supabaseAdmin
      .from('ai_personalities')
      .select('system_instruction_template, temperature, top_p')
      .eq('id', personalityId)
      .single();

    let personalityTemplate =
      personality?.system_instruction_template ||
      'Kamu adalah {assistant_name}, asisten pribadi {user_nickname}.';

    // Inject language instruction
    if (language === 'en') {
      personalityTemplate += '\n\nIMPORTANT INSTRUCTION: Please strictly respond in English, but keep the personality vibe.';
    } else {
      personalityTemplate += '\n\nIMPORTANT INSTRUCTION: Please strictly respond in Indonesian (Bahasa Indonesia), keeping the personality vibe.';
    }
    
    // Inject Long Term Memory if it exists
    if (profile?.dynamic_metadata?.long_term_memory) {
      personalityTemplate += `\n\nLONG TERM MEMORY ABOUT USER (Use this context if relevant, but do not mention it explicitly unless asked):\n${profile.dynamic_metadata.long_term_memory}`;
    }

    const temperature = Number(personality?.temperature ?? 0.3);
    const topP = Number(personality?.top_p ?? 0.95);

    // 5.5. Long Term Memory Processing Pipeline (Async)
    const processLongTermMemory = async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { data: oldMsgs } = await supabaseAdmin
        .from('app_chat_messages')
        .select('id, message, sender_personality_id, created_at')
        .eq('user_id', userId)
        .is('room_id', null)
        .lt('created_at', sevenDaysAgo.toISOString())
        .limit(50);
        
      if (oldMsgs && oldMsgs.length > 0) {
        try {
          const oldChatText = oldMsgs.map(m => `${m.sender_personality_id ? assistantName : userNickname}: ${m.message}`).join('\n');
          const memoryPrompt = `Extract key facts, user preferences, events, and important context from this chat history to build long-term memory for an AI assistant. Keep it concise in bullet points.\n\nChat:\n${oldChatText}`;
          
          const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
          const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
          
          const result = await model.generateContent(memoryPrompt);
          const newMemory = result.response.text();
          
          const existingMemory = profile?.dynamic_metadata?.long_term_memory || '';
          let finalMemory = newMemory;
          
          if (existingMemory) {
            const combinedPrompt = `Merge these two memory contexts into a single, concise, bulleted list of facts about the user. Remove duplicates.\n\nExisting:\n${existingMemory}\n\nNew:\n${newMemory}`;
            const combinedResult = await model.generateContent(combinedPrompt);
            finalMemory = combinedResult.response.text();
          }
          
          await supabaseAdmin.from('user_profiles').update({
            dynamic_metadata: { ...(profile?.dynamic_metadata || {}), long_term_memory: finalMemory }
          }).eq('id', userId);
          
          const idsToDelete = oldMsgs.map(m => m.id);
          await supabaseAdmin.from('app_chat_messages').delete().in('id', idsToDelete);
        } catch (err) {
          console.error('LTM processing error:', err);
        }
      }
    };
    
    // We don't await this to keep the chat response fast.
    processLongTermMemory().catch(console.error);

    // 6. Fetch recent chat history
    let query = supabaseAdmin
      .from('app_chat_messages')
      .select('sender_id, sender_personality_id, message, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    if (roomId) {
      query = query.eq('room_id', roomId);
    } else {
      query = query.is('room_id', null).eq('user_id', userId);
    }

    const { data: historyData } = await query;
    const history = (historyData || [])
      .reverse()
      .map((msg) => ({
        role: (msg.sender_personality_id ? 'model' : 'user') as 'model' | 'user',
        parts: msg.message,
      }));

    // 7. Stage 1 Extraction
    const extractedData = await runStage1Extraction(scrubbedMessage);

    // Process Stage 1 results: insert transactions
    if (extractedData.transactions && extractedData.transactions.length > 0) {
      const dbTransactions = extractedData.transactions.map((tx) => ({
        user_id: userId,
        amount: tx.amount,
        type: tx.type,
        description: tx.description,
      }));
      await supabaseAdmin.from('money_trackers').insert(dbTransactions);
    }

    // Process Stage 1 results: insert tasks
    if (extractedData.tasks && extractedData.tasks.length > 0) {
      const dbTasks = extractedData.tasks.map((task) => ({
        user_id: userId,
        task_name: task.task_name,
        status: task.status || 'pending',
        due_date: task.due_date || null,
      }));
      await supabaseAdmin.from('todo_lists').insert(dbTasks);
    }

    // 8. Stage 2 Chat styling
    const bubbles = await runStage2Chat({
      userMessage: scrubbedMessage,
      userNickname,
      assistantName,
      personalityInstruction: personalityTemplate,
      temperature,
      topP,
      extractedData,
      chatHistory: history,
    });

    // 9. Save AI Response to Database
    const fullResponse = bubbles.join(' [BREAK] ');
    await supabaseAdmin.from('app_chat_messages').insert({
      room_id: roomId,
      sender_id: null,
      user_id: userId,
      sender_personality_id: personalityId,
      message: fullResponse,
    });

    // 10. Return response bubbles
    return NextResponse.json({ bubbles });
  } catch (err: any) {
    console.error('Error in Chat Endpoint:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
