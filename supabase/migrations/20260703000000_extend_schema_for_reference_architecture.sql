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

-- Index untuk query performa
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
    field_key TEXT NOT NULL,                        -- key di dalam custom_fields, mis. "payment_method"
    label TEXT NOT NULL,                           -- nama tampilan, mis. "Metode Pembayaran"
    field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'select', 'boolean', 'date')),
    select_options JSONB DEFAULT '[]'::jsonb,      -- dipakai kalau field_type = 'select'
    inferable BOOLEAN DEFAULT false,                -- boleh diisi otomatis lewat smart backfill?
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
    query_config JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { groupBy, aggregation, valueField, filters, dateRange, sortBy, limit }
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

-- Tambah custom_fields ke money_trackers (TEXT untuk SQLite compatibility)
ALTER TABLE money_trackers
ADD COLUMN IF NOT EXISTS custom_fields TEXT DEFAULT '{}';

-- Tambah ai_suggestions ke money_trackers (staging area untuk smart backfill)
ALTER TABLE money_trackers
ADD COLUMN IF NOT EXISTS ai_suggestions TEXT DEFAULT '{}';

-- Tambah custom_fields ke todo_lists
ALTER TABLE todo_lists
ADD COLUMN IF NOT EXISTS custom_fields TEXT DEFAULT '{}';

-- Tambah ai_suggestions ke todo_lists
ALTER TABLE todo_lists
ADD COLUMN IF NOT EXISTS ai_suggestions TEXT DEFAULT '{}';

-- ====================================================================
-- 6. VIEW FINANCE_RECORDS (Compatibility Layer)
-- View ini mengikuti struktur reference architecture finance_records
-- SELECT * FROM finance_records akan return data dari money_trackers
-- dengan kolom-kolom yang sesuai
-- ====================================================================
CREATE OR REPLACE VIEW finance_records AS
SELECT
    id,
    user_id,
    type,                          -- 'income' atau 'expense'
    amount,
    description AS category,       -- map description -> category
    'manual' AS source,
    transaction_date AS occurred_at,
    custom_fields,
    ai_suggestions,
    dynamic_metadata,
    created_at
FROM money_trackers;

-- ====================================================================
-- 7. ACTIVITY LOG VIEW (Reference Architecture Pattern)
-- Untuk konsistensi dengan arsitektur, activity_log bisa dibuat
-- sebagai view dari data yang sudah ada atau sebagai tabel baru
-- ====================================================================
CREATE OR REPLACE VIEW activity_log AS
SELECT
    id,
    user_id,
    task_name AS activity,        -- map task_name -> activity
    status AS category,           -- map status -> category
    'task' AS source,
    due_date AS occurred_at,
    custom_fields,
    ai_suggestions,
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
-- 9. KEBIJAKAN RLS UNTUK TABEL BARU
-- ====================================================================

-- Notifications Log - user hanya bisa akses data sendiri
CREATE POLICY "notifications_own_data"
    ON notifications_log FOR ALL
    USING (auth.uid() = user_id);

-- Custom Field Definitions - user hanya bisa akses definisi sendiri
CREATE POLICY "custom_field_def_own_data"
    ON custom_field_definitions FOR ALL
    USING (auth.uid() = user_id);

-- Custom Analyses - user hanya bisa akses widget sendiri
CREATE POLICY "custom_analyses_own_data"
    ON custom_analyses FOR ALL
    USING (auth.uid() = user_id);

-- Schema Change Requests - user hanya bisa akses request sendiri
CREATE POLICY "schema_change_requests_own_data"
    ON schema_change_requests FOR ALL
    USING (auth.uid() = user_id);

-- ====================================================================
-- 10. UPDATE RLS UNTUK money_trackers (tambah kolom baru)
-- Policy existing sudah mencakup karena USING (auth.uid() = user_id)
-- ====================================================================

-- ====================================================================
-- 11. FUNGSI UNTUK UPDATE updated_at OTOMATIS
-- ====================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger untuk custom_analyses
DROP TRIGGER IF EXISTS update_custom_analyses_updated_at ON custom_analyses;
CREATE TRIGGER update_custom_analyses_updated_at
    BEFORE UPDATE ON custom_analyses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ====================================================================
-- 12. FUNGSI UNTUK PARSE JSON (SQLite compatibility)
-- Karena custom_fields dan ai_suggestions disimpan sebagai TEXT JSON,
-- buat helper function untuk parsing
-- ====================================================================
CREATE OR REPLACE FUNCTION get_custom_field(
    row_data money_trackers,
    field_name TEXT
) RETURNS TEXT AS $$
DECLARE
    fields_json JSONB;
BEGIN
    IF row_data.custom_fields IS NULL OR row_data.custom_fields = '' THEN
        RETURN NULL;
    END IF;
    fields_json := row_data.custom_fields::jsonb;
    RETURN fields_json ->> field_name;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function untuk mengupdate custom_field secara aman (update JSON tanpa menimpa key lain)
CREATE OR REPLACE FUNCTION update_custom_field(
    p_row_id UUID,
    p_user_id UUID,
    p_field_key TEXT,
    p_value TEXT
) RETURNS money_trackers AS $$
DECLARE
    v_result money_trackers;
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

-- Function untuk mengupdate ai_suggestions (staging area)
CREATE OR REPLACE FUNCTION update_ai_suggestion(
    p_row_id UUID,
    p_user_id UUID,
    p_field_key TEXT,
    p_suggestion JSONB  -- { value: ..., confidence: ..., reasoning: ... }
) RETURNS money_trackers AS $$
DECLARE
    v_result money_trackers;
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
