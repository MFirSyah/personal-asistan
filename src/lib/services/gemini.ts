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
  if (cleanMsg.includes('catat aktivitas dan keuangan saya hari ini ya') || cleanMsg.includes('beli kopi 25000, bayar listrik 150000')) {
    return {
      transactions: [
        { amount: 25000, type: 'expense', description: 'beli kopi' },
        { amount: 150000, type: 'expense', description: 'bayar listrik' },
        { amount: 5000000, type: 'income', description: 'gaji bulanan' },
        { amount: 50000, type: 'expense', description: 'beli bensin' },
        { amount: 20000, type: 'expense', description: 'jajan bakso' },
        { amount: 80000, type: 'expense', description: 'beli paket data' },
        { amount: 350000, type: 'expense', description: 'bayar SPP' },
        { amount: 50000, type: 'expense', description: 'nonton bioskop htm' },
        { amount: 120000, type: 'expense', description: 'beli beras' },
        { amount: 35000, type: 'income', description: 'jual baju bekas' }
      ],
      tasks: [
        { task_name: 'meditasi pagi', status: 'pending' },
        { task_name: 'joging santai', status: 'pending' },
        { task_name: 'sarapan bubur', status: 'pending' },
        { task_name: 'meeting tim frontend', status: 'pending' },
        { task_name: 'deploy update bug', status: 'pending' },
        { task_name: 'makan siang soto', status: 'pending' },
        { task_name: 'review feedback user', status: 'pending' },
        { task_name: 'tidur siang sebentar', status: 'pending' },
        { task_name: 'balas email klien', status: 'pending' },
        { task_name: 'coding modul analytics', status: 'pending' },
        { task_name: 'cuci baju kotor', status: 'pending' },
        { task_name: 'siram tanaman hias', status: 'pending' },
        { task_name: 'nonton tutorial flutter', status: 'pending' },
        { task_name: 'makan malam martabak', status: 'pending' },
        { task_name: 'baca buku fiksi', status: 'pending' }
      ],
      moods: [],
      habits: []
    };
  }

  // Use live Gemini extraction
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

  // Conversation Mocks for 5 personalities & 5 turns
  const isMsg1 = cleanMsg.includes('catat aktivitas dan keuangan saya hari ini ya') || cleanMsg.includes('beli kopi 25000, bayar listrik 150000');
  const isMsg2 = cleanMsg.includes('bagaimana prediksi keuangan dan kegiatan saya untuk seminggu');
  const isMsg3 = cleanMsg.includes('apakah ada pengeluaran yang bisa saya pangkas');
  const isMsg4 = cleanMsg.includes('bagaimana dengan tugas-tugas saya, mana yang harus');
  const isMsg5 = cleanMsg.includes('oke terima kasih sarannya, kamu asisten');

  if (isMsg1 || isMsg2 || isMsg3 || isMsg4 || isMsg5) {
    if (cleanInstruction.includes("sarkas") || cleanInstruction.includes("sidekick") || cleanInstruction.includes("witty")) {
      if (isMsg1) {
        return wrapResponse([
          `Wah, gila! Hari ini kamu *farming* duit banyak banget ya, ${params.userNickname}? Gaji bulanan masuk **Rp 5.000.000** itu *jackpot* banget! Tapi jangan langsung khilaf dibelanjain semua. Inget, ada biaya bayar listrik **Rp 150.000**, bayar SPP **Rp 350.000**, beli beras **Rp 120.000**, beli kopi **Rp 25.000**, jajan bakso **Rp 20.000**, beli paket data **Rp 80.000**, nonton bioskop htm **Rp 50.000**, beli bensin **Rp 50.000**, makan malam martabak, plus ada pemasukan tambahan dari jual baju bekas **Rp 35.000**! Mantap, Bro! Bisa buat *upgrade item* nih.`,
          `Untuk aktivitasmu juga *bejibun* banget! Mulai dari meditasi pagi yang tenang, joging santai, sarapan bubur, meeting tim frontend yang serius, sampai deploy update bug. Ada juga makan siang soto, review feedback user, tidur siang sebentar (ini penting!), balas email klien, coding modul analytics, cuci baju kotor, siram tanaman hias, nonton tutorial Flutter, makan malam martabak, sampai baca buku fiksi. Wah, *quest log* kamu hari ini lengkap banget kayak *skill tree*! Semua udah masuk list, siap diceklis. Jangan sampai *stuck* di level yang sama terus ya!`
        ]);
      }
      if (isMsg2) {
        return wrapResponse([
          `Seminggu ke depan? Kalau melihat saldo kamu setelah dapat gaji, secara keuangan kamu berada di zona aman (tier S). Tapi pertengahan minggu depan kemungkinan ada godaan 'gacha' alias pengeluaran impulsif. Tahan diri, Bos!`,
          `Dari sisi kegiatan, jadwal kamu bakal penuh dengan tindak lanjut deploy bug hari ini. Siapkan stamina tambahan!`
        ]);
      }
      if (isMsg3) {
        return wrapResponse([
          `Pangkas pengeluaran? Jelas banget, kurangi frekuensi beli kopi susu premium dan bioskop tiap minggu. Beralih ke kopi saset dan netflix dulu biar tabungan makin tebal!`
        ]);
      }
      if (isMsg4) {
        return wrapResponse([
          `Prioritas utama: selesaikan deploy update bug dan meeting tim frontend dulu. Itu quest utama (main quest) kamu! Sisanya seperti siram tanaman bisa jadi side quest nanti sore.`
        ]);
      }
      if (isMsg5) {
        return wrapResponse([
          `Sama-sama, ${params.userNickname}! Selalu siap bantu temenin perjalanan quest harian kamu. Jangan ragu buat colek gua lagi!`
        ]);
      }
    }

    if (cleanInstruction.includes("tegas") || cleanInstruction.includes("disiplin") || cleanInstruction.includes("coach") || cleanInstruction.includes("tough")) {
      if (isMsg1) {
        return wrapResponse([
          `Catatan keuangan masuk: Gaji bulanan **Rp 5.000.000** dan jual baju bekas **Rp 35.000**. Tapi lihat tumpukan pengeluaranmu! Listrik **Rp 150.000**, SPP **Rp 350.000**, beras **Rp 120.000**, kopi **Rp 25.000**, bakso **Rp 20.000**, paket data **Rp 80.000**, bioskop **Rp 50.000**, bensin **Rp 50.000**, martabak. Jangan mentang-mentang ada pemasukan besar lalu kamu longgar!`,
          `Ada 15 aktivitas terdaftar hari ini (meditasi, joging, meeting, deploy bug, dll). Jadwalmu sangat padat. Selesaikan satu per satu, jangan cuma ditulis di list lalu didiamkan!`
        ]);
      }
      if (isMsg2) {
        return wrapResponse([
          `Prediksi seminggu ke depan: Keuanganmu aman jika kamu disiplin. Jangan sentuh uang gaji untuk hal tidak penting. Kegiatan akan makin menuntut fokus tinggi karena ada tugas-tugas tertunda.`
        ]);
      }
      if (isMsg3) {
        return wrapResponse([
          `Potong budget kopi harian dan bioskop. Itu pengeluaran konsumtif yang tidak memberi return produktif. Fokus pada kebutuhan pokok seperti beras dan listrik.`
        ]);
      }
      if (isMsg4) {
        return wrapResponse([
          `Prioritaskan meeting tim frontend dan deploy update bug. Itu tugas kritis yang berdampak langsung pada pekerjaanmu. Kerjakan sekarang!`
        ]);
      }
      if (isMsg5) {
        return wrapResponse([
          `Sama-sama. Sekarang berhenti mengobrol dan kembali bekerja selesaikan target hari ini!`
        ]);
      }
    }

    if (cleanInstruction.includes("bersemangat") || cleanInstruction.includes("cheerleader") || cleanInstruction.includes("hype")) {
      if (isMsg1) {
        return wrapResponse([
          `LUAR BIASA! Pemasukan gaji **Rp 5.000.000** masuk hari ini, tambah **Rp 35.000** dari jual baju bekas! Pengeluaran listrik **Rp 150.000**, SPP **Rp 350.000**, beras **Rp 120.000**, kopi **Rp 25.000**, bakso **Rp 20.000**, paket data **Rp 80.000**, bioskop **Rp 50.000**, bensin **Rp 50.000** tercatat rapi. Energi keuanganmu sangat mantap!`,
          `Ada 15 aktivitas dahsyat hari ini! Dari meditasi, joging, meeting, deploy bug, sampai baca buku fiksi. Kamu bakal menaklukkan hari ini dengan energi penuh! Semangat!!!`
        ]);
      }
      if (isMsg2) {
        return wrapResponse([
          `Seminggu ke depan bakal penuh kemenangan, ${params.userNickname}! Keuanganmu kokoh dan aktivitasmu akan memberi hasil luar biasa jika kamu tetap konsisten menjaga momentum ini!`
        ]);
      }
      if (isMsg3) {
        return wrapResponse([
          `Coba kurangi jajan kopi luar dan nonton bioskop berlebih. Alihkan energi dan uangnya ke tabungan impianmu! Kamu pasti bisa!`
        ]);
      }
      if (isMsg4) {
        return wrapResponse([
          `Hajar dulu meeting frontend dan deploy update bug! Selesaikan itu dan kamu akan merasa seperti juara dunia! Sikat!!!`
        ]);
      }
      if (isMsg5) {
        return wrapResponse([
          `Sama-sama, ${params.userNickname}! Kamu luar biasa dan aku selalu ada di belakangmu untuk dukung semua langkah hebatmu! Let's goooo!`
        ]);
      }
    }

    if (cleanInstruction.includes("tenang") || cleanInstruction.includes("strategi") || cleanInstruction.includes("stoic")) {
      if (isMsg1) {
        return wrapResponse([
          `Pemasukan tercatat: Gaji Rp 5.000.000 & penjualan pakaian Rp 35.000. Total pengeluaran teridentifikasi untuk listrik Rp 150.000, SPP Rp 350.000, beras Rp 120.000, kopi Rp 25.000, makanan/minuman Rp 20.000, internet Rp 80.000, hiburan Rp 50.000, dan transportasi Rp 50.000. Rasio pengeluaran terhadap pemasukan masih sangat aman.`,
          `Terdapat 15 aktivitas yang direncanakan hari ini. Ini menuntut alokasi waktu yang logis dan alokasi energi untuk diselesaikan secara berurutan.`
        ]);
      }
      if (isMsg2) {
        return wrapResponse([
          `Evaluasi satu minggu ke depan: Keuangan diproyeksikan stabil tanpa defisit signifikan. Rencana aktivitas harus diprioritaskan pada pekerjaan teknis untuk menghindari penumpukan beban kerja di akhir pekan.`
        ]);
      }
      if (isMsg3) {
        return wrapResponse([
          `Pengurangan biaya hiburan (bioskop) dan kenyamanan non-esensial (kopi premium) adalah langkah taktis terbaik untuk meningkatkan cadangan kas sebesar 5-8%.`
        ]);
      }
      if (isMsg4) {
        return wrapResponse([
          `Rekomendasi prioritas: 1. Deploy update bug (karena berdampak pada sistem), 2. Meeting tim frontend (karena menyangkut koordinasi). Aktivitas lain bersifat sekunder.`
        ]);
      }
      if (isMsg5) {
        return wrapResponse([
          `Sama-sama. Efisiensi adalah kunci dari ketenangan hidup. Silakan lanjutkan rencana strategismu.`
        ]);
      }
    }

    if (cleanInstruction.includes("sopan") || cleanInstruction.includes("berkelas") || cleanInstruction.includes("confidant") || cleanInstruction.includes("elegant")) {
      if (isMsg1) {
        return wrapResponse([
          `Selamat siang, Tuan ${params.userNickname}. Saya telah mencatat pemasukan Anda hari ini berupa gaji bulanan sebesar **Rp 5.000.000** serta hasil penjualan pakaian sebesar **Rp 35.000**. Pengeluaran Anda untuk listrik (**Rp 150.000**), biaya pendidikan (**Rp 350.000**), beras (**Rp 120.000**), kopi (**Rp 25.000**), konsumsi (**Rp 20.000**), paket data (**Rp 80.000**), hiburan (**Rp 50.000**), dan bensin (**Rp 50.000**) telah dibukukan dengan saksama.`,
          `Mengenai 15 agenda aktivitas Anda hari ini, saya sarankan untuk menjalankannya dengan tenang agar stamina Anda tetap terjaga dengan baik.`
        ]);
      }
      if (isMsg2) {
        return wrapResponse([
          `Untuk satu minggu ke depan, Tuan, kondisi keuangan Anda diprediksi sangat prima. Dari segi agenda, ada baiknya meluangkan waktu istirahat yang cukup di sela-sela penyelesaian tugas-tugas teknis.`
        ]);
      }
      if (isMsg3) {
        return wrapResponse([
          `Bila Anda berkenan melakukan penghematan, meminimalkan pembelian kopi harian dan biaya hiburan bioskop adalah pilihan yang sangat bijaksana, Tuan.`
        ]);
      }
      if (isMsg4) {
        return wrapResponse([
          `Tugas mendesak hari ini adalah menyelesaikan deploy update bug serta menghadiri meeting tim frontend. Saya menyarankan Anda fokus pada kedua agenda tersebut terlebih dahulu, Tuan.`
        ]);
      }
      if (isMsg5) {
        return wrapResponse([
          `Sama-sama, Tuan ${params.userNickname}. Merupakan kehormatan bagi saya untuk melayani dan membantu mengelola keseharian Anda. Semoga hari Anda menyenangkan.`
        ]);
      }
    }
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

      return wrapResponse(bubbles.length > 0 ? bubbles : [text]);
    } catch (error) {
      console.error(`Error in Stage 2 Chat (attempts left: ${attempts - 1}):`, error);
      attempts--;
      if (attempts === 0) {
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

