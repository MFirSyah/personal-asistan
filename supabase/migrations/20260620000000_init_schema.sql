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

-- ====================================================================
-- 2. TABEL PROFIL PENGGUNA (User Profiles)
-- ====================================================================
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
    fullname VARCHAR(255) NOT NULL,
    selected_personality VARCHAR(50) REFERENCES ai_personalities(id) DEFAULT 'witty_sidekick',
    assistant_name VARCHAR(100) DEFAULT 'Sobat AI',
    user_nickname VARCHAR(100) DEFAULT 'Sobat',
    dynamic_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_metadata
    ON user_profiles USING GIN (dynamic_metadata);

-- ====================================================================
-- 3. TABEL GROUP CHAT ROOM
-- ====================================================================
CREATE TABLE IF NOT EXISTS app_chat_rooms (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    created_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ====================================================================
-- 4. ANGGOTA ROOM CHAT (Room Members)
-- ====================================================================
CREATE TABLE IF NOT EXISTS app_room_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id UUID REFERENCES app_chat_rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ====================================================================
-- 5. HUBUNGAN MUTUAL TOKEN ANTAR AI PENGGUNA
-- ====================================================================
CREATE TABLE IF NOT EXISTS ai_mutual_connections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id UUID REFERENCES app_chat_rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    connected_user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(room_id, user_id, connected_user_id)
);

-- ====================================================================
-- 6. LOG PESAN CHAT (Chat Message Log)
-- ====================================================================
CREATE TABLE IF NOT EXISTS app_chat_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id UUID REFERENCES app_chat_rooms(id) ON DELETE CASCADE, -- NULL jika private chat ke AI
    sender_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL, -- NULL jika pengirimnya adalah AI
    sender_personality_id VARCHAR(50) REFERENCES ai_personalities(id) ON DELETE SET NULL,
    message TEXT NOT NULL,  -- catatan: ini wajib sudah versi yang DI-SCRUB
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ====================================================================
-- 7. TABEL TO-DO LIST
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
    ON todo_lists USING GIN (dynamic_metadata);

-- ====================================================================
-- 8. TABEL MONEY TRACKER
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
    ON money_trackers USING GIN (dynamic_metadata);

-- ====================================================================
-- 9. TABEL CACHE ANALISIS KOGNITIF (Insights Cache)
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
-- SEED DATA 5 EGO/PERSONALITY
-- ====================================================================
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
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  vibe_description = EXCLUDED.vibe_description,
  system_instruction_template = EXCLUDED.system_instruction_template,
  temperature = EXCLUDED.temperature,
  top_p = EXCLUDED.top_p;

-- ====================================================================
-- AKTIFKAN ROW LEVEL SECURITY (RLS)
-- ====================================================================
ALTER TABLE ai_personalities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_mutual_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE todo_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_trackers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_insights_cache ENABLE ROW LEVEL SECURITY;

-- ====================================================================
-- KEBIJAKAN KEAMANAN (RLS Policies)
-- ====================================================================

-- 1. AI Personalities
CREATE POLICY "Semua user boleh baca daftar ego" ON ai_personalities
    FOR SELECT USING (true);

-- 2. User Profiles
CREATE POLICY "Manage profile pribadi" ON user_profiles
    FOR ALL USING (auth.uid() = id);

-- 3. Group Chat Rooms
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

-- 4. Room Members
CREATE POLICY "Lihat member room yang sama" ON app_room_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM app_room_members me
            WHERE me.room_id = app_room_members.room_id AND me.user_id = auth.uid()
        )
    );

CREATE POLICY "Creator menambahkan member" ON app_room_members
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM app_chat_rooms r
            WHERE r.id = app_room_members.room_id AND r.created_by = auth.uid()
        )
    );

CREATE POLICY "Keluar dari room sendiri" ON app_room_members
    FOR DELETE USING (user_id = auth.uid());

-- 5. Mutual Connections
CREATE POLICY "Lihat koneksi milik sendiri" ON ai_mutual_connections
    FOR SELECT USING (user_id = auth.uid() OR connected_user_id = auth.uid());

CREATE POLICY "Buat koneksi sendiri" ON ai_mutual_connections
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Hapus koneksi sendiri" ON ai_mutual_connections
    FOR DELETE USING (user_id = auth.uid());

-- 6. Chat Messages
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

-- 7. To-Do Lists
CREATE POLICY "Manage tugas pribadi" ON todo_lists
    FOR ALL USING (auth.uid() = user_id);

-- 8. Money Trackers
CREATE POLICY "Manage keuangan pribadi" ON money_trackers
    FOR ALL USING (auth.uid() = user_id);

-- 9. Insights Cache
CREATE POLICY "Manage cache pribadi" ON ai_insights_cache
    FOR ALL USING (auth.uid() = user_id);
