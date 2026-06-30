-- ====================================================================
-- CHAT PREFERENCES TABLE - Hybrid Personalization System
-- Mengisi kekosongan dari Skema 1 + Hybrid
-- ====================================================================

-- Tabel Preferensi Chat (untuk personalisasi hybrid)
CREATE TABLE IF NOT EXISTS chat_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

  -- Communication Style
  communication_style TEXT DEFAULT 'mix'
    CHECK (communication_style IN ('formal', 'casual', 'mix')),
  explanation_style TEXT DEFAULT 'balanced'
    CHECK (explanation_style IN ('brief', 'detailed', 'balanced')),

  -- Topics Analysis (topik yang sering dibahas)
  frequent_topics TEXT[] DEFAULT '{}',
  topic_frequencies JSONB DEFAULT '{}'::jsonb,

  -- User Language Patterns
  common_words TEXT[] DEFAULT '{}',
  avoided_words TEXT[] DEFAULT '{}',

  -- Interaction Patterns
  avg_message_length INTEGER DEFAULT 0,
  prefers_emoji BOOLEAN DEFAULT true,
  prefers_lists BOOLEAN DEFAULT false,

  -- Session Stats
  total_chats INTEGER DEFAULT 0,
  last_chat_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index untuk query cepat
CREATE INDEX IF NOT EXISTS idx_chat_prefs_user_id ON chat_preferences(user_id);

-- ====================================================================
-- ENHANCED: app_chat_messages - tambah kolom untuk learning
-- ====================================================================
ALTER TABLE app_chat_messages
  ADD COLUMN IF NOT EXISTS detected_topic TEXT,
  ADD COLUMN IF NOT EXISTS sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  ADD COLUMN IF NOT EXISTS response_quality INTEGER CHECK (response_quality BETWEEN 1 AND 5);

-- Index untuk chat analysis
CREATE INDEX IF NOT EXISTS idx_chat_messages_topic ON app_chat_messages(detected_topic);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sentiment ON app_chat_messages(sentiment);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_date ON app_chat_messages(user_id, created_at DESC);

-- ====================================================================
-- RLS POLICIES untuk chat_preferences
-- ====================================================================
ALTER TABLE chat_preferences ENABLE ROW LEVEL SECURITY;

-- Policy: User hanya bisa lihat/preferences sendiri
CREATE POLICY "chat_prefs_self_access" ON chat_preferences
  FOR ALL USING (auth.uid() = user_id);

-- Policy: Chat messages dengan topic detection (RLS sama dengan yang sudah ada, jadi pakai yang existing)
-- Tambahan policy untuk kolom baru
CREATE POLICY "chat_messages_with_metadata" ON app_chat_messages
  FOR SELECT USING (
    (room_id IS NULL AND user_id = auth.uid())
    OR
    (room_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM app_room_members m
      WHERE m.room_id = app_chat_messages.room_id AND m.user_id = auth.uid()
    ))
  );

-- ====================================================================
-- FUNCTION: Auto-create chat_preferences saat user baru daftar
-- ====================================================================
CREATE OR REPLACE FUNCTION handle_new_user_chat_prefs()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO chat_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger untuk auto-create chat_preferences
DROP TRIGGER IF EXISTS on_auth_user_created_chat_prefs ON auth.users;
CREATE TRIGGER on_auth_user_created_chat_prefs
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_chat_prefs();

-- ====================================================================
-- FUNCTION: Auto-update updated_at
-- ====================================================================
CREATE OR REPLACE FUNCTION update_chat_prefs_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger untuk auto-update timestamp
DROP TRIGGER IF EXISTS update_chat_prefs_modtime ON chat_preferences;
CREATE TRIGGER update_chat_prefs_modtime
  BEFORE UPDATE ON chat_preferences
  FOR EACH ROW EXECUTE FUNCTION update_chat_prefs_timestamp();
