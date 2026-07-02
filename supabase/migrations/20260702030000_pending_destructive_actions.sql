-- ====================================================================
-- PENDING DESTRUCTIVE ACTIONS TABLE
-- Human-in-the-loop confirmation for destructive database operations
-- ====================================================================

CREATE TABLE IF NOT EXISTS pending_destructive_actions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    statement TEXT NOT NULL,
    statement_preview TEXT NOT NULL,  -- First 200 chars for display
    intent VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    context JSONB DEFAULT '{}',  -- Additional context (e.g., affected rows estimate)
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP + INTERVAL '5 minutes'),
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_pending_actions_user ON pending_destructive_actions(user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pending_actions_expires ON pending_destructive_actions(expires_at) WHERE status = 'pending';

-- RLS
ALTER TABLE pending_destructive_actions ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own pending actions
CREATE POLICY "Manage own pending actions" ON pending_destructive_actions
    FOR ALL USING (auth.uid() = user_id);

-- Cleanup expired actions function
CREATE OR REPLACE FUNCTION cleanup_expired_pending_actions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM pending_destructive_actions
    WHERE status = 'pending' AND expires_at < CURRENT_TIMESTAMP;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-cleanup expired actions (optional, can run via cron)
-- DROP TRIGGER IF EXISTS on_pending_actions_expire ON pending_destructive_actions;
-- CREATE TRIGGER on_pending_actions_expire
--     AFTER INSERT ON pending_destructive_actions
--     FOR EACH STATEMENT EXECUTE FUNCTION cleanup_expired_pending_actions();

COMMENT ON TABLE pending_destructive_actions IS 'Human-in-the-loop confirmation for destructive database operations';
COMMENT ON COLUMN pending_destructive_actions.action_type IS 'Type: delete_all, update_all, drop_table, alter_table_drop_column';
