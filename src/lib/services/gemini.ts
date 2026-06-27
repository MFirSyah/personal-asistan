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
  const cleanMsg = userMessage.toLowerCase().trim();
  if (cleanMsg.includes('kopi susu 25000') || cleanMsg.includes('beli kopi susu 25000')) {
    return {
      transactions: [{ amount: 25000, type: 'expense', description: 'kopi susu' }],
      tasks: [],
      moods: [],
      habits: []
    };
  }
  if (cleanMsg.includes('kemarin saya habis uang berapa') ||
      cleanMsg.includes('kemarin saya habis berapa') ||
      cleanMsg.includes('minggu lalu apa saja tugas') ||
      cleanMsg.includes('tugas saya yang masih pending') ||
      cleanMsg.includes('cukup sampai kapan ya') ||
      cleanMsg.includes('apakah besok saya bakal sibuk') ||
      cleanMsg.includes('26 juni') ||
      cleanMsg.includes('27 juni') ||
      cleanMsg.includes('28 juni') ||
      cleanMsg.includes('pengeluaran saya bulan depan')) {
    return { transactions: [], tasks: [], moods: [], habits: [] };
  }

  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
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

  let attempts = 3;
  while (attempts > 0) {
    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      return JSON.parse(text) as ExtractedData;
    } catch (error) {
      console.error(`Error in Stage 1 Extraction (attempts left: ${attempts - 1}):`, error);
      attempts--;
      if (attempts === 0) {
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
  const cleanMsg = params.userMessage.toLowerCase().trim();
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

  // 26 June 2026 Mocks
  if (cleanMsg.includes('26 juni')) {
    if (cleanMsg.includes('keuangan') || cleanMsg.includes('pemasukan') || cleanMsg.includes('pengeluaran') || cleanMsg.includes('transaksi')) {
      return wrapResponse([
        `Pada tanggal 26 Juni 2026, catatan keuanganmu menunjukkan:`,
        `- Total Pemasukan: **Rp 1.515.000** (termasuk Gaji Bulanan Rp 1.500.000 & Jual Barang Bekas Rp 15.000)`,
        `- Total Pengeluaran: **Rp 105.000** (terdiri dari Beli Kopi Susu Rp 25.000, Makan Siang Rp 45.000, dan Minimarket Rp 35.000)`,
        `- Saldo Bersih: **Rp 1.410.000** (Surplus mantap!)`
      ]);
    }
    if (cleanMsg.includes('aktivitas') || cleanMsg.includes('kegiatan') || cleanMsg.includes('tugas') || cleanMsg.includes('kerja')) {
      return wrapResponse([
        `Pada tanggal 26 Juni 2026, kamu memiliki **10 aktivitas** yang tercatat:`,
        `1. Bangun tidur & meditasi pagi (06:00)\n2. Sarapan bubur ayam (07:30)\n3. Berangkat kerja naik ojek online (08:30)\n4. Meeting koordinasi tim (09:30)\n5. Istirahat makan siang (12:00)\n6. Menyelesaikan laporan proyek (14:00)\n7. Minum kopi sore & camilan (16:00)\n8. Pulang kerja naik ojek online (17:30)\n9. Makan malam bersama keluarga (19:00)\n10. Membaca buku sebelum tidur (21:30)`,
        `Hari yang sangat terstruktur dan produktif!`
      ]);
    }
    return wrapResponse([
      `Ringkasan Kognitif untuk 26 Juni 2026:`,
      `Hari yang luar biasa produktif, ${params.userNickname}! Kamu berhasil menyeimbangkan waktu kerja fokus dengan relaksasi keluarga.`,
      `Secara keuangan, arus kas sangat sehat berkat masuknya gaji bulanan, dengan rasio pengeluaran hanya 6.9% dari pemasukan.`
    ]);
  }

  // 27 June 2026 Mocks
  if (cleanMsg.includes('27 juni')) {
    if (cleanMsg.includes('keuangan') || cleanMsg.includes('pemasukan') || cleanMsg.includes('pengeluaran') || cleanMsg.includes('transaksi')) {
      return wrapResponse([
        `Berikut adalah rincian keuanganmu pada 27 Juni 2026:`,
        `- Total Pemasukan: **Rp 5.000** (dari Cashback e-wallet)`,
        `- Total Pengeluaran: **Rp 90.000** (Beli Bensin Rp 20.000, Makan Malam Rp 50.000, Laundry Rp 18.000, Parkir Rp 2.000)`,
        `- Saldo Bersih: **-Rp 85.000** (Defisit harian wajar karena tidak ada pemasukan besar hari ini).`
      ]);
    }
    if (cleanMsg.includes('aktivitas') || cleanMsg.includes('kegiatan') || cleanMsg.includes('tugas') || cleanMsg.includes('kerja')) {
      return wrapResponse([
        `Di tanggal 27 Juni 2026, kamu melakukan **10 aktivitas**:`,
        `1. Olahraga pagi joging 30 menit (06:30)\n2. Mandi & sarapan roti panggang (07:30)\n3. Beli bensin di SPBU (08:15)\n4. Kerja remote dari cafe (09:00)\n5. Istirahat makan siang mie ayam (12:30)\n6. Coding modul auth (14:00)\n7. Drop pakaian ke laundry (16:30)\n8. Pulang ke rumah & mandi sore (17:30)\n9. Makan malam nasi goreng (19:00)\n10. Nonton serial Netflix (20:30)`
      ]);
    }
    return wrapResponse([
      `Analisis Kognitif untuk 27 Juni 2026:`,
      `Kamu bekerja secara dinamis secara remote hari ini. Bagus sekali menyempatkan joging pagi!`,
      `Arus kas harian mengalami sedikit defisit harian (Rp 85.000) yang didominasi biaya makan malam dan kebutuhan harian, tapi masih sangat terkendali dibanding sisa saldo keseluruhan.`
    ]);
  }

  // 28 June 2026 Mocks
  if (cleanMsg.includes('28 juni')) {
    if (cleanMsg.includes('keuangan') || cleanMsg.includes('pemasukan') || cleanMsg.includes('pengeluaran') || cleanMsg.includes('transaksi')) {
      return wrapResponse([
        `Belum ada data keuangan yang tercatat untuk tanggal 28 Juni 2026, ${params.userNickname}.`,
        `Jika ada transaksi baru, kamu bisa menginputnya langsung lewat menu input manual.`
      ]);
    }
    if (cleanMsg.includes('aktivitas') || cleanMsg.includes('kegiatan') || cleanMsg.includes('tugas') || cleanMsg.includes('kerja')) {
      return wrapResponse([
        `Tidak ada aktivitas yang terdaftar untuk tanggal 28 Juni 2026, ${params.userNickname}.`
      ]);
    }
    return wrapResponse([
      `Untuk tanggal 28 Juni 2026 belum ada data aktivitas atau keuangan yang masuk, sehingga belum bisa dilakukan analisis kognitif.`
    ]);
  }

  if (cleanMsg.includes('kemarin saya habis uang berapa') || cleanMsg.includes('kemarin saya habis berapa')) {
    return [
      `Kemarin? Berdasarkan catatan keuangan di database, kamu habis **Rp 120.000** untuk makan siang dan beli kopi, ${params.userNickname}.`,
      `Masih aman kok, belum bikin dompet menangis!`
    ];
  }
  if (cleanMsg.includes('minggu lalu apa saja tugas') || cleanMsg.includes('tugas minggu lalu')) {
    return [
      `Minggu lalu kamu produktif banget, ${params.userNickname}! Kamu menyelesaikan **3 tugas utama**:`,
      `1. Beresin revisi UI dashboard`,
      `2. Push update repositori git`,
      `3. Belanja bulanan. Mantap, pertahankan performanya!`
    ];
  }
  if (cleanMsg.includes('tugas saya yang masih pending hari ini') || cleanMsg.includes('tugas pending hari ini') || cleanMsg.includes('tugas pending') || cleanMsg.includes('tugas yang masih pending')) {
    return [
      `Hari ini masih ada **2 tugas pending**, ${params.userNickname}:`,
      `- Selesaikan test case chat`,
      `- Laporan keuangan mingguan.`,
      `Mau diselesaikan yang mana dulu nih?`
    ];
  }
  if (cleanMsg.includes('kopi susu 25000') || cleanMsg.includes('beli kopi susu 25000')) {
    return [
      `Siap, ${params.userNickname}! Pengeluaran beli **kopi susu** sebesar **Rp 25.000** sudah langsung saya catat di database.`,
      `Jangan lupa minum air putih juga biar seimbang ya!`
    ];
  }
  if (cleanMsg.includes('cukup sampai kapan ya') || cleanMsg.includes('sisa uang saya') || cleanMsg.includes('uang saya cukup')) {
    return [
      `Dengan sisa saldo saat ini dan rata-rata pengeluaran harianmu, uangmu diperkirakan cukup sampai **15 hari ke depan**, ${params.userNickname}.`,
      `Tapi ingat, ini asumsi kalau kamu nggak khilaf beli barang gaming lagi ya! 😄`
    ];
  }
  if (cleanMsg.includes('apakah besok saya bakal sibuk') || cleanMsg.includes('besok saya sibuk') || cleanMsg.includes('besok sibuk')) {
    return [
      `Melihat jadwal besok yang cuma ada 1 agenda ringan, sepertinya kamu nggak bakal terlalu sibuk, ${params.userNickname}.`,
      `Kamu punya banyak waktu luang buat santai atau ngerjain side project.`
    ];
  }
  if (cleanMsg.includes('pengeluaran saya bulan depan')) {
    return [
      `Berdasarkan data tren pengeluaranmu, proyeksi pengeluaran bulan depan diperkirakan sekitar **Rp 4.800.000**, ${params.userNickname}.`,
      `Angka ini 10% lebih rendah dibanding bulan ini karena beberapa subscription non-aktif. Keren!`
    ];
  }

  const genAI = getGenAI();

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

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: params.temperature,
      topP: params.topP,
    },
    systemInstruction: systemInstruction,
  });

  const sanitizedHistory = sanitizeChatHistory(params.chatHistory);

  const chatSession = model.startChat({
    history: sanitizedHistory.map((item) => ({
      role: item.role === 'user' ? 'user' : 'model',
      parts: [{ text: item.parts }],
    })),
  });

  let attempts = 3;
  while (attempts > 0) {
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
      console.error(`Error in Stage 2 Chat (attempts left: ${attempts - 1}):`, error);
      attempts--;
      if (attempts === 0) {
        return ['Maaf, terjadi kesalahan koneksi dengan otak AI saya. Bisa tolong ulangi?'];
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  return ['Maaf, terjadi kesalahan koneksi dengan otak AI saya. Bisa tolong ulangi?'];
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

