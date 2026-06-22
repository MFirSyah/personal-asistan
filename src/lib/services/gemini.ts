import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the Gemini API client
const getGenAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not defined in environment variables.');
  }
  return new GoogleGenerativeAI(apiKey);
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
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: {
      temperature: 0.0,
      responseMimeType: 'application/json',
    },
  });

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

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return JSON.parse(text) as ExtractedData;
  } catch (error) {
    console.error('Error in Stage 1 Extraction:', error);
    return { transactions: [], tasks: [], moods: [], habits: [] };
  }
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
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: {
      temperature: params.temperature,
      topP: params.topP,
    },
  });

  const formattedPersonality = params.personalityInstruction
    .replace(/{assistant_name}/g, params.assistantName)
    .replace(/{user_nickname}/g, params.userNickname);

  const extractionSummary = JSON.stringify(params.extractedData, null, 2);

  // Construct standard history + current system instruction and user prompt
  const systemInstruction = `You are ${params.assistantName}, the AI personal assistant for ${params.userNickname}.
Your character guidelines:
${formattedPersonality}

We have already parsed the user's message and extracted this structured data (which will be processed automatically in our backend):
${extractionSummary}

Reply to the user's current message in Indonesian, fully in character.
If you have multiple distinct points to make or want to reply in stages, separate them with the tag '[BREAK]' (literally the string '[BREAK]').
Do NOT use markdown lists for separate messages; use '[BREAK]' to let the system split them into separate chat bubbles.
Example response style:
"Halo Sobat! Laporan kerja lu udah kelar ya. [BREAK] Oh ya, kopi tadi Rp 25.000 udah gw masukin pengeluaran. Ada lagi?"`;

  const chatSession = model.startChat({
    history: params.chatHistory.map((item) => ({
      role: item.role === 'user' ? 'user' : 'model',
      parts: [{ text: item.parts }],
    })),
    systemInstruction: systemInstruction,
  });

  try {
    const result = await chatSession.sendMessage(params.userMessage);
    const text = result.response.text();
    
    // Parse the [BREAK] separated strings into bubbles
    const bubbles = text
      .split('[BREAK]')
      .map((b) => b.trim())
      .filter(Boolean);

    return bubbles.length > 0 ? bubbles : [text];
  } catch (error) {
    console.error('Error in Stage 2 Chat:', error);
    return ['Maaf, terjadi kesalahan koneksi dengan otak AI saya. Bisa tolong ulangi?'];
  }
}
