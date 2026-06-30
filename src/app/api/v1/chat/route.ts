import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { verifyGatewayAndUser } from '@/lib/middleware/gateway';
import { scrubPII } from '@/lib/utils/scrubber';
import { supabaseAdmin } from '@/lib/services/supabase';
import { runStage1Extraction, runStage2Chat } from '@/lib/services/gemini';

// Simple in-memory rate limiter (5 requests per minute per user)
// With automatic cleanup to prevent memory leak
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_ENTRIES = 10000;
let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Cleanup every 5 minutes

// In-memory cache for LTM processing timestamps (userId -> lastProcessedAt)
const ltmProcessCache = new Map<string, number>();
const LTM_PROCESS_INTERVAL_MS = 60 * 60 * 1000; // 1 hour minimum between LTM processing per user

function cleanupOldEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;

  let cleaned = 0;
  for (const [userId, timestamps] of rateLimitMap.entries()) {
    const validTimestamps = timestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
    if (validTimestamps.length === 0) {
      rateLimitMap.delete(userId);
      cleaned++;
    } else {
      rateLimitMap.set(userId, validTimestamps);
    }
  }
  lastCleanup = now;
  if (cleaned > 0) {
    console.log(`Rate limiter cleanup: removed ${cleaned} stale entries. Active entries: ${rateLimitMap.size}`);
  }
}

function checkRateLimit(userId: string): boolean {
  const now = Date.now();

  // Periodic cleanup
  if (rateLimitMap.size > RATE_LIMIT_MAX_ENTRIES || now - lastCleanup > CLEANUP_INTERVAL_MS) {
    cleanupOldEntries();
  }

  if (!rateLimitMap.has(userId)) {
    rateLimitMap.set(userId, [now]);
    return true;
  }

  const timestamps = rateLimitMap.get(userId)!;
  const validTimestamps = timestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);

  if (validTimestamps.length >= 5) {
    return false;
  }

  validTimestamps.push(now);
  rateLimitMap.set(userId, validTimestamps);
  return true;
}

function shouldRunExtraction(message: string): boolean {
  const clean = message.toLowerCase();
  const keywords = [
    'catat', 'beli', 'tugas', 'tambah', 'pemasukan', 'pengeluaran', 'mood', 'capek', 'habis',
    'bayar', 'transfer', 'uang', 'rupiah', 'rp', 'gaji', 'belanja', 'makan', 'minum', 'selesai',
    'agenda', 'jadwal', 'todo', 'to-do', 'kelar', 'ziarah', 'kubur'
  ];
  return keywords.some(kw => clean.includes(kw));
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
    const { message, room_id, language, timezone } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Get user timezone from request or default to Asia/Jakarta
    const userTimezone = timezone || 'Asia/Jakarta';

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

    // 5. Parallel fetch: User Profile, selected personality, AND chat preferences
    const [profileResult, chatPrefsResult] = await Promise.all([
      supabaseAdmin
        .from('user_profiles')
        .select('fullname, selected_personality, assistant_name, user_nickname, dynamic_metadata')
        .eq('id', userId)
        .maybeSingle(),
      supabaseAdmin
        .from('chat_preferences')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
    ]);

    let profile = profileResult.data;
    const chatPrefs = chatPrefsResult.data;

    if (!profile) {
      // Create a default profile if it doesn't exist yet
      const { data: newProfile, error: profileCreateError } = await supabaseAdmin
        .from('user_profiles')
        .insert({
          id: userId,
          fullname: 'Sobat Baru',
          selected_personality: 'witty_sidekick',
          assistant_name: 'Personal Asistan',
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
        assistant_name: 'Personal Asistan',
        user_nickname: 'Sobat',
        dynamic_metadata: {},
      };
    }

    const personalityId = profile?.selected_personality || 'witty_sidekick';
    const assistantName = profile?.assistant_name || 'Personal Asistan';
    const userNickname = profile?.user_nickname || 'Sobat';

    // Get personality template (after we know personalityId)
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

    // ============================================================
    // INJECT LEARNED PREFERENCES (Skema 1 + Hybrid)
    // ============================================================
    if (chatPrefs) {
      let prefsInstruction = '\n\n┌──────────────────────────────────────────────────────────┐\n│  🎯 LEARNED PREFERENCES ABOUT THIS USER:                   │';

      // Communication style
      if (chatPrefs.communication_style && chatPrefs.communication_style !== 'mix') {
        prefsInstruction += `\n│  • Gaya komunikasi: ${chatPrefs.communication_style.toUpperCase()}`;
      }

      // Explanation style
      if (chatPrefs.explanation_style === 'brief') {
        prefsInstruction += '\n│  • Penjelasan: SINGKAT & TO THE POINT';
      } else if (chatPrefs.explanation_style === 'detailed') {
        prefsInstruction += '\n│  • Penjelasan: DETAIL dengan contoh';
      }

      // Frequent topics
      if (chatPrefs.topic_frequencies && Object.keys(chatPrefs.topic_frequencies).length > 0) {
        const topTopics = Object.entries(chatPrefs.topic_frequencies)
          .sort((a, b) => (b[1] as number) - (a[1] as number))
          .slice(0, 5)
          .map(([topic, count]) => `${topic} (${count}x)`)
          .join(', ');
        if (topTopics) {
          prefsInstruction += `\n│  • Topik favorit: ${topTopics}`;
        }
      }

      // Emoji preference
      if (chatPrefs.prefers_emoji === false) {
        prefsInstruction += '\n│  • Hindari emoji, gunakan teks saja';
      }

      // Lists preference
      if (chatPrefs.prefers_lists === true) {
        prefsInstruction += '\n│  • Gunakan LIST/POIN jika ada beberapa hal';
      }

      // Avoided words
      if (chatPrefs.avoided_words && chatPrefs.avoided_words.length > 0) {
        prefsInstruction += `\n│  • Hindari kata-kata: ${chatPrefs.avoided_words.slice(0, 3).join(', ')}`;
      }

      prefsInstruction += '\n└──────────────────────────────────────────────────────────┘';
      personalityTemplate += prefsInstruction;
    }

    const temperature = Number(personality?.temperature ?? 0.3);
    const topP = Number(personality?.top_p ?? 0.95);

    // 5.5. Long Term Memory Processing Pipeline (BATCHED - runs max once per hour per user)
    const processLongTermMemory = async () => {
      // Check if we should skip LTM processing (too soon since last run)
      const now = Date.now();
      const lastProcessed = ltmProcessCache.get(userId) || 0;

      if (now - lastProcessed < LTM_PROCESS_INTERVAL_MS) {
        console.log(`[LTM] Skipping - processed recently for user ${userId.substring(0, 8)}`);
        return;
      }

      // Check if there are old messages to process (messages older than 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { data: oldMsgs } = await supabaseAdmin
        .from('app_chat_messages')
        .select('id, message, sender_personality_id, created_at')
        .eq('user_id', userId)
        .is('room_id', null)
        .lt('created_at', sevenDaysAgo.toISOString())
        .limit(50);

      if (!oldMsgs || oldMsgs.length === 0) {
        console.log(`[LTM] No old messages to process for user ${userId.substring(0, 8)}`);
        return;
      }

      // Update cache timestamp BEFORE processing to prevent concurrent runs
      ltmProcessCache.set(userId, now);

      try {
        console.log(`[LTM] Processing ${oldMsgs.length} old messages for user ${userId.substring(0, 8)}`);
        const oldChatText = oldMsgs.map(m => `${m.sender_personality_id ? assistantName : userNickname}: ${m.message}`).join('\n');
        const memoryPrompt = `Extract key facts, user preferences, events, and important context from this chat history to build long-term memory for an AI assistant. Keep it concise in bullet points.\n\nChat:\n${oldChatText}`;

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

        const memResult = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: memoryPrompt,
        });
        const newMemory = memResult.text ?? '';

        const existingMemory = profile?.dynamic_metadata?.long_term_memory || '';
        let finalMemory = newMemory;

        // Only do merge if there's existing memory (saves 1 API call)
        if (existingMemory && existingMemory.length > 10) {
          const combinedPrompt = `Merge these two memory contexts into a single, concise, bulleted list of facts about the user. Remove duplicates.\n\nExisting:\n${existingMemory}\n\nNew:\n${newMemory}`;
          const combinedResult = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: combinedPrompt,
          });
          finalMemory = combinedResult.text ?? '';
        }

        // Batch update: profile + delete messages in parallel
        await Promise.all([
          supabaseAdmin.from('user_profiles').update({
            dynamic_metadata: { ...(profile?.dynamic_metadata || {}), long_term_memory: finalMemory }
          }).eq('id', userId),
          supabaseAdmin.from('app_chat_messages').delete().in('id', oldMsgs.map(m => m.id))
        ]);

        console.log(`[LTM] Completed for user ${userId.substring(0, 8)}`);
      } catch (err) {
        console.error('[LTM] Processing error:', err);
        // Reset cache on error so it can retry next time
        ltmProcessCache.delete(userId);
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
    const extractedData = shouldRunExtraction(scrubbedMessage)
      ? await runStage1Extraction(scrubbedMessage)
      : { transactions: [], tasks: [], task_updates: [], moods: [], habits: [] };

    // Process Stage 1 results: insert transactions
    if (extractedData.transactions && extractedData.transactions.length > 0) {
      const dbTransactions = extractedData.transactions.map((tx) => {
        const record: any = {
          user_id: userId,
          amount: tx.amount,
          type: tx.type,
          description: tx.description,
        };

        // Add transaction_date if provided by extraction
        if (tx.transaction_date) {
          record.transaction_date = tx.transaction_date;
        }

        // Add jam (time) to dynamic_metadata if provided
        if (tx.jam) {
          record.dynamic_metadata = { jam: tx.jam };
        }

        return record;
      });
      await supabaseAdmin.from('money_trackers').insert(dbTransactions);
    }

    // Process Stage 1 results: insert tasks
    if (extractedData.tasks && extractedData.tasks.length > 0) {
      const dbTasks = extractedData.tasks.map((task) => {
        const record: any = {
          user_id: userId,
          task_name: task.task_name,
          status: task.status || 'pending',
          due_date: task.due_date || null,
        };

        // Add jam (time) to dynamic_metadata if provided
        if (task.jam) {
          record.dynamic_metadata = { ...record.dynamic_metadata, jam: task.jam };
        }

        // Add waktu_mulai (start time) - NEW FIELD per user request
        if (task.waktu_mulai) {
          record.waktu_mulai = task.waktu_mulai;
        }

        // Add pengingat (reminder) - NEW FIELD per user request
        if (task.pengingat) {
          record.pengingat = task.pengingat;
        }

        return record;
      });
      await supabaseAdmin.from('todo_lists').insert(dbTasks);
    }

    // Process Stage 1 results: UPDATE existing tasks status
    // This handles requests like "selesaikan semua tugas saya" or "tandai X jadi selesai"
    if (extractedData.task_updates && extractedData.task_updates.length > 0) {
      const updateResults: { taskName: string; newStatus: string; updated: number }[] = [];

      for (const update of extractedData.task_updates) {
        const taskNameLower = update.task_name.toLowerCase();

        // Special case: "match all" or "semua" means update all pending tasks
        if (taskNameLower === 'match all existing pending tasks' ||
            taskNameLower === 'all' ||
            taskNameLower === 'semua' ||
            taskNameLower === 'semuanya' ||
            taskNameLower.includes('semua') && taskNameLower.includes('tugas')) {

          // Update ALL pending tasks to the new status
          const { data: allPending, error: fetchError } = await supabaseAdmin
            .from('todo_lists')
            .select('id, task_name')
            .eq('user_id', userId)
            .eq('status', 'pending');

          if (!fetchError && allPending && allPending.length > 0) {
            const idsToUpdate = allPending.map((t: any) => t.id);
            await supabaseAdmin
              .from('todo_lists')
              .update({ status: update.new_status })
              .in('id', idsToUpdate);

            updateResults.push({
              taskName: `${allPending.length} tugas`,
              newStatus: update.new_status,
              updated: allPending.length
            });
          }
        } else {
          // Find and update specific task by name (partial match, case-insensitive)
          const { data: matchingTasks, error: matchError } = await supabaseAdmin
            .from('todo_lists')
            .select('id, task_name')
            .eq('user_id', userId)
            .ilike('task_name', `%${update.task_name}%`);

          if (!matchError && matchingTasks && matchingTasks.length > 0) {
            // Update the first matching task (or all if multiple)
            const idsToUpdate = matchingTasks.map((t: any) => t.id);
            await supabaseAdmin
              .from('todo_lists')
              .update({ status: update.new_status })
              .in('id', idsToUpdate);

            updateResults.push({
              taskName: matchingTasks[0].task_name,
              newStatus: update.new_status,
              updated: matchingTasks.length
            });
          }
        }
      }

      // Store update results for response message
      if (updateResults.length > 0) {
        (extractedData as any).taskUpdateResults = updateResults;
      }
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
      userTimezone: userTimezone,
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

    // ============================================================
    // BACKGROUND LEARNING ENGINE (Skema 1 + Hybrid)
    // Analyze user message and update chat_preferences
    // ============================================================
    const runLearningEngine = async () => {
      try {
        // A. Topic Detection (simple keyword-based)
        const topicKeywords: Record<string, string[]> = {
          'keuangan': ['uang', 'rupiah', 'rp', 'gaji', 'transaksi', 'belanja', 'budget', 'hemat', 'tabungan', 'kredit', 'hutang'],
          'kesehatan': ['sehat', 'olahraga', 'diet', 'makan', 'tidur', 'sakit', 'obat', 'vitamin', 'fitnes', 'gym'],
          'pekerjaan': ['kerja', 'kantor', 'meeting', 'deadline', 'bos', 'karyawan', 'proyek', 'presentasi', 'email'],
          'pendidikan': ['belajar', 'kursus', 'ujian', 'sekolah', 'kuliah', 'buku', 'materi', 'tugas', 'dosen', 'guru'],
          'hubungan': ['keluarga', 'pacar', 'teman', 'pasangan', 'orang tua', 'siblings', 'komunikasi', 'masalah'],
          'produktivitas': ['todo', 'tugas', 'deadline', 'fokus', '拖延', 'efektif', 'manage', 'organisir'],
          'hiburan': ['film', 'game', 'musik', 'nonton', 'buku', 'series', 'anime', 'drama', 'hobi'],
          'motivasi': ['semangat', 'motivasi', 'inspirasi', 'sukses', 'gagal', 'tips', 'sukses'],
        };

        const messageLower = message.toLowerCase();
        let detectedTopics: string[] = [];

        for (const [topic, keywords] of Object.entries(topicKeywords)) {
          if (keywords.some(kw => messageLower.includes(kw))) {
            detectedTopics.push(topic);
          }
        }

        // B. Calculate message metrics
        const wordCount = message.trim().split(/\s+/).length;
        const hasEmoji = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(message);
        const hasLists = /^\d+[.)]|[-•*]\s/m.test(message);

        // C. Determine communication style (simple heuristic)
        let commStyle = 'mix';
        const formalWords = ['anda', 'saya', 'terima kasih', 'mohon', 'dengan hormat'];
        const casualWords = ['gue', 'lu', 'gw', 'bang', 'bos', 'siapa tau', 'santai'];
        const formalCount = formalWords.filter(w => messageLower.includes(w)).length;
        const casualCount = casualWords.filter(w => messageLower.includes(w)).length;

        if (formalCount > casualCount && formalCount >= 2) {
          commStyle = 'formal';
        } else if (casualCount > formalCount && casualCount >= 2) {
          commStyle = 'casual';
        }

        // D. Build update object
        const updateData: Record<string, any> = {
          total_chats: (chatPrefs?.total_chats || 0) + 1,
          last_chat_at: new Date().toISOString(),
          avg_message_length: chatPrefs?.avg_message_length
            ? Math.round((chatPrefs.avg_message_length + wordCount) / 2)
            : wordCount,
        };

        // Update topic frequencies
        if (detectedTopics.length > 0) {
          const currentFreqs = (chatPrefs?.topic_frequencies as Record<string, number>) || {};
          const newFreqs = { ...currentFreqs };
          detectedTopics.forEach(topic => {
            newFreqs[topic] = (newFreqs[topic] || 0) + 1;
          });
          updateData.topic_frequencies = newFreqs;
        }

        // Update communication style (only if confident)
        if (commStyle !== 'mix' && chatPrefs?.communication_style === 'mix') {
          // Only update if user consistently uses same style (after 5 chats)
          const totalChats = (chatPrefs?.total_chats || 0) + 1;
          if (totalChats >= 5) {
            updateData.communication_style = commStyle;
          }
        }

        // Update preferences (track over time)
        if (hasEmoji !== (chatPrefs?.prefers_emoji ?? true)) {
          updateData.prefers_emoji = hasEmoji;
        }
        if (hasLists !== (chatPrefs?.prefers_lists ?? false)) {
          updateData.prefers_lists = hasLists;
        }

        // E. Execute update
        await supabaseAdmin
          .from('chat_preferences')
          .update(updateData)
          .eq('user_id', userId);

        console.log(`[LEARNING] Updated preferences for user ${userId.substring(0, 8)}: topics=${detectedTopics.join(',') || 'none'}`);
      } catch (err) {
        console.error('[LEARNING] Error:', err);
      }
    };

    // Run learning in background (don't await)
    runLearningEngine().catch(console.error);

    // 10. Return response bubbles
    return NextResponse.json({ bubbles });
  } catch (err: any) {
    console.error('Error in Chat Endpoint:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
