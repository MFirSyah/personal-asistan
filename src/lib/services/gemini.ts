import { GoogleGenAI } from '@google/genai';
import * as Sentry from '@sentry/nextjs';

// Initialize the Gemini API client (new unified SDK)
const getGenAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not defined in environment variables.');
  }
  return new GoogleGenAI({ apiKey });
};

// Helper function to format date with user's timezone
export function formatDateForUser(timezone: string = 'Asia/Jakarta') {
  const now = new Date();
  return {
    date: now.toLocaleDateString('id-ID', {
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }),
    time: now.toLocaleTimeString('id-ID', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit'
    }),
    timezone: timezone,
    isoString: now.toISOString()
  };
}

export interface ExtractedData {
  transactions: Array<{
    amount: number;
    type: 'income' | 'expense';
    description: string;
    transaction_date?: string; // Format: YYYY-MM-DD
    jam?: string; // Format: HH:MM (24-hour format)
  }>;
  tasks: Array<{
    task_name: string;
    due_date?: string; // ISO string (Tenggat Waktu / Deadline)
    status: 'pending' | 'completed' | 'cancelled'; // NEW: Support all statuses
    jam?: string; // Format: HH:MM (24-hour format)
    waktu_mulai?: string; // ISO string (Waktu Mulai / Start Time) - sesuai request AI chat
    pengingat?: string; // ISO string (Pengingat / Reminder) - sesuai request AI chat
  }>;
  // NEW: Task updates - for updating existing tasks
  task_updates: Array<{
    task_name: string; // Name to match existing task
    new_status: 'pending' | 'completed' | 'cancelled';
    notes?: string; // Optional notes
  }>;
  moods: Array<{
    mood: string;
    description: string;
  }>;
  habits: Array<{
    habit_name: string;
    description: string;
  }>;
}

/**
 * Stage 1: Extracts structured data from user message with Temp 0.0.
 */
export async function runStage1Extraction(
  userMessage: string,
  currentDateStr: string = new Date().toISOString()
): Promise<ExtractedData> {
  const ai = getGenAI();

  const prompt = `You are a structured data extractor. You must analyze the following user message and extract any relevant transactions (income or expense), tasks/to-dos, moods, or habits.

User Message: "${userMessage}"
Current Date Context: "${currentDateStr}"

Extraction Rules:
1. "transactions": Extract amounts, types, AND dates/times if mentioned.
   - E.g., "beli kopi 25000 jam 3 sore" -> amount: 25000, type: "expense", description: "kopi", jam: "15:00"
   - E.g., "gaji tanggal 6 Juni" -> amount: [extract], type: "income", description: "gaji", transaction_date: "2026-06-06"
   - E.g., "tanggal 8 Juni jam 1 siang" -> transaction_date: "2026-06-08", jam: "13:00"
   - If date/time NOT mentioned, OMIT the field (don't include null/empty)
2. "tasks": Extract NEW task to be created (user wants to ADD a new task).
   - E.g., "tambah tugas besok jam 9 pagi" -> task_name: "tugas", due_date: tomorrow ISO, jam: "09:00", status: "pending"
3. "task_updates": Extract EXISTING tasks that user wants to UPDATE their status.
   - CRITICAL: If user says "selesai", "telah selesai", "sudah selesai", "tandai selesai", "update status jadi selesai" -> extract to task_updates with new_status: "completed"
   - CRITICAL: If user says "batal", "dibatalkan", "cancel", "tidak jadi" -> new_status: "cancelled"
   - CRITICAL: If user says "tunda", "pending lagi", "aktifkan lagi" -> new_status: "pending"
   - E.g., "selesaikan semua tugas saya" -> task_updates: [{task_name: "match all existing pending tasks", new_status: "completed"}]
   - E.g., "tugas bimbingan skripsi saya yang tanggal 10 Juni ubah jadi selesai" -> task_updates: [{task_name: "bimbingan skripsi", new_status: "completed", notes: "tanggal 10 Juni"}]
4. "moods": Extract user mood or feelings mentioned.
5. "habits": Extract habits checked in or mentioned.

Return the response STRICTLY in this JSON format:
{
  "transactions": [
    { "amount": number, "type": "income" | "expense", "description": string, "transaction_date"?: "YYYY-MM-DD", "jam"?: "HH:MM" }
  ],
  "tasks": [
    { "task_name": string, "due_date"?: string (ISO 8601), "status": "pending", "jam"?: "HH:MM", "waktu_mulai"?: "HH:MM", "pengingat"?: "HH:MM" }
  ],
  "task_updates": [
    { "task_name": string, "new_status": "pending" | "completed" | "cancelled", "notes"?: string }
  ],
  "moods": [
    { "mood": string, "description": string }
  ],
  "habits": [
    { "habit_name": string, "description": string }
  ]
}

IMPORTANT: Only include transaction_date and jam fields if they are explicitly mentioned or can be inferred from the message. If the user says "hari ini" or "sekarang", use today's date "${currentDateStr}" converted to YYYY-MM-DD format.

If any category has no entries, return an empty array for that key. Do not include any extra text outside the JSON.`;

  let attempts = 3;
  while (attempts > 0) {
    try {
      const result = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          temperature: 0.0,
          responseMimeType: 'application/json',
        },
      });
      const text = result.text ?? '';
      return JSON.parse(text) as ExtractedData;
    } catch (error) {
      console.error(`Error in Stage 1 Extraction (attempts left: ${attempts - 1}):`, error);
      attempts--;
      if (attempts === 0) {
        Sentry.captureException(error);
        return { transactions: [], tasks: [], task_updates: [], moods: [], habits: [] };
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  return { transactions: [], tasks: [], task_updates: [], moods: [], habits: [] };
}

/**
 * Stage 2: Generates assistant response in character with personality-specific temperature and top_p.
 * Splits paragraphs using [BREAK] to be sent as separate bubbles.
 */
export async function runStage2Chat(params: {
  userMessage: string;
  userNickname: string;
  assistantName: string;
  personalityInstruction: string;
  temperature: number;
  topP: number;
  extractedData: ExtractedData;
  chatHistory: Array<{ role: 'user' | 'model'; parts: string }>;
  userTimezone?: string; // Optional timezone from user device
}): Promise<string[]> {
  // Use user's timezone or default to Asia/Jakarta (WIB)
  const userTz = params.userTimezone || 'Asia/Jakarta';
  const dateInfo = formatDateForUser(userTz);

  const cleanInstruction = (params.personalityInstruction || "").toLowerCase();
  
  let prefix = "";
  let suffix = "";
  if (cleanInstruction.includes("sarkas") || cleanInstruction.includes("sidekick") || cleanInstruction.includes("witty")) {
    prefix = "😎 ";
    suffix = "Jangan lupa traktir gua kopi ya, Bos!";
  } else if (cleanInstruction.includes("tegas") || cleanInstruction.includes("disiplin") || cleanInstruction.includes("coach") || cleanInstruction.includes("tough")) {
    prefix = "⚡ ";
    suffix = "Jangan ditunda lagi, makin cepat lu mulai, makin cepat lu bisa santai!";
  } else if (cleanInstruction.includes("bersemangat") || cleanInstruction.includes("cheerleader") || cleanInstruction.includes("hype")) {
    prefix = "🔥 ";
    suffix = "Keren banget! Kita sikat hari ini dengan maksimal! Mantap!!! 🙌";
  } else if (cleanInstruction.includes("tenang") || cleanInstruction.includes("strategi") || cleanInstruction.includes("stoic")) {
    prefix = "♟️ [Analisis Logis] ";
    suffix = "Semua opsi tindakan telah disiapkan.";
  } else if (cleanInstruction.includes("sopan") || cleanInstruction.includes("berkelas") || cleanInstruction.includes("confidant") || cleanInstruction.includes("elegant")) {
    prefix = "🎩 ";
    suffix = "Apakah ada hal lain yang dapat saya selesaikan untuk Anda, Tuan?";
  }

  const wrapResponse = (bubbles: string[]): string[] => {
    if (bubbles.length === 0) return bubbles;
    const newBubbles = [...bubbles];
    if (prefix) {
      newBubbles[0] = prefix + newBubbles[0];
    }
    if (suffix) {
      newBubbles.push(suffix);
    }
    return newBubbles;
  };

  const ai = getGenAI();

  const formattedPersonality = params.personalityInstruction
    .replace(/{assistant_name}/g, params.assistantName)
    .replace(/{user_nickname}/g, params.userNickname);

  const extractionSummary = JSON.stringify(params.extractedData, null, 2);

  // Add task update results to context if available
  const taskUpdateContext = (params.extractedData as any).taskUpdateResults
    ? `\n\nIMPORTANT - DATABASE UPDATE RESULTS:\nThe following task updates were successfully processed in the database:\n${JSON.stringify((params.extractedData as any).taskUpdateResults, null, 2)}\n\nYou MUST acknowledge these updates in your response! Example: "Oke! Saya sudah mengubah status 5 tugas menjadi selesai. 💪"`
    : '';

  // Get timezone display name
  const tzDisplayName = {
    'Asia/Jayapura': 'WIT',
    'Asia/Makassar': 'WITA',
    'Asia/Jakarta': 'WIB'
  }[userTz] || 'WIB';

  // Helper to get timezone offset description
  const getTimezoneInfo = (tz: string) => {
    const info: Record<string, { name: string; offset: string; cities: string }> = {
      'Asia/Jayapura': { name: 'WIT', offset: 'UTC+9', cities: 'Papua, Ambon, Maluku' },
      'Asia/Makassar': { name: 'WITA', offset: 'UTC+8', cities: 'Makassar, Bali, NTT, NTB, Kalimantan' },
      'Asia/Jakarta': { name: 'WIB', offset: 'UTC+7', cities: 'Jakarta, Jawa, Sumatera, Kalimantan' },
    };
    return info[tz] || info['Asia/Jakarta'];
  };

  const tzInfo = getTimezoneInfo(userTz);

  const systemInstruction = `You are ${params.assistantName}, the AI personal assistant for ${params.userNickname}.
Your character guidelines:
${formattedPersonality}

CRITICAL - TIMEZONE & SCHEDULING RULES (READ CAREFULLY):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Your user is currently in timezone: ${tzInfo.name} (${tzInfo.offset})
- Timezone cities: ${tzInfo.cities}
- Current time: ${dateInfo.time} ${tzInfo.name} on ${dateInfo.date}

TIME CONVERSION RULES:
• WIB (UTC+7) = West Indonesia - Jakarta, Jawa, Sumatera
• WITA (UTC+8) = Central Indonesia - Bali, Makassar, Kalimantan
• WIT (UTC+9) = East Indonesia - Papua, Ambon

When user mentions time (e.g., "jam 7 malam", "pukul 3 siang"):
1. ALWAYS use the user's CURRENT timezone (${tzInfo.name}) as the default
2. If user mentions a DIFFERENT LOCATION (e.g., "acara di jakarta tapi aku di papua"):
   - Convert TO user's current timezone (${tzInfo.name})
   - Example: "rapat di jakarta jam 2 siang" for user in WIT = "rapat jam 4 sore WIT"
3. ALWAYS confirm the time: "Oke, aku catat rapat jam 7 malam WIT (${dateInfo.time}) ya?"
4. If the time mentioned is AMBIGUOUS or the location doesn't match, ASK for clarification:
   - "Jam 7 malam itu WIB atau WIT? Supaya aku bisa set reminder yang tepat 😊"

DATE CALCULATION:
- "besok" = ${dateInfo.date} + 1 day
- "minggu depan" = 7 days from today
- Always calculate relative to ${dateInfo.date} in ${tzInfo.name}

Always include relevant and friendly emojis/emoticons (e.g. 😊, 😂, 😎, 👍, 🔥, etc.) in your responses to make the interaction feel lively, warm, and natural.

We have already parsed the user's message and extracted this structured data (which will be processed automatically in our backend):
${extractionSummary}${taskUpdateContext}

Reply to the user's current message in Indonesian, fully in character.
If you have multiple distinct points to make or want to reply in stages, separate them with the tag '[BREAK]' (literally the string '[BREAK]').
Do NOT use markdown lists for separate messages; use '[BREAK]' to let the system split them into separate chat bubbles.
Example response style:
"Halo Sobat! 😊 Laporan kerja lu udah kelar ya. [BREAK] Oh ya, kopi tadi Rp 25.000 udah gw masukin pengeluaran. Ada lagi? 👍"`;

  // Build history in the new SDK format
  const sanitizedHistory = sanitizeChatHistory(params.chatHistory);
  const historyContents = sanitizedHistory.map((item) => ({
    role: item.role === 'user' ? 'user' as const : 'model' as const,
    parts: [{ text: item.parts }],
  }));

  const chat = ai.chats.create({
    model: 'gemini-3.1-flash-lite',
    config: {
      temperature: params.temperature,
      topP: params.topP,
      systemInstruction: systemInstruction,
    },
    history: historyContents,
  });

  let attempts = 3;
  while (attempts > 0) {
    try {
      const result = await chat.sendMessage({ message: params.userMessage });
      const text = result.text ?? '';
      
      // Parse the [BREAK] separated strings into bubbles
      const bubbles = text
        .split('[BREAK]')
        .map((b) => b.trim())
        .filter(Boolean);

      return wrapResponse(bubbles.length > 0 ? bubbles : [text]);
    } catch (error) {
      console.error(`Error in Stage 2 Chat (attempts left: ${attempts - 1}):`, error);
      attempts--;
      if (attempts === 0) {
        Sentry.captureException(error);
        return wrapResponse(['Maaf, terjadi kesalahan koneksi dengan otak AI saya. Bisa tolong ulangi?']);
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  return wrapResponse(['Maaf, terjadi kesalahan koneksi dengan otak AI saya. Bisa tolong ulangi?']);
}

function sanitizeChatHistory(history: Array<{ role: 'user' | 'model'; parts: string }>) {
  const sanitized: Array<{ role: 'user' | 'model'; parts: string }> = [];
  for (const msg of history) {
    if (sanitized.length === 0) {
      if (msg.role === 'user') {
        sanitized.push({ ...msg });
      }
    } else {
      const last = sanitized[sanitized.length - 1];
      if (msg.role !== last.role) {
        sanitized.push({ ...msg });
      } else {
        last.parts += `\n${msg.parts}`;
      }
    }
  }
  if (sanitized.length > 0 && sanitized[sanitized.length - 1].role === 'user') {
    sanitized.pop();
  }
  return sanitized;
}
