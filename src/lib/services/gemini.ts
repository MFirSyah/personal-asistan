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

export interface ExtractedData {
  transactions: Array<{
    amount: number;
    type: 'income' | 'expense';
    description: string;
  }>;
  tasks: Array<{
    task_name: string;
    due_date?: string; // ISO string
    status: 'pending';
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
1. "transactions": Extract amounts and types. E.g., "beli kopi 25000" is expense, 25000, description: "kopi". "dapat transferan 500000" is income, 500000, description: "transferan". Ensure amount is a number.
2. "tasks": Extract task name, and due date if specified (convert it to ISO date format based on current date context). E.g., "laporan besok" -> task_name: "laporan", due_date: tomorrow, status: "pending".
3. "moods": Extract user mood or feelings mentioned. E.g., "capek banget" -> mood: "capek", description: "capek banget".
4. "habits": Extract habits checked in or mentioned.

Return the response STRICTLY in this JSON format:
{
  "transactions": [
    { "amount": number, "type": "income" | "expense", "description": string }
  ],
  "tasks": [
    { "task_name": string, "due_date": string (ISO 8601), "status": "pending" }
  ],
  "moods": [
    { "mood": string, "description": string }
  ],
  "habits": [
    { "habit_name": string, "description": string }
  ]
}

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
        return { transactions: [], tasks: [], moods: [], habits: [] };
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  return { transactions: [], tasks: [], moods: [], habits: [] };
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
}): Promise<string[]> {
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

  // Get current date for AI context (WIB timezone)
  const now = new Date();
  const currentDate = now.toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const currentTime = now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta'
  }) + ' WIB';

  const systemInstruction = `You are ${params.assistantName}, the AI personal assistant for ${params.userNickname}.
Your character guidelines:
${formattedPersonality}

IMPORTANT - Current Date/Time Information:
- Today is: ${currentDate}
- Current time: ${currentTime}
- ALWAYS use this date information when answering questions about dates, schedules, deadlines, or any time-related queries.
- If asked "hari ini tanggal berapa" or similar questions about dates, respond with the EXACT date above: ${currentDate}.
- When processing tasks with due dates, calculate relative to THIS date: ${currentDate}.

Always include relevant and friendly emojis/emoticons (e.g. 😊, 😂, 😎, 👍, 🔥, etc.) in your responses to make the interaction feel lively, warm, and natural.

We have already parsed the user's message and extracted this structured data (which will be processed automatically in our backend):
${extractionSummary}

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
