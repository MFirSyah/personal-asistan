# RENCANA INDUK EKOSISTEM (REVISI v2): STANDALONE MOBILE AI PERSONAL ASSISTANT

> Versi ini adalah hasil revisi dari draft awal. Semua poin koreksi kritis & penting dari review sebelumnya sudah diterapkan langsung ke dalam skema, alur, dan checklist di bawah. Bagian yang diubah ditandai dengan **🔧 [REVISI]**.

---

## 0. Ringkasan Perubahan dari Draft Awal

| # | Masalah di Draft Awal | Perbaikan di Revisi Ini |
|---|---|---|
| 1 | Backend percaya `userId` dari body request | Backend wajib derive `userId` dari JWT Supabase yang divalidasi server-side |
| 2 | RLS tidak aktif di tabel chat & group room | RLS + policy berbasis membership ditambahkan ke semua tabel chat |
| 3 | Kolom `dynamic_metadata` dipakai di kode tapi tidak ada di skema `user_profiles` | Kolom ditambahkan ke skema |
| 4 | Continuous learning worker mengirim chat mentah (berpotensi PII) ke Gemini | Scrubbing PII diterapkan **sebelum** data masuk DB, jadi semua proses turunan otomatis aman |
| 5 | Insight 37-metrik hanya dihitung via cron, tapi testing mengharapkan update real-time | Dipisah: insight ringan dihitung on-demand via trigger, insight berat tetap batch |
| 6 | JWT diinjeksikan lewat URL parameter ke WebView | Diganti dengan `postMessage` setelah halaman load, plus penanganan refresh token |
| 7 | `node-cron` in-process di Hugging Face Space gratis (bisa sleep) | Worker terjadwal dipindah ke trigger eksternal (GitHub Actions / Supabase Scheduled Function) |
| 8 | Kontrak format bubble chat tidak konsisten (client split `[BREAK]` vs server kirim array) | Disepakati: server selalu mengirim array `bubbles`, client tidak perlu parsing |
| 9 | Tidak ada seed data 5 ego & index GIN untuk kolom JSONB | Ditambahkan di skema |
| 10 | `dynamic_metadata` di-overwrite penuh setiap update | Diubah jadi merge, bukan overwrite |

---

## 1. Arsitektur Ekosistem: Secure Hybrid API & WebView

Pendekatan dasar tetap sama: Flutter ringan untuk chat & CRUD langsung ke Supabase, komputasi berat & visualisasi dialihkan ke Private Web App (Vercel) yang dirender lewat WebView, dan "otak" AI (two-stage pipeline + worker) berjalan di Hugging Face Spaces.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               APLIKASI MOBILE FLUTTER (HP)                             │
│  ┌─────────────────────────┐  postMessage (bukan URL param) ┌─────────────────────────┐ │
│  │   UI Chat & CRUD Data   │ ─────────────────────────────> │   EMBEDDED DASHBOARD    │ │
│  │  (Ringan, Direct REST)  │                                │ (WebView - Vercel App) │ │
│  └────────────┬────────────┘                                └────────────┬────────────┘ │
└───────────────┼─────────────────────────────────────────────────────────┼───────────────┘
                │ Authorization: Bearer <JWT>                             │ Sesi Supabase
                │ (server validasi token, BUKAN userId dari body)         │ (auth.setSession)
┌───────────────▼─────────────────────────────────────────────────────────▼───────────────┐
│                        PRIVATE HUGGING FACE SPACES (DOCKER BACKEND)                    │
│  - Middleware: Validasi JWT → derive userId di server                                  │
│  - PII Scrubbing diterapkan SEBELUM data disimpan ke DB (bukan cuma sebelum ke Gemini)  │
│  - Two-Stage Processing Engine (Stage 1: Temp 0.0 ekstraksi, Stage 2: styling Ego)      │
│  - Endpoint /internal/recompute-insight dipanggil oleh DB Webhook (insight ringan)      │
└───────────────────────────────────────┬────────────────────────────────────────────────┘
                                        ▼ Query selalu manual filter user_id
                                        ▼ (service role key BYPASS RLS!)
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                SUPABASE CLOUD DATABASE                                 │
│  - RLS aktif di SEMUA tabel sensitif, termasuk chat & group room                       │
│  - Database Webhook → trigger recompute insight ringan saat ada INSERT baru            │
│  - Scheduled Function (eksternal) → trigger continuous learning worker jam 02:00       │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Catatan penting (🔧 [REVISI])

**Service Role Key membypass RLS sepenuhnya.** Backend di Hugging Face menggunakan `SUPABASE_SERVICE_ROLE_KEY`, yang artinya RLS **tidak berlaku** untuk query dari backend. Setiap query di backend wajib menambahkan filter `WHERE user_id = <userId dari JWT yang sudah divalidasi>` secara manual. RLS di Supabase hanya melindungi jalur **langsung dari Flutter** (pakai anon/auth key).

**CRUD langsung dari Flutter melewati PII scrubbing.** Karena Flutter bisa nulis langsung ke Supabase tanpa lewat backend, field teks bebas yang diisi manual oleh user (misalnya deskripsi transaksi) tidak pernah disensor middleware. Ini trade-off yang disengaja untuk kecepatan, tapi harus didokumentasikan ke tim/keluarga: hanya field yang lewat chat AI yang otomatis disensor.

---

## 2. Struktur Database & Row-Level Security (RLS) — REVISI

```sql
-- ====================================================================
-- 1. TABEL KEPRIBADIAN AI (AI Personalities) — read-only reference
-- ====================================================================
CREATE TABLE IF NOT EXISTS ai_personalities (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    vibe_description TEXT NOT NULL,
    system_instruction_template TEXT NOT NULL,
    temperature NUMERIC(3, 2) NOT NULL DEFAULT 0.3,
    top_p NUMERIC(3, 2) NOT NULL DEFAULT 0.95
);

ALTER TABLE ai_personalities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Semua user boleh baca daftar ego" ON ai_personalities
    FOR SELECT USING (true);
-- Sengaja tidak ada policy INSERT/UPDATE/DELETE untuk role authenticated
-- → hanya service_role (backend) yang bisa mengubah daftar ego.

-- 🔧 [REVISI] Seed data 5 ego sesuai spesifikasi
INSERT INTO ai_personalities (id, name, vibe_description, system_instruction_template, temperature, top_p) VALUES
(
  'witty_sidekick',
  'The Witty Sidekick',
  'Cerdas, agak sarkas dalam batas aman, setia, suka bercanda — seperti Jarvis versi santai.',
  'Kamu adalah {assistant_name}, asisten pribadi {user_nickname}. Karaktermu: cerdas, sedikit sarkas tapi tetap aman dan suportif, setia, dan suka bercanda. Gunakan analogi pop-culture atau game saat relevan. Setelah memberi data/solusi, jangan ragu menutup dengan punchline ringan ala sahabat yang jenaka. Contoh nada: "Tugas lu udah beres semua, Bos. Gampang banget, kayak ngalahin bos tutorial di game." Jangan berlebihan sampai terasa meremehkan; tetap dapat diandalkan.',
  0.85, 0.95
),
(
  'tough_love_coach',
  'The Tough-Love Coach',
  'Disiplin, to-the-point, fokus target, alarm berjalan untuk produktivitas.',
  'Kamu adalah {assistant_name}, mentor pribadi {user_nickname} yang disiplin dan tegas. Gaya bicaramu: minim basa-basi, langsung ke poin, menyentil kalau {user_nickname} mulai menunda, tapi setiap sentilan disertai instruksi dan solusi yang terstruktur jelas. Contoh nada: "Format laporan sudah siap di folder. Jangan ditunda lagi, makin cepat lu mulai, makin cepat lu bisa santai." Tegas, bukan kasar — selalu ada niat baik di balik ketegasanmu.',
  0.40, 0.85
),
(
  'ultimate_hype_man',
  'The Ultimate Hype-Man',
  'Energetik, super optimis, suportif, cheerleader pribadi.',
  'Kamu adalah {assistant_name}, sahabat paling bersemangat milik {user_nickname}. Gaya bicaramu: penuh energi, ekspresif, sering pakai tanda seru, dan selalu merayakan pencapaian sekecil apa pun dengan antusias. Contoh nada: "Gila, keren banget analisis lu hari ini! Mantap! Kita sikat hari ini dengan maksimal!" Tetap berikan info/data yang akurat — energi tinggi tidak boleh mengorbankan kejelasan informasi.',
  0.90, 0.97
),
(
  'stoic_strategist',
  'The Stoic Strategist',
  'Dingin, logis, tenang di bawah tekanan, penuh perhitungan.',
  'Kamu adalah {assistant_name}, ahli strategi pribadi {user_nickname} yang tenang dan logis. Gaya bicaramu: kalimat terukur, tidak emosional, langsung ke action plan tanpa drama. Contoh nada: "Terjadi perubahan jadwal mendadak. Namun, saya sudah mengatur ulang tiga agenda lain agar Anda tetap bisa beristirahat tepat waktu. Ini opsinya." Setiap respons idealnya diakhiri dengan opsi konkret, bukan sekadar laporan masalah.',
  0.20, 0.80
),
(
  'elegant_confidant',
  'The Elegant Confidant',
  'Sopan, berkelas, penuh rasa hormat, humor halus — vibe ala Alfred di Batman.',
  'Kamu adalah {assistant_name}, pendamping pribadi {user_nickname} yang sopan dan berkelas. Gaya bicaramu: bahasa rapi tapi tidak kaku, sering pakai pertanyaan retoris yang menenangkan, dan selalu menempatkan kenyamanan {user_nickname} sebagai prioritas. Contoh nada: "Semua berkas yang Anda minta sudah rapi di meja kerja virtual Anda. Apakah ada hal lain yang perlu saya selesaikan sebelum Anda beristirahat?" Selipkan humor halus dan cerdas sesekali, jangan kering.',
  0.50, 0.90
)
ON CONFLICT (id) DO NOTHING;


-- ====================================================================
-- 2. TABEL PROFIL PENGGUNA — 🔧 [REVISI] tambah kolom dynamic_metadata
-- ====================================================================
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
    fullname VARCHAR(255) NOT NULL,
    selected_personality VARCHAR(50) REFERENCES ai_personalities(id) DEFAULT 'witty_sidekick',
    assistant_name VARCHAR(100) DEFAULT 'Sobat AI',
    user_nickname VARCHAR(100) DEFAULT 'Sobat',
    dynamic_metadata JSONB DEFAULT '{}'::jsonb,  -- 🔧 kolom yang sebelumnya hilang
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_metadata
    ON user_profiles USING GIN (dynamic_metadata);  -- 🔧 index GIN yang disebut tapi hilang di draft awal


-- ====================================================================
-- 3. TABEL GROUP CHAT ROOM — 🔧 [REVISI] RLS ditambahkan
-- ====================================================================
CREATE TABLE IF NOT EXISTS app_chat_rooms (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    created_by UUID REFERENCES user_profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE app_chat_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lihat room yang diikuti" ON app_chat_rooms
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM app_room_members m
            WHERE m.room_id = app_chat_rooms.id AND m.user_id = auth.uid()
        )
    );

CREATE POLICY "Buat room baru" ON app_chat_rooms
    FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "Hanya creator yang bisa ubah/hapus room" ON app_chat_rooms
    FOR UPDATE USING (created_by = auth.uid());

CREATE POLICY "Hanya creator yang bisa hapus room" ON app_chat_rooms
    FOR DELETE USING (created_by = auth.uid());


-- ====================================================================
-- 4. ANGGOTA ROOM CHAT — 🔧 [REVISI] RLS ditambahkan
-- ====================================================================
CREATE TABLE IF NOT EXISTS app_room_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id UUID REFERENCES app_chat_rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE app_room_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lihat member room yang sama" ON app_room_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM app_room_members me
            WHERE me.room_id = app_room_members.room_id AND me.user_id = auth.uid()
        )
    );

-- Hanya creator room yang boleh menambahkan member baru (mencegah self-invite sembarangan)
CREATE POLICY "Creator menambahkan member" ON app_room_members
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM app_chat_rooms r
            WHERE r.id = app_room_members.room_id AND r.created_by = auth.uid()
        )
    );

-- User boleh keluar dari room sendiri
CREATE POLICY "Keluar dari room sendiri" ON app_room_members
    FOR DELETE USING (user_id = auth.uid());


-- ====================================================================
-- 5. HUBUNGAN MUTUAL TOKEN ANTAR AI PENGGUNA — 🔧 [REVISI] RLS ditambahkan
-- ====================================================================
CREATE TABLE IF NOT EXISTS ai_mutual_connections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id UUID REFERENCES app_chat_rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    connected_user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(room_id, user_id, connected_user_id)
);

ALTER TABLE ai_mutual_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lihat koneksi milik sendiri" ON ai_mutual_connections
    FOR SELECT USING (user_id = auth.uid() OR connected_user_id = auth.uid());

CREATE POLICY "Buat koneksi sendiri" ON ai_mutual_connections
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Hapus koneksi sendiri" ON ai_mutual_connections
    FOR DELETE USING (user_id = auth.uid());


-- ====================================================================
-- 6. LOG PESAN CHAT — 🔧 [REVISI] RLS ditambahkan
-- ====================================================================
CREATE TABLE IF NOT EXISTS app_chat_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id UUID REFERENCES app_chat_rooms(id) ON DELETE CASCADE, -- NULL jika private chat ke AI
    sender_id UUID REFERENCES user_profiles(id), -- NULL jika pengirimnya adalah AI
    sender_personality_id VARCHAR(50) REFERENCES ai_personalities(id),
    message TEXT NOT NULL,  -- 🔧 catatan: ini wajib sudah versi yang DI-SCRUB, lihat Bab 6
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE app_chat_messages ENABLE ROW LEVEL SECURITY;

-- Private chat ke AI (room_id NULL): hanya pengirim sendiri yang bisa lihat
-- Group chat (room_id ada isinya): hanya member room yang bisa lihat
CREATE POLICY "Lihat pesan sesuai konteks" ON app_chat_messages
    FOR SELECT USING (
        (room_id IS NULL AND sender_id = auth.uid())
        OR
        (room_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM app_room_members m
            WHERE m.room_id = app_chat_messages.room_id AND m.user_id = auth.uid()
        ))
    );

CREATE POLICY "Kirim pesan sesuai konteks" ON app_chat_messages
    FOR INSERT WITH CHECK (
        (room_id IS NULL AND sender_id = auth.uid())
        OR
        (room_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM app_room_members m
            WHERE m.room_id = app_chat_messages.room_id AND m.user_id = auth.uid()
        ))
    );


-- ====================================================================
-- 7. TABEL TO-DO LIST (tetap sama + index GIN)
-- ====================================================================
CREATE TABLE IF NOT EXISTS todo_lists (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    task_name TEXT NOT NULL,
    status VARCHAR(20) CHECK (status IN ('pending', 'completed', 'cancelled')) DEFAULT 'pending',
    due_date TIMESTAMP WITH TIME ZONE,
    dynamic_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_todo_lists_metadata
    ON todo_lists USING GIN (dynamic_metadata);  -- 🔧 index GIN ditambahkan


-- ====================================================================
-- 8. TABEL MONEY TRACKER (tetap sama + index GIN)
-- ====================================================================
CREATE TABLE IF NOT EXISTS money_trackers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    amount NUMERIC(15, 2) NOT NULL,
    type VARCHAR(10) CHECK (type IN ('income', 'expense')) NOT NULL,
    description TEXT,
    transaction_date DATE DEFAULT CURRENT_DATE,
    dynamic_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_money_trackers_metadata
    ON money_trackers USING GIN (dynamic_metadata);  -- 🔧 index GIN ditambahkan


-- ====================================================================
-- 9. TABEL CACHE ANALISIS KOGNITIF (tetap sama + index GIN)
-- ====================================================================
CREATE TABLE IF NOT EXISTS ai_insights_cache (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    insight_type VARCHAR(50) NOT NULL,
    cached_reply TEXT NOT NULL,
    sources_metadata JSONB DEFAULT '[]'::jsonb,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, insight_type)
);

CREATE INDEX IF NOT EXISTS idx_ai_insights_sources_metadata
    ON ai_insights_cache USING GIN (sources_metadata);


-- ====================================================================
-- C. AKTIFKAN RLS DAN BUAT POLICIES (tabel inti — tidak berubah dari draft awal)
-- ====================================================================
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_trackers ENABLE ROW LEVEL SECURITY;
ALTER TABLE todo_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_insights_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manage profile pribadi" ON user_profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "Manage keuangan pribadi" ON money_trackers FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Manage tugas pribadi" ON todo_lists FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Manage cache pribadi" ON ai_insights_cache FOR ALL USING (auth.uid() = user_id);
```

---

## 3. Spesifikasi 37 Fitur Analisis — 🔧 [REVISI] Klasifikasi Real-time vs Batch

Untuk menghilangkan kontradiksi antara "insight dihitung via cron" vs "ekspektasi testing real-time" (lihat Bab 0 poin 5), setiap insight sekarang diberi label kelas:

- **Kelas A — Ringan/Real-time** (dihitung ulang otomatis tiap ada transaksi/tugas baru via Database Webhook → endpoint backend, lalu langsung update `ai_insights_cache`): Cash Flow Analysis, Money Leak Auditor, Good Habits Tracker, Consistency Graph, Weekly Priority Matrix, Daily Activity Load.
- **Kelas B — Berat/Batch** (tetap dihitung terjadwal, butuh agregasi historis besar atau pemanggilan Gemini): Runway Prediction, Financial Risk Simulator, Burnout Detection Engine, Mood vs Spending, Mood vs Productivity, Trend Worth-It Score, dan metrik analitik lain yang butuh konteks naratif AI.

Daftar 37 fitur itu sendiri (kategori Keuangan, Produktivitas, Life Balance, Anti-Boros, Anti-FOMO, Habit, Prioritas Hidup, Risiko Masa Depan, dan Cerdas Tambahan) **tidak berubah substansinya** dari draft awal — perubahan hanya di mekanisme kapan masing-masing dihitung ulang. Saat implementasi, setiap baris di `ai_insights_cache.insight_type` sebaiknya ditandai kelasnya (bisa lewat tabel referensi kecil terpisah atau kolom tambahan `compute_class`).

---

## 4. UI/UX Aplikasi Mobile Flutter: Chat Multi-Bubble — 🔧 [REVISI] Kontrak Disederhanakan

**Keputusan:** backend selalu mengembalikan response chat dalam bentuk array `bubbles` yang sudah terpisah (lihat contoh respons di Bab 9). Flutter **tidak perlu lagi** melakukan parsing string `[BREAK]` di sisi client — cukup looping array tersebut dan render setiap elemen sebagai bubble baru dengan delay simulasi mengetik (jeda antar elemen, misal 1000–1500ms).

Ini menghilangkan dua sumber bug sekaligus: (1) ketidaksinkronan format antara dokumentasi Bab 4 lama dan contoh response API di Bab 9 lama, dan (2) logika split string yang rawan kalau suatu saat backend lupa menyisipkan delimiter `[BREAK]` dengan benar. Tag `[BREAK]` tetap dipakai **secara internal** di prompt Stage 2 (instruksi ke Gemini), tapi pemecahannya jadi tugas backend sebelum dikirim sebagai JSON — bukan tugas client.

Realtime listener Supabase tetap dipakai untuk kasus **group chat** (pesan masuk dari user lain di room yang sama), bukan untuk membelah satu balasan AI menjadi bubble.

---

## 5. Mengamankan & Menampilkan Web App Secara Privat — 🔧 [REVISI]

### A. robots.txt — tetap sama
```
User-agent: *
Disallow: /
```

### B. 🔧 [REVISI] Token tidak lagi lewat URL parameter

Alasan: token di query string berisiko tersimpan di history WebView, log akses Vercel, dan referrer header jika ada script pihak ketiga di halaman dashboard. **Solusi:** Flutter membuka WebView ke URL bersih (tanpa token), lalu setelah halaman selesai load, Flutter mengirim `access_token` **dan** `refresh_token` lewat mekanisme `postMessage` ke konteks JavaScript halaman. Web App mendengarkan event tersebut, baru memanggil `supabase.auth.setSession()` dengan kedua token itu (bukan cuma `access_token` dengan `refresh_token` dikosongkan seperti draft awal) — sehingga begitu access token expired (±1 jam), Supabase client di Web App bisa otomatis refresh sesi tanpa perlu reload total dari aplikasi HP.

Sebagai langkah tambahan, Web App juga sebaiknya punya fallback: kalau sesi benar-benar tidak bisa direfresh (refresh token juga expired/revoked), tampilkan pesan minta reload dari aplikasi — bukan dianggap error fatal.

### C. 🔧 [REVISI] Validasi backend chat tidak lagi percaya `userId` dari body

Alur middleware gateway sekarang dua lapis:
1. **Lapis 1 — Gateway key** (`x-jarvis-gateway-key`): memastikan request datang dari aplikasi resmi, bukan endpoint publik terbuka. Tetap dipakai sebagai filter awal yang murah.
2. **Lapis 2 — Validasi JWT Supabase**: header `Authorization: Bearer <access_token>` divalidasi langsung ke Supabase Auth (atau verifikasi signature JWT menggunakan JWT secret project). `userId` yang dipakai untuk semua operasi database **diambil dari klaim `sub` token tersebut**, bukan dari field `userId` yang dikirim di body. Kalau body mengirim `userId` yang berbeda dari token, request ditolak (atau diabaikan, body `userId` dianggap tidak otoritatif).

Dengan begitu, sekalipun gateway key berhasil diekstrak dari APK (yang memang selalu mungkin terjadi pada static secret di client), penyerang tetap tidak bisa bertindak atas nama user lain tanpa punya access token user tersebut.

---

## 6. PII Scrubbing — 🔧 [REVISI] Diterapkan Sebelum Penyimpanan, Bukan Hanya Sebelum ke Gemini

Di draft awal, scrubbing PII (Regex sensor PIN/password/no kartu kredit) hanya disebut berjalan "sebelum diteruskan ke API eksternal (Gemini)". Ini menyisakan kemungkinan chat log mentah (dengan PII) tetap tersimpan di `app_chat_messages`, yang kemudian dibaca ulang oleh **continuous learning worker** dan dikirim lagi ke Gemini — PII yang sudah disensor di jalur pertama jadi bocor lagi lewat jalur kedua.

**Perbaikan:** middleware PII scrubbing dijalankan di awal pipeline, **sebelum** pesan masuk dari user disimpan ke `app_chat_messages` sama sekali. Konsekuensinya:
- Versi yang tersimpan di database sudah otomatis bersih untuk semua proses turunan (Stage 1/2 Gemini, continuous learning worker, ekspor data, dsb).
- Tidak perlu lagi menjalankan scrubbing dua kali di tempat berbeda — cukup satu titik kebenaran (single source of truth).
- Catatan: scrubbing ini hanya melindungi jalur **chat AI**. Jalur CRUD manual langsung Flutter→Supabase tetap di luar jangkauan middleware ini (lihat catatan trade-off di Bab 1).

---

## 7. Sesi Pembelajaran Mandiri AI Latar Belakang — 🔧 [REVISI]

Dua perbaikan di bagian ini:

**A. Update `dynamic_metadata` sekarang merge, bukan overwrite.**
Draft awal melakukan `update({ dynamic_metadata: { long_term_memory: ... } })` yang akan menghapus key lain apa pun yang mungkin sudah ada di `dynamic_metadata` milik `user_profiles`. Perbaikannya: baca dulu nilai `dynamic_metadata` saat ini, gabungkan (`{...existing, long_term_memory: newInsightInstruction}`), baru simpan kembali — atau gunakan fungsi PostgreSQL `jsonb_set` langsung di query supaya atomik dan tidak ada race condition antar proses.

**B. Worker tidak lagi mengandalkan `node-cron` in-process.**
Karena Hugging Face Spaces gratis bisa "sleep" saat idle, penjadwalan jam 02:00 di dalam proses Node.js tidak terjamin jalan. Perbaikan: jadwal dipindah ke trigger eksternal — misalnya GitHub Actions dengan `schedule: cron` yang melakukan HTTP request ke endpoint `/internal/run-learning-cycle` di backend pada jam yang ditentukan (request inilah yang sekaligus "membangunkan" Space dari sleep), atau alternatif memakai Supabase Scheduled/Edge Function kalau ingin tetap satu ekosistem dengan Supabase. Logika `runContinuousLearning()` sendiri tetap sama persis, hanya pemicunya yang dipindah keluar dari proses Node yang rapuh terhadap sleep.

---

## 8. Checklist Panduan Pengerjaan (Revisi)

- [ ] Langkah 1: Tulis `src/server.js` dengan Two-Stage Pipeline **+ middleware validasi JWT yang derive `userId` dari token** (bukan dari body).
- [ ] Langkah 2: Endpoint `/api/v1/user/personality` tetap ada, tapi validasi `userId` ikut pola Langkah 1.
- [ ] Langkah 3: `secureGatewayMiddleware` jadi dua lapis (gateway key + JWT verification), sesuai Bab 5-C.
- [ ] Langkah 4: PII scrubbing dipindah ke titik paling awal pipeline, sebelum `INSERT` ke `app_chat_messages` (Bab 6).
- [ ] Langkah 5: `continuous_learning_worker.js` — ubah update jadi merge (Bab 7-A), dan hapus pemanggilan `node-cron` — ganti dengan endpoint yang dipicu eksternal (Bab 7-B).
- [ ] Langkah 6: Tambahkan endpoint `/internal/recompute-insight` untuk insight Kelas A (Bab 3), dihubungkan ke Supabase Database Webhook pada tabel `money_trackers` dan `todo_lists`.

---

## 9. Checklist Rencana Aksi — Fase yang Berubah

**Fase 1 (Setup Supabase):** tambahkan langkah eksplisit menjalankan seed 5 ego (sudah ada di skema Bab 2, tidak perlu file terpisah lagi) dan memverifikasi semua 9 tabel (bukan cuma 4) sudah berstatus RLS aktif lewat menu Authentication → Policies.

**Fase 4 (Deployment Hugging Face):** tambahkan langkah membuat secret tambahan `SUPABASE_JWT_SECRET` (untuk verifikasi token di Langkah 3 Bab 8) di Settings Hugging Face Space.

**Fase 4 tambahan:** setup GitHub Actions scheduled workflow (file `.github/workflows/nightly-learning.yml`) yang melakukan `curl` terjadwal ke endpoint `/internal/run-learning-cycle`, menggantikan ketergantungan pada `node-cron` in-process.

**Fase 5 (Vercel):** ubah Langkah 5.2 — bukan lagi membaca `auth_token` dari URL param, melainkan memasang event listener `window.addEventListener('message', ...)` untuk menerima token dari Flutter WebView (Bab 5-B).

**Fase 6 (Flutter):** Langkah 6.3 disederhanakan — tidak perlu lagi logika split `[BREAK]`, cukup iterasi array `bubbles` dari response API (Bab 4). Langkah 6.5 diubah: WebView tidak lagi membangun URL dengan query param token, melainkan menyuntik token via `postMessage` setelah `onLoadStop`.

**Fase 7 (Testing):** tambahkan kasus uji baru — kirim transaksi kecil, lalu verifikasi insight **Kelas A** (misal Money Leak Auditor) ter-update dalam hitungan detik (via webhook), sementara insight **Kelas B** (misal Runway Prediction) memang baru ter-update di siklus batch berikutnya — ini ekspektasi yang benar, bukan bug.

---

## 10. Hal yang Perlu Diverifikasi Sebelum Eksekusi (Tidak Diubah, Hanya Diingatkan)

- Nama paket npm SDK Gemini terbaru (cek dokumentasi resmi Google AI saat ini sebelum `npm install`, karena penamaan paket berubah).
- Spesifikasi tier gratis Hugging Face Spaces (RAM/vCPU/kebijakan sleep) — cek halaman pricing terbaru karena bisa berubah.
- Kuota rate-limit API Gemini tier gratis dibandingkan estimasi volume pemakaian 10 user aktif (2x call per pesan chat + worker harian + recompute insight Kelas A) — lakukan estimasi kasar dulu sebelum full rollout, supaya tidak kena limit harian secara tidak terduga.
