-- ====================================================================
-- MIGRATION: 20260703000000_extend_schema_for_reference_architecture
-- Description: Menambah tabel dan kolom sesuai arsitektur reference
-- - notifications_log (notification capture)
-- - custom_field_definitions (dynamic columns)
-- - custom_analyses (dashboard widgets)
-- - schema_change_requests (AI schema proposals)
-- - custom_fields dan ai_suggestions ke tabel existing
-- - VIEW finance_records (compatibility layer)
-- ====================================================================
-- NOTE: Ini adalah mirror migration dari ai_personal_asistan
-- Database Supabase (nvewoijluolkxrszeoar.supabase.co) adalah SAMA
-- Jalankan hanya SATU KALI atau skip jika sudah pernah di-run

-- ====================================================================
-- 1. TABEL NOTIFICATIONS LOG (Notification Capture)
-- ====================================================================
CREATE TABLE IF NOT EXISTS notifications_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    source_app TEXT NOT NULL,                          -- misal: com.whatsapp
    title TEXT,
    body TEXT,
    category TEXT,                                    -- 'meeting', 'finance', 'urgent', 'lainnya'
    priority VARCHAR(20) DEFAULT 'informational' CHECK (priority IN ('urgent', 'important', 'informational', 'noise')),
    is_important BOOLEAN DEFAULT false,
    is_actioned BOOLEAN DEFAULT false,                -- sudah "didatangi" user?
    user_feedback TEXT,                              -- 'confirmed_important' | 'marked_not_important' | NULL
    raw_payload JSONB DEFAULT '{}'::jsonb,
    received_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_time
    ON notifications_log(user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_priority
    ON notifications_log(user_id, priority) WHERE priority IN ('urgent', 'important');
CREATE INDEX IF NOT EXISTS idx_notifications_source_app
    ON notifications_log(user_id, source_app);

-- ====================================================================
-- 2. TABEL CUSTOM FIELD DEFINITIONS (Dynamic Columns)
-- ====================================================================
CREATE TABLE IF NOT EXISTS custom_field_definitions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    table_name TEXT NOT NULL CHECK (table_name IN ('money_trackers', 'todo_lists', 'notifications_log')),
    field_key TEXT NOT NULL,
    label TEXT NOT NULL,
    field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'select', 'boolean', 'date')),
    select_options JSONB DEFAULT '[]'::jsonb,
    inferable BOOLEAN DEFAULT false,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, table_name, field_key)
);

CREATE INDEX IF NOT EXISTS idx_custom_field_def_user_table
    ON custom_field_definitions(user_id, table_name);

-- ====================================================================
-- 3. TABEL CUSTOM ANALYSES (Dashboard Widgets)
-- ====================================================================
CREATE TABLE IF NOT EXISTS custom_analyses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    chart_type VARCHAR(20) NOT NULL CHECK (chart_type IN ('line', 'bar', 'pie', 'table', 'number')),
    data_source TEXT NOT NULL CHECK (data_source IN ('money_trackers', 'todo_lists', 'notifications_log', 'app_chat_messages')),
    query_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_pinned BOOLEAN DEFAULT false,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_custom_analyses_user
    ON custom_analyses(user_id, sort_order);

-- ====================================================================
-- 4. TABEL SCHEMA CHANGE REQUESTS (AI Schema Proposals)
-- ====================================================================
CREATE TABLE IF NOT EXISTS schema_change_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    table_name TEXT NOT NULL,
    proposed_column TEXT NOT NULL,
    proposed_type TEXT NOT NULL,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'applied')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_schema_change_requests_status
    ON schema_change_requests(user_id, status);

-- ====================================================================
-- 5. MODIFIKASI TABEL EXISTING - TAMBAH KOLOM
-- ====================================================================
ALTER TABLE money_trackers
ADD COLUMN IF NOT EXISTS custom_fields TEXT DEFAULT '{}';

ALTER TABLE money_trackers
ADD COLUMN IF NOT EXISTS ai_suggestions TEXT DEFAULT '{}';

ALTER TABLE todo_lists
ADD COLUMN IF NOT EXISTS custom_fields TEXT DEFAULT '{}';

ALTER TABLE todo_lists
ADD COLUMN IF NOT EXISTS ai_suggestions TEXT DEFAULT '{}';

-- ====================================================================
-- 6. VIEW FINANCE_RECORDS (Compatibility Layer)
-- ====================================================================
CREATE OR REPLACE VIEW finance_records AS
SELECT
    id, user_id, type, amount,
    description AS category,
    'manual' AS source,
    transaction_date AS occurred_at,
    custom_fields, ai_suggestions,
    dynamic_metadata, created_at
FROM money_trackers;

-- ====================================================================
-- 7. ACTIVITY LOG VIEW
-- ====================================================================
CREATE OR REPLACE VIEW activity_log AS
SELECT
    id, user_id,
    task_name AS activity,
    status AS category,
    'task' AS source,
    due_date AS occurred_at,
    custom_fields, ai_suggestions,
    created_at
FROM todo_lists
WHERE status IN ('pending', 'completed');

-- ====================================================================
-- 8. AKTIFKAN RLS UNTUK TABEL BARU
-- ====================================================================
ALTER TABLE notifications_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_change_requests ENABLE ROW LEVEL SECURITY;

-- ====================================================================
-- 9. KEBIJAKAN RLS
-- ====================================================================
CREATE POLICY "notifications_own_data"
    ON notifications_log FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "custom_field_def_own_data"
    ON custom_field_definitions FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "custom_analyses_own_data"
    ON custom_analyses FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "schema_change_requests_own_data"
    ON schema_change_requests FOR ALL USING (auth.uid() = user_id);

-- ====================================================================
-- 10. TRIGGER updated_at
-- ====================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_custom_analyses_updated_at ON custom_analyses;
CREATE TRIGGER update_custom_analyses_updated_at
    BEFORE UPDATE ON custom_analyses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ====================================================================
-- 11. HELPER FUNCTIONS
-- ====================================================================
CREATE OR REPLACE FUNCTION get_custom_field(row_data money_trackers, field_name TEXT)
RETURNS TEXT AS $$
DECLARE fields_json JSONB;
BEGIN
    IF row_data.custom_fields IS NULL OR row_data.custom_fields = '' THEN RETURN NULL; END IF;
    fields_json := row_data.custom_fields::jsonb;
    RETURN fields_json ->> field_name;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION update_custom_field(p_row_id UUID, p_user_id UUID, p_field_key TEXT, p_value TEXT)
RETURNS money_trackers AS $$
DECLARE v_result money_trackers;
BEGIN
    UPDATE money_trackers
    SET custom_fields = (
        COALESCE(custom_fields::jsonb, '{}'::jsonb) ||
        jsonb_build_object(p_field_key, p_value::jsonb)
    )::text
    WHERE id = p_row_id AND user_id = p_user_id
    RETURNING * INTO v_result;
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_ai_suggestion(p_row_id UUID, p_user_id UUID, p_field_key TEXT, p_suggestion JSONB)
RETURNS money_trackers AS $$
DECLARE v_result money_trackers;
BEGIN
    UPDATE money_trackers
    SET ai_suggestions = (
        COALESCE(ai_suggestions::jsonb, '{}'::jsonb) ||
        jsonb_build_object(p_field_key, p_suggestion)
    )::text
    WHERE id = p_row_id AND user_id = p_user_id
    RETURNING * INTO v_result;
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;
