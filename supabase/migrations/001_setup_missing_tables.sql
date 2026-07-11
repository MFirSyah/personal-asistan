-- ============================================================================
-- Phase 1: Setup Missing Tables
-- Arsitektur Reference: Bagian 2, 13.7, 22.2
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Table: notifications_log
-- Log notifikasi smartphone yang masuk & dianggap penting
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_app TEXT NOT NULL,           -- e.g., com.whatsapp, com.google.android.gm
  title TEXT,
  body TEXT,
  category TEXT,                      -- 'meeting', 'finance', 'urgent', 'other'
  priority TEXT DEFAULT 'informational' CHECK (priority IN ('urgent', 'important', 'informational', 'noise')),
  is_important BOOLEAN DEFAULT false,
  is_actioned BOOLEAN DEFAULT false, -- sudah "didatangi" user?
  requires_action BOOLEAN DEFAULT false,
  suggested_deadline TIMESTAMPTZ,
  reasoning TEXT,                    -- hasil klasifikasi AI (untuk audit)
  user_feedback TEXT,                -- 'confirmed_important' | 'marked_not_important' | null
  raw_payload JSONB DEFAULT '{}',     -- data mentah dari NotificationListener
  received_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for notifications_log
CREATE INDEX IF NOT EXISTS idx_notif_user_time ON notifications_log(user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_user_priority ON notifications_log(user_id, priority) WHERE priority IN ('urgent', 'important');
CREATE INDEX IF NOT EXISTS idx_notif_user_important ON notifications_log(user_id, is_important, is_actioned) WHERE is_important = true AND is_actioned = false;
CREATE INDEX IF NOT EXISTS idx_notif_source_app ON notifications_log(user_id, source_app);

-- ============================================================================
-- Table: activity_log
-- Log aktivitas harian user (kerja, personal, kesehatan, dll)
-- ============================================================================
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity TEXT NOT NULL,
  category TEXT,                      -- 'work', 'personal', 'health', 'other'
  source TEXT DEFAULT 'manual',      -- 'chat', 'notification', 'manual'
  mood TEXT,                         -- 'happy', 'neutral', 'sad', 'stressed', 'energized'
  energy_level INTEGER CHECK (energy_level >= 1 AND energy_level <= 5),
  notes TEXT,
  custom_fields JSONB DEFAULT '{}', -- kolom dinamis ala Notion
  ai_suggestions JSONB DEFAULT '{}', -- staging area untuk smart backfill
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for activity_log
CREATE INDEX IF NOT EXISTS idx_activity_user_time ON activity_log(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_user_category ON activity_log(user_id, category);
CREATE INDEX IF NOT EXISTS idx_activity_user_mood ON activity_log(user_id, mood);

-- ============================================================================
-- Table: custom_field_definitions
-- Metadata untuk kolom dinamis (Notion-style)
-- Arsitektur Reference: Bagian 13.7, 22.2
-- ============================================================================
CREATE TABLE IF NOT EXISTS custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL CHECK (table_name IN ('finance_records', 'activity_log', 'notifications_log')),
  field_key TEXT NOT NULL,          -- key di dalam custom_fields JSONB, e.g., "payment_method"
  label TEXT NOT NULL,              -- nama tampilan, e.g., "Metode Pembayaran"
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'select', 'boolean', 'date')),
  select_options JSONB DEFAULT '[]', -- dipakai kalau field_type = 'select'
  inferable BOOLEAN DEFAULT false,  -- boleh diisi otomatis via smart backfill?
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, table_name, field_key)
);

-- Indexes for custom_field_definitions
CREATE INDEX IF NOT EXISTS idx_cfd_user_table ON custom_field_definitions(user_id, table_name);
CREATE INDEX IF NOT EXISTS idx_cfd_user ON custom_field_definitions(user_id);

-- ============================================================================
-- Table: custom_analyses
-- Widget analisis dinamis yang dibuat user via chat
-- Arsitektur Reference: Bagian 11
-- ============================================================================
CREATE TABLE IF NOT EXISTS custom_analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  chart_type TEXT NOT NULL CHECK (chart_type IN ('line', 'bar', 'pie', 'table', 'number')),
  data_source TEXT NOT NULL CHECK (data_source IN ('finance_records', 'activity_log', 'notifications_log')),
  query_config JSONB NOT NULL DEFAULT '{}', -- whitelist config, bukan SQL bebas
  is_pinned BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for custom_analyses
CREATE INDEX IF NOT EXISTS idx_ca_user ON custom_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_ca_user_pinned ON custom_analyses(user_id, is_pinned, sort_order);

-- ============================================================================
-- Table: schema_change_requests
-- Request kolom baru (bukan custom_fields JSONB)
-- Arsitektur Reference: Bagian 22.3
-- ============================================================================
CREATE TABLE IF NOT EXISTS schema_change_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  proposed_column TEXT NOT NULL,
  proposed_type TEXT NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'applied')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for schema_change_requests
CREATE INDEX IF NOT EXISTS idx_scr_user ON schema_change_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_scr_status ON schema_change_requests(status);

-- ============================================================================
-- Table: ai_suggestions (standalone untuk audit trail)
-- Tempat staging saran AI sebelum di-approve user
-- Arsitektur Reference: Bagian 22.4
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_suggestions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  field_key TEXT NOT NULL,
  suggested_value JSONB NOT NULL,     -- { value, confidence, reasoning }
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, table_name, record_id, field_key)
);

-- Indexes for ai_suggestions
CREATE INDEX IF NOT EXISTS idx_ais_user_status ON ai_suggestions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ais_record ON ai_suggestions(table_name, record_id);

-- ============================================================================
-- Table: ai_action_logs
-- Audit trail untuk semua aksi AI (tool calls)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_action_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  table_name TEXT,
  statement_preview TEXT,
  full_statement JSONB,
  status TEXT CHECK (status IN ('pending', 'success', 'failed', 'blocked', 'error')),
  error_message TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for ai_action_logs
CREATE INDEX IF NOT EXISTS idx_aal_user ON ai_action_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_aal_created ON ai_action_logs(created_at DESC);

-- ============================================================================
-- Add columns to existing tables (not in original schema)
-- ============================================================================

-- Add custom_fields and ai_suggestions to finance_records (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'finance_records' AND column_name = 'custom_fields') THEN
    ALTER TABLE finance_records ADD COLUMN custom_fields JSONB DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'finance_records' AND column_name = 'ai_suggestions') THEN
    ALTER TABLE finance_records ADD COLUMN ai_suggestions JSONB DEFAULT '{}';
  END IF;
END $$;

-- Add transaction_date if not exists (for consistency with money_trackers)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'finance_records' AND column_name = 'transaction_date') THEN
    ALTER TABLE finance_records ADD COLUMN transaction_date TIMESTAMPTZ;
  END IF;
END $$;

-- Add updated_at to tables that don't have it
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'money_trackers' AND column_name = 'updated_at') THEN
    ALTER TABLE money_trackers ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'todo_lists' AND column_name = 'updated_at') THEN
    ALTER TABLE todo_lists ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

-- ============================================================================
-- Update function: update_updated_at_column()
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_notifications_log_updated_at ON notifications_log;
CREATE TRIGGER update_notifications_log_updated_at BEFORE UPDATE ON notifications_log
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_activity_log_updated_at ON activity_log;
CREATE TRIGGER update_activity_log_updated_at BEFORE UPDATE ON activity_log
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_custom_field_definitions_updated_at ON custom_field_definitions;
CREATE TRIGGER update_custom_field_definitions_updated_at BEFORE UPDATE ON custom_field_definitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_custom_analyses_updated_at ON custom_analyses;
CREATE TRIGGER update_custom_analyses_updated_at BEFORE UPDATE ON custom_analyses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_schema_change_requests_updated_at ON schema_change_requests;
CREATE TRIGGER update_schema_change_requests_updated_at BEFORE UPDATE ON schema_change_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_money_trackers_updated_at ON money_trackers;
CREATE TRIGGER update_money_trackers_updated_at BEFORE UPDATE ON money_trackers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_todo_lists_updated_at ON todo_lists;
CREATE TRIGGER update_todo_lists_updated_at BEFORE UPDATE ON todo_lists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON TABLE notifications_log IS 'Log notifikasi smartphone yang masuk';
COMMENT ON TABLE activity_log IS 'Log aktivitas harian user';
COMMENT ON TABLE custom_field_definitions IS 'Metadata kolom dinamis (Notion-style)';
COMMENT ON TABLE custom_analyses IS 'Widget analisis dinamis yang dibuat via chat';
COMMENT ON TABLE schema_change_requests IS 'Request kolom baru (bukan custom_fields)';
COMMENT ON TABLE ai_suggestions IS 'Staging area saran AI sebelum di-approve user';
COMMENT ON TABLE ai_action_logs IS 'Audit trail untuk aksi AI (tool calls)';
