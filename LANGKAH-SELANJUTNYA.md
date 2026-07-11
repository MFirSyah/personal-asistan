# Langkah Selanjutnya — Panduan Pemula

Ini adalah panduan langkah demi langkah untuk memulai development setelah scaffold ini siap. Saya (Claude Code) akan membantu kamu di setiap langkahnya.

---

## Langkah 0: Persiapan Sebelum Memulai

### Yang Perlu Disiapkan

1. **Akun-akun berikut** (semua gratis):
   - [ ] Akun [Supabase](https://supabase.com) — untuk database dan auth
   - [ ] Akun [Vercel](https://vercel.com) — untuk hosting backend
   - [ ] Akun [Google AI Studio](https://aistudio.google.com) — untuk Gemini API key
   - [ ] Akun [Google Stitch](https://stitch.withgoogle.com) — untuk generate desain UI
   - [ ] Akun Claude Code (minimal paket Pro $20/bulan) — [disini](https://claude.com/pricing)

2. **Tool development**:
   - [ ] VS Code dengan extension "Claude Code"
   - [ ] Flutter SDK (untuk mobile app)
   - [ ] Node.js 18+ (untuk web app)

---

## Langkah 1: Generate Desain UI di Google Stitch

**Kenapa dulu?** Karena semua keputusan visual (warna, glass effect, radius) akan diambil dari sini. Ini memastikan mobile dan web app punya tampilan yang konsisten.

1. Buka [Google Stitch](https://stitch.withgoogle.com)
2. Buat **Project 1 — Mobile** (pilih platform "App/Mobile")
3. Gunakan prompt dari `docs/stitch-prompts.md`:
   - Prompt A → Generate layar Chat (fondasi desain)
   - Prompt B → Generate Tab Analisis
   - Prompt C → Generate Tab Setting
4. Buat **Project 2 — Web** (pilih platform "Web")
5. Gunakan Prompt D → Kontrol Data
6. Gunakan Prompt E → Kontrol Analisis

**Setelah selesai:**
- Buka tab **DESIGN.md** di Project 1 (Mobile)
- Copy isinya, paste ke file `DESIGN.md` di root project ini
- Ini akan jadi "sumber kebenaran" untuk semua keputusan visual

---

## Langkah 2: Setup Akun & Project

### Supabase
1. Buat project baru di [supabase.com](https://supabase.com)
2. Di **Settings → API**, catat:
   - `Project URL`
   - `anon/public` key
   - `service_role` key (untuk backend only)

### Vercel
1. Buat project baru di [vercel.com](https://vercel.com)
2. Hubungkan ke repo GitHub (atau buat manual)
3. Di project settings, tambahkan environment variables:
   - `SUPABASE_URL` → dari Supabase
   - `SUPABASE_ANON_KEY` → dari Supabase
   - `SUPABASE_SERVICE_ROLE_KEY` → dari Supabase
   - `GEMINI_API_KEY` → dari Google AI Studio

### GitHub Secrets (untuk workflow keep-alive)
1. Buka repo GitHub → Settings → Secrets and variables → Actions
2. Tambahkan:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`

---

## Langkah 3: Setup Database

Di Supabase Dashboard → SQL Editor, jalankan migration berikut:

```sql
-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  photo_url TEXT,
  ai_name TEXT DEFAULT 'Asisten',
  ai_preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Notifications Log
CREATE TABLE notifications_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  source_app TEXT NOT NULL,
  title TEXT,
  body TEXT,
  category TEXT,
  is_important BOOLEAN DEFAULT false,
  is_actioned BOOLEAN DEFAULT false,
  raw_payload JSONB,
  received_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Finance Records
CREATE TABLE finance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('income','expense')),
  amount NUMERIC(14,2) NOT NULL,
  category TEXT,
  description TEXT,
  source TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  custom_fields JSONB DEFAULT '{}'::jsonb,
  ai_suggestions JSONB DEFAULT '{}'::jsonb
);

-- Activity Log
CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  activity TEXT NOT NULL,
  category TEXT,
  source TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  custom_fields JSONB DEFAULT '{}'::jsonb
);

-- Chat History
CREATE TABLE chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('user','assistant','tool')),
  content TEXT,
  tool_calls JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Custom Field Definitions
CREATE TABLE custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL CHECK (table_name IN ('finance_records', 'activity_log')),
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text','number','select','boolean','date')),
  select_options JSONB DEFAULT '[]'::jsonb,
  inferable BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, table_name, field_key)
);

-- Indexes
CREATE INDEX idx_notif_user_time ON notifications_log(user_id, received_at DESC);
CREATE INDEX idx_finance_user_time ON finance_records(user_id, occurred_at DESC);
CREATE INDEX idx_activity_user_time ON activity_log(user_id, occurred_at DESC);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "users_own_data" ON users FOR ALL USING (auth.uid() = id);
CREATE POLICY "notif_own_data" ON notifications_log FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "finance_own_data" ON finance_records FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "activity_own_data" ON activity_log FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "chat_own_data" ON chat_history FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "field_def_own_data" ON custom_field_definitions FOR ALL USING (auth.uid() = user_id);
```

---

## Langkah 4: Setup Project Structure

Sekarang kita akan setup struktur folder. Buka VS Code dengan project ini, lalu ketik di panel Claude Code:

```
/new-feature setup project awal dari nol

Untuk task pertama ini, JANGAN implementasi fitur apapun dulu — cuma setup fondasi:

1. Scaffold Flutter project kosong di apps/mobile
2. Scaffold Next.js project kosong di apps/web (App Router, TypeScript, Tailwind)
3. Siapkan file .env.local.example di apps/web dengan placeholder untuk
   SUPABASE_URL, SUPABASE_ANON_KEY, GEMINI_API_KEY
4. Setup Supabase client di apps/web
```

Ikuti instruksi yang muncul dan tunggu approval dari kamu sebelum eksekusi.

---

## Langkah 5: Urutan Development (berdasarkan arsitektur.md bagian 23)

Setelah fondasi siap, ikuti urutan ini:

| No | Task | Keterangan |
|----|------|------------|
| 1 | Setup auth + tab Setting mobile | Paling sederhana, belajar auth flow |
| 2 | Notification listener Android | Fondasi fitur inti |
| 3 | Local DB + sync | Offline-first foundation |
| 4 | Tab Analisis mobile | Query agregasi sederhana |
| 5 | AI Chat integration | Function calling + anti-halusinasi |
| 6 | Web app Kontrol Data | CRUD + kolom dinamis |
| 7 | Web app Kontrol Analisis | Widget dinamis |
| 8 | Klasifikasi notifikasi AI | Prioritas + personalisasi |
| 9 | Smart backfill | Untuk data lama |

---

## Tips Penting

### Soal Biaya
- **Gemini Flash** gratis dan cukup untuk hampir semua fitur
- Jangan pakai Gemini Pro kecuali benar-benar perlu
- Supabase Free auto-pause 7 hari tanpa aktivitas → workflow `keep-supabase-alive.yml` sudah disiapkan

### Soal Battery (Android)
- Vendor seperti Xiaomi/Oppo suka kill background service
- Test di device asli, bukan emulator
- Whitelist app dari battery optimization sejak awal

### Soal Plan Mode
- Plan Mode aktif secara default di project ini
- Kamu akan selalu melihat rencana sebelum eksekusi
- Tekan `Shift+Tab` dua kali untuk toggle manual

### Kalau Stuck
1. Baca `docs/arsitektur.md` — mungkin sudah ada jawabannya
2. Baca `docs/progress-log.md` — lihat apa yang sudah dikerjakan
3. Tanya saya (Claude Code) dengan jelas apa yang error atau bingung

---

## Checklist Sebelum呼叫 Claude Code

Setiap kali mau minta bantuan, pastikan:
- [ ] Sudah baca bagian relevan di `docs/arsitektur.md`
- [ ] Sudah cek `docs/progress-log.md` untuk konteks
- [ ] tahu persis fitur apa yang mau dibuat (bukan "bantu aku bikin app")
- [ ] sudah di Plan Mode atau siap approve rencana

---

## Sumber Referensi

| File | Fungsi |
|------|--------|
| `CLAUDE.md` | Entry point utama (otomatis dibaca Claude) |
| `AGENTS.md` | Konteks proyek (di-import CLAUDE.md) |
| `DESIGN.md` | Token visual (ISI SETELAH Stitch) |
| `docs/arsitektur.md` | Spesifikasi teknis lengkap |
| `docs/system-prompt-chat-ai.md` | Prompt untuk AI Chat dalam app |
| `docs/stitch-prompts.md` | Prompt untuk generate desain |
| `docs/progress-log.md` | Log pekerjaan yang sudah selesai |
| `.claude/rules/*.md` | Aturan yang harus diikuti |
| `.claude/commands/*.md` | Slash command yang tersedia |
