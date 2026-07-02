-- ====================================================================
-- USER ANALYSIS PREFERENCES TABLE
-- Stores user's analysis customization preferences
-- ====================================================================

CREATE TABLE IF NOT EXISTS user_analysis_preferences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,

    -- Financial Analysis Preferences
    preferred_categories TEXT[] DEFAULT ARRAY[]::TEXT[],  -- ['food', 'transport', 'entertainment']
    exclude_categories TEXT[] DEFAULT ARRAY[]::TEXT[],     -- Categories to exclude from analysis
    currency_format VARCHAR(10) DEFAULT 'IDR',
    date_range VARCHAR(20) DEFAULT 'month',              -- 'week', 'month', 'quarter', 'year'
    savings_target_percent INTEGER DEFAULT 20,           -- Target savings rate (%)

    -- Analysis Types to Include
    include_cash_flow BOOLEAN DEFAULT TRUE,
    include_leak_audit BOOLEAN DEFAULT TRUE,
    include_consistency BOOLEAN DEFAULT TRUE,
    include_priority_matrix BOOLEAN DEFAULT TRUE,
    include_runway_prediction BOOLEAN DEFAULT TRUE,
    include_risk_simulation BOOLEAN DEFAULT TRUE,
    include_burnout_detection BOOLEAN DEFAULT TRUE,
    include_mood_correlation BOOLEAN DEFAULT FALSE,      -- Off by default, requires more data
    include_worth_it_score BOOLEAN DEFAULT TRUE,

    -- Output Preferences
    analysis_frequency VARCHAR(20) DEFAULT 'realtime',  -- 'realtime', 'daily', 'weekly'
    insight_detail_level VARCHAR(20) DEFAULT 'standard', -- 'brief', 'standard', 'detailed'
    prefer_visualizations BOOLEAN DEFAULT TRUE,
    prefer_action_plans BOOLEAN DEFAULT TRUE,

    -- Notification Preferences
    notify_on_alerts BOOLEAN DEFAULT TRUE,
    alert_threshold_risk VARCHAR(20) DEFAULT 'high',     -- 'low', 'medium', 'high'

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(user_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_analysis_prefs_user ON user_analysis_preferences(user_id);

-- ====================================================================
-- RLS POLICIES
-- ====================================================================

ALTER TABLE user_analysis_preferences ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own preferences
CREATE POLICY "Manage own analysis preferences" ON user_analysis_preferences
    FOR ALL USING (auth.uid() = user_id);

-- ====================================================================
-- DEFAULT PREFERENCES FUNCTION
-- Creates default preferences for a new user
-- ====================================================================

CREATE OR REPLACE FUNCTION create_default_analysis_preferences(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    INSERT INTO user_analysis_preferences (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create preferences when user profile is created
CREATE OR REPLACE FUNCTION trigger_create_analysis_preferences()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM create_default_analysis_preferences(NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: Uncomment below if you want auto-creation on profile insert
-- DROP TRIGGER IF EXISTS on_user_profile_create_prefs ON user_profiles;
-- CREATE TRIGGER on_user_profile_create_prefs
--     AFTER INSERT ON user_profiles
--     FOR EACH ROW EXECUTE FUNCTION trigger_create_analysis_preferences();

-- ====================================================================
-- SEED DEFAULT INSIGHT CATEGORIES
-- ====================================================================

CREATE TABLE IF NOT EXISTS insight_categories (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(20) DEFAULT '📊',
    color VARCHAR(20) DEFAULT '#6B7280',
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0
);

INSERT INTO insight_categories (id, name, description, icon, color, display_order) VALUES
    ('cash_flow', 'Arus Kas', 'Analisis pemasukan dan pengeluaran', '💳', '#4CAF50', 1),
    ('leak_audit', 'Audit Kebocoran', 'Deteksi pengeluaran tidak wajar', '🔍', '#F59E0B', 2),
    ('consistency', 'Konsistensi', 'Pelacak kebiasaan baik', '📈', '#3B82F6', 3),
    ('priority', 'Prioritas', 'Matriks prioritas tugas', '🎯', '#8B5CF6', 4),
    ('runway', 'Prediksi Dana', 'Simulasi dana darurat', '⏱️', '#EF4444', 5),
    ('risk', 'Risiko Keuangan', 'Simulasi risiko finansial', '⚠️', '#DC2626', 6),
    ('burnout', 'Deteksi Kejenuhan', 'Monitor tingkat stres', '🧘', '#EC4899', 7),
    ('mood_spending', 'Mood & Pengeluaran', 'Korelasi mood dengan belanja', '💭', '#6366F1', 8),
    ('mood_productivity', 'Mood & Produktivitas', 'Korelasi mood dengan kerja', '⚡', '#14B8A6', 9),
    ('worth_it', 'Worth-It Score', 'Audit nilai pengeluaran', '💎', '#F97316', 10)
ON CONFLICT (id) DO NOTHING;

-- RLS for insight categories
ALTER TABLE insight_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All users can view insight categories" ON insight_categories
    FOR SELECT USING (is_active = TRUE);

COMMENT ON TABLE user_analysis_preferences IS 'Stores user preferences for dynamic analysis customization';
COMMENT ON TABLE insight_categories IS 'Master data for available insight/analysis types';
