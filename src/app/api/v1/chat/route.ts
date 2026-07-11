import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { verifyGatewayAndUser } from '@/lib/middleware/gateway';
import { scrubPII } from '@/lib/utils/scrubber';
import { supabaseAdmin } from '@/lib/services/supabase';
import { runStage1Extraction, runStage2Chat } from '@/lib/services/gemini';
import { handleToolCall, getDatabaseSchema } from '@/lib/tools/executor';
import { geminiToolDeclarations } from '@/lib/tools/database-tools';
import { getUserAnalysisPreferences, generatePreferencesContext } from '@/lib/services/analysis-preferences';

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

// Destructive command patterns that require human confirmation
const DESTRUCTIVE_PATTERNS = [
  { pattern: /hapus\s+(semua|seluruh|data\s+)?(keuangan|transaksi|tugas|chat|profile)/i, table: 'multiple', intent: 'delete' },
  { pattern: /hapus\s+semua/i, table: null, intent: 'delete' },
  { pattern: /delete\s+all/i, table: null, intent: 'delete' },
  { pattern: /hapus\s+data\s+(keuangan|transaksi)/i, table: 'money_trackers', intent: 'delete' },
  { pattern: /hapus\s+(semua\s+)?tugas/i, table: 'todo_lists', intent: 'delete' },
  { pattern: /hapus\s+(semua\s+)?chat/i, table: 'app_chat_messages', intent: 'delete' },
  { pattern: /reset\s+(semua|data)/i, table: 'multiple', intent: 'delete' },
  { pattern: /clear\s+(all|data)/i, table: null, intent: 'delete' },
  { pattern: /update\s+all/i, table: null, intent: 'update' },
  { pattern: /update\s+semua/i, table: null, intent: 'update' },
];

// Detect if message contains destructive command
function detectDestructiveCommand(message: string): { isDestructive: boolean; table: string | null; intent: string; statement: string } | null {
  for (const { pattern, table, intent } of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(message)) {
      let statement = '';
      const cleanMsg = message.toLowerCase();

      if (table === 'money_trackers' || cleanMsg.includes('keuangan') || cleanMsg.includes('transaksi')) {
        statement = `DELETE FROM money_trackers WHERE user_id = '{USER_ID_PLACEHOLDER}'`;
      } else if (table === 'todo_lists' || cleanMsg.includes('tugas')) {
        statement = `DELETE FROM todo_lists WHERE user_id = '{USER_ID_PLACEHOLDER}'`;
      } else if (table === 'app_chat_messages' || cleanMsg.includes('chat')) {
        statement = `DELETE FROM app_chat_messages WHERE user_id = '{USER_ID_PLACEHOLDER}'`;
      } else {
        statement = `DELETE FROM money_trackers WHERE user_id = '{USER_ID_PLACEHOLDER}'; DELETE FROM todo_lists WHERE user_id = '{USER_ID_PLACEHOLDER}'`;
      }

      return {
        isDestructive: true,
        table: table || 'multiple',
        intent,
        statement
      };
    }
  }
  return null;
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

    // ============================================================
    // DESTRUCTIVE COMMAND DETECTION
    // If user asks to delete/update all data, require confirmation
    // ============================================================
    const destructiveCheck = detectDestructiveCommand(message);

    if (destructiveCheck && destructiveCheck.isDestructive) {
      // Generate confirmation message
      const tableNames: Record<string, string> = {
        'money_trackers': 'semua data keuangan',
        'todo_lists': 'semua tugas',
        'app_chat_messages': 'semua chat',
        'multiple': 'semua data'
      };

      const tableKey = destructiveCheck.table || 'multiple';
      const actionText = destructiveCheck.intent === 'delete' ? 'HAPUS' : 'UPDATE';

      const confirmationMessage = `⚠️ PERHATIAN - AKSI DESTRUKTIF

Anda meminta: ${actionText} ${tableNames[tableKey] || 'data'}

Ini adalah aksi yang TIDAK DAPAT DIBATALKAN.

Untuk melanjutkan, klik tombol "Konfirmasi" di bawah.
Aksi akan dieksekusi setelah Anda konfirmasi.

Apakah Anda yakin ingin melanjutkan?`;

      // Return special response with confirmation flag
      return NextResponse.json({
        bubbles: [confirmationMessage],
        requires_confirmation: true,
        confirmation_data: {
          action_type: destructiveCheck.intent === 'delete' ? 'delete_all' : 'update_all',
          table_name: destructiveCheck.table,
          intent: destructiveCheck.intent,
          statement: destructiveCheck.statement,
          message: `Hapus ${tableNames[tableKey] || 'data'}`
        }
      });
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
    // INJECT DATABASE CONTEXT FOR AI TOOLS
    // ============================================================
    // Get current schema info for AI context
    const schemaInfo = await getDatabaseSchema();

    if (schemaInfo.success && schemaInfo.data) {
      const tables = schemaInfo.data.tables || [];
      let schemaContext = '\n\n┌──────────────────────────────────────────────────────────┐\n│  📊 DATABASE SCHEMA (Available Tables & Columns):         │\n│                                                          │';

      for (const table of tables.slice(0, 10)) { // Limit to first 10 tables
        const tableName = table.table_name;
        const columns = table.columns?.map((c: any) => `${c.column_name}(${c.data_type})`).join(', ') || '';
        if (columns) {
          schemaContext += `\n│  • ${tableName}: ${columns}`;
        }
      }
      schemaContext += '\n└──────────────────────────────────────────────────────────┘';

      // Add instruction about using tools
      schemaContext += `\n\nYou have access to database tools. You can use them when the user asks to:
  - See or analyze their transaction history
  - Check their tasks or todo lists
  - Update or modify their data
  - View statistics or summaries

IMPORTANT: When using tools:
  1. Use 'get_database_schema' first to understand table structures
  2. Use 'execute_database_query' for INSERT, UPDATE, DELETE operations
  3. Always be clear about what you're doing in your response
  4. Report success or errors from tool executions clearly`;

      personalityTemplate += schemaContext;
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

    // ============================================================
    // INJECT ANALYSIS PREFERENCES
    // ============================================================
    const analysisPrefs = await getUserAnalysisPreferences(userId);
    const analysisContext = generatePreferencesContext(analysisPrefs);
    if (analysisContext) {
      personalityTemplate += analysisContext;
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
          model: 'gemini-2.5-flash',
          contents: memoryPrompt,
        });
        const newMemory = memResult.text ?? '';

        const existingMemory = profile?.dynamic_metadata?.long_term_memory || '';
        let finalMemory = newMemory;

        // Only do merge if there's existing memory (saves 1 API call)
        if (existingMemory && existingMemory.length > 10) {
          const combinedPrompt = `Merge these two memory contexts into a single, concise, bulleted list of facts about the user. Remove duplicates.\n\nExisting:\n${existingMemory}\n\nNew:\n${newMemory}`;
          const combinedResult = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
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

    // 8. Stage 2 Chat styling with AI Tools
    let { bubbles, quota } = await runStage2Chat({
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

    // 8.1 AI Tool Calling - Check if AI wants to execute database operations
    // This runs in a loop to handle multiple tool calls
    const maxToolIterations = 3;
    for (let iteration = 0; iteration < maxToolIterations; iteration++) {
      // Build the AI request with tools
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

      // Create a prompt asking if the AI wants to use tools
      // SECURITY: Using whitelist-safe tool definitions (no raw SQL)
      const toolCheckPrompt = `
The user said: "${scrubbedMessage}"

Your previous response was: "${bubbles.join(' [BREAK] ')}"

Based on your personality instruction and the database schema available to you,
should you execute any database operations? If yes, specify which tool to use and with what parameters.

Available tools (USE THESE - no raw SQL allowed):
- get_database_schema: Get table structure info
- list_finance_records: List user's financial transactions (params: limit, type_filter, start_date, end_date)
- list_todo_items: List user's tasks (params: limit, status_filter)
- create_finance_record: Record a new transaction (params: type, amount, description, transaction_date)
- create_todo_item: Create a new task (params: task_name, due_date, priority)
- update_todo_status: Update task status (params: task_name, new_status)
- get_finance_summary: Get financial summary for date range (params: start_date, end_date)
- list_available_tables: List available tables

Respond in this JSON format ONLY (no other text):
{
  "should_use_tool": true/false,
  "tool_name": "list_finance_records" | "list_todo_items" | "create_finance_record" | "create_todo_item" | "update_todo_status" | "get_finance_summary" | null,
  "tool_args": { ... appropriate parameters based on tool_name ... },
  "reasoning": "Why you're using this tool"
}

DO NOT suggest tool usage for casual conversation or questions about general topics.
DO NOT use execute_database_query - it does not exist anymore for security reasons.`;
      let toolCallResult: any = null;
      let toolUsed = false;

      try {
        // Generate with tools available
        const modelResponse = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `The user said: "${scrubbedMessage}"\n\nYour previous response was: "${bubbles.join(' [BREAK] ')}"\n\nBased on your personality instruction and the database schema available to you, should you execute any database operations? If yes, specify which tool to use and with what parameters.\n\nAvailable tools (USE THESE - no raw SQL allowed):\n- get_database_schema: Get table structure info\n- list_finance_records: List user's financial transactions (params: limit, type_filter, start_date, end_date)\n- list_todo_items: List user's tasks (params: limit, status_filter)\n- create_finance_record: Record a new transaction (params: type, amount, description, transaction_date)\n- create_todo_item: Create a new task (params: task_name, due_date, priority)\n- update_todo_status: Update task status (params: task_name, new_status)\n- get_finance_summary: Get financial summary for date range (params: start_date, end_date)\n- list_available_tables: List available tables\n\nRespond in this JSON format ONLY (no other text):\n{\n  "should_use_tool": true/false,\n  "tool_name": "list_finance_records" | "list_todo_items" | "create_finance_record" | "create_todo_item" | "update_todo_status" | "get_finance_summary" | null,\n  "tool_args": { ... appropriate parameters based on tool_name ... },\n  "reasoning": "Why you're using this tool"\n}\n\nDO NOT suggest tool usage for casual conversation or questions about general topics.\nDO NOT use execute_database_query - it does not exist anymore for security reasons.`,
          config: {
            tools: [{ functionDeclarations: geminiToolDeclarations as any }],
            temperature: 0.1, // Low temperature for tool decisions
          },
        });

        // Check for function calls
        const functionCalls = (modelResponse as any).candidates?.[0]?.content?.parts;

        if (functionCalls && functionCalls.length > 0) {
          for (const part of functionCalls) {
            if (part.functionCall) {
              const toolName = part.functionCall.name;
              const toolArgs = part.functionCall.args || {};

              console.log(`[AI TOOL] Executing: ${toolName}`, toolArgs);

              // Execute the tool
              const result = await handleToolCall(toolName, toolArgs, userId);

              // Format result for AI context
              let resultSummary = '';
              if (result.success) {
                resultSummary = `✅ Success: ${JSON.stringify((result as any).data || (result as any).message || result)}`;
              } else {
                resultSummary = `❌ Error: ${result.error}`;
              }

              toolCallResult = {
                toolName,
                args: toolArgs,
                result: resultSummary
              };
              toolUsed = true;

              // Add tool result to bubbles
              bubbles.push(`\n\n📊 *Tool executed: ${toolName}*\n${resultSummary}`);

              break; // Only handle first tool call per iteration
            }
          }
        }
      } catch (err: any) {
        console.error('[AI TOOL] Error:', err);
        // Continue without tool - don't break the chat
      }

      // If no tool was used, break the loop
      if (!toolUsed) {
        break;
      }
    }

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
    return NextResponse.json({ bubbles, quota });
  } catch (err: any) {
    console.error('Error in Chat Endpoint:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
