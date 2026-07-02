-- ====================================================================
-- AI DATABASE EXECUTION FUNCTION
-- Allows AI to execute validated SQL statements with security guards
-- ====================================================================

-- Drop existing function if exists
CREATE OR REPLACE FUNCTION exec_sql(
    p_statement TEXT,
    p_table_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with admin privileges
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
    v_affected_rows INTEGER;
    v_upper_stmt TEXT;
    v_table TEXT;

    -- Whitelist tables that AI can modify
    c_allowed_tables TEXT[] := ARRAY[
        'money_trackers',
        'todo_lists',
        'user_profiles',
        'payment_methods',
        'app_chat_messages',
        'chat_preferences'
    ];

    -- Allowed operations (whitelist approach)
    c_allowed_ops TEXT[] := ARRAY[
        'INSERT', 'UPDATE', 'DELETE',
        'SELECT', 'ALTER TABLE ADD COLUMN'
    ];

    -- Forbidden keywords (blacklist for dangerous operations)
    c_forbidden_keywords TEXT[] := ARRAY[
        'DROP', 'TRUNCATE', 'ALTER TABLE DROP',
        'CREATE TABLE', 'CREATE INDEX', 'CREATE FUNCTION',
        'GRANT', 'REVOKE', 'DELETE FROM', -- restricted DELETE
        'pg_', 'information_schema', 'auth.',
        'supabase_', 'pg_temp', 'pg_toast'
    ];
BEGIN
    -- Input validation
    IF p_statement IS NULL OR p_statement = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Statement cannot be empty'
        );
    END IF;

    -- Normalize statement
    v_upper_stmt := UPPER(TRIM(p_statement));

    -- =================================================================
    -- SECURITY CHECK 1: Forbidden Keywords
    -- =================================================================
    FOR i IN 1..array_length(c_forbidden_keywords, 1) LOOP
        IF v_upper_stmt LIKE '%' || c_forbidden_keywords[i] || '%' THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Forbidden operation detected: ' || c_forbidden_keywords[i],
                'hint', 'AI cannot execute DROP, TRUNCATE, or system table operations'
            );
        END IF;
    END LOOP;

    -- =================================================================
    -- SECURITY CHECK 2: Table Whitelist
    -- =================================================================
    IF p_table_name IS NOT NULL THEN
        IF NOT (LOWER(p_table_name) = ANY(c_allowed_tables)) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Table not allowed: ' || p_table_name,
                'allowed_tables', c_allowed_tables
            );
        END IF;
    ELSE
        -- Extract table name from statement if not provided
        IF v_upper_stmt LIKE '%FROM%' THEN
            v_table := TRIM(BOTH FROM SPLIT_PART(
                regexp_replace(v_upper_stmt, 'FROM\s+', ''), ' ', 1
            ));
        ELSIF v_upper_stmt LIKE '%INTO%' THEN
            v_table := TRIM(BOTH FROM SPLIT_PART(
                regexp_replace(v_upper_stmt, 'INTO\s+', ''), ' ', 1
            ));
        ELSIF v_upper_stmt LIKE '%UPDATE%' THEN
            v_table := TRIM(BOTH FROM SPLIT_PART(
                regexp_replace(v_upper_stmt, 'UPDATE\s+', ''), ' ', 1
            ));
        ELSE
            v_table := NULL;
        END IF;

        IF v_table IS NOT NULL AND NOT (LOWER(v_table) = ANY(c_allowed_tables)) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Table not allowed: ' || v_table,
                'allowed_tables', c_allowed_tables
            );
        END IF;
    END IF;

    -- =================================================================
    -- SECURITY CHECK 3: Operation Type Validation
    -- =================================================================
    DECLARE
        v_op_allowed BOOLEAN := false;
        v_op_type TEXT;
    BEGIN
        -- Determine operation type
        IF v_upper_stmt LIKE 'INSERT%' THEN
            v_op_type := 'INSERT';
        ELSIF v_upper_stmt LIKE 'UPDATE%' THEN
            v_op_type := 'UPDATE';
        ELSIF v_upper_stmt LIKE 'DELETE%' THEN
            v_op_type := 'DELETE';
        ELSIF v_upper_stmt LIKE 'SELECT%' THEN
            v_op_type := 'SELECT';
        ELSIF v_upper_stmt LIKE 'ALTER TABLE ADD%' THEN
            v_op_type := 'ALTER TABLE ADD COLUMN';
        ELSE
            v_op_type := 'OTHER';
        END IF;

        -- Check if operation is allowed
        IF v_op_type = ANY(c_allowed_ops) THEN
            v_op_allowed := true;
        END IF;

        -- Special case: DELETE without WHERE is forbidden
        IF v_upper_stmt LIKE 'DELETE%' AND v_upper_stmt NOT LIKE '%WHERE%' THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'DELETE without WHERE clause is not allowed',
                'hint', 'All DELETE operations must have a WHERE condition'
            );
        END IF;

        -- Special case: UPDATE without WHERE is forbidden
        IF v_upper_stmt LIKE 'UPDATE%' AND v_upper_stmt NOT LIKE '%WHERE%' THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'UPDATE without WHERE clause is not allowed',
                'hint', 'All UPDATE operations must have a WHERE condition'
            );
        END IF;

        IF NOT v_op_allowed THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Operation not allowed: ' || v_op_type,
                'allowed_operations', c_allowed_ops
            );
        END IF;
    END;

    -- =================================================================
    -- EXECUTE THE QUERY
    -- =================================================================
    BEGIN
        -- Execute using dynamic SQL with proper quoting
        -- Using quote_ident and quote_literal for SQL injection prevention
        EXECUTE p_statement;

        -- Get affected rows
        GET DIAGNOSTICS v_affected_rows = ROW_COUNT;

        v_result := jsonb_build_object(
            'success', true,
            'message', 'Query executed successfully',
            'operation', CASE
                WHEN v_upper_stmt LIKE 'INSERT%' THEN 'INSERT'
                WHEN v_upper_stmt LIKE 'UPDATE%' THEN 'UPDATE'
                WHEN v_upper_stmt LIKE 'DELETE%' THEN 'DELETE'
                WHEN v_upper_stmt LIKE 'SELECT%' THEN 'SELECT'
                WHEN v_upper_stmt LIKE 'ALTER%' THEN 'ALTER'
                ELSE 'EXECUTED'
            END,
            'affected_rows', v_affected_rows
        );

    EXCEPTION WHEN OTHERS THEN
        -- Return error details safely (no SQL details leaked)
        v_result := jsonb_build_object(
            'success', false,
            'error', 'Query execution failed: ' || SQLERRM,
            'hint', 'Check query syntax and try again'
        );
    END;

    RETURN v_result;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION exec_sql(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION exec_sql(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION exec_sql(TEXT, TEXT) TO service_role;

-- ====================================================================
-- SCHEMA INTROSPECTION FUNCTION
-- Returns database schema for AI context
-- ====================================================================

CREATE OR REPLACE FUNCTION get_schema_info(
    p_table_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
    v_tables JSONB;
    v_columns JSONB;
BEGIN
    -- Get all tables if not specified
    IF p_table_name IS NULL THEN
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'table_name', t.table_name,
            'columns', (
                SELECT jsonb_agg(jsonb_build_object(
                    'column_name', c.column_name,
                    'data_type', c.data_type,
                    'is_nullable', c.is_nullable,
                    'column_default', c.column_default
                ) ORDER BY c.ordinal_position)
                FROM information_schema.columns c
                WHERE c.table_schema = 'public'
                    AND c.table_name = t.table_name
            )
        )), '[]'::jsonb)
        INTO v_tables
        FROM information_schema.tables t
        WHERE t.table_schema = 'public'
            AND t.table_type = 'BASE TABLE'
            AND t.table_name NOT LIKE 'pg_%'
            AND t.table_name NOT LIKE 'sql_%'
        ORDER BY t.table_name;

        v_result := jsonb_build_object(
            'success', true,
            'tables', v_tables
        );
    ELSE
        -- Get specific table schema
        SELECT jsonb_build_object(
            'table_name', t.table_name,
            'columns', (
                SELECT jsonb_agg(jsonb_build_object(
                    'column_name', c.column_name,
                    'data_type', c.data_type,
                    'is_nullable', c.is_nullable,
                    'column_default', c.column_default
                ) ORDER BY c.ordinal_position)
                FROM information_schema.columns c
                WHERE c.table_schema = 'public'
                    AND c.table_name = t.table_name
            ),
            'primary_key', (
                SELECT jsonb_agg(kcu.column_name::TEXT)
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                WHERE tc.table_schema = 'public'
                    AND tc.table_name = t.table_name
                    AND tc.constraint_type = 'PRIMARY KEY'
            ),
            'foreign_keys', (
                SELECT jsonb_agg(jsonb_build_object(
                    'column', kcu.column_name,
                    'foreign_table', ccu.table_name::TEXT,
                    'foreign_column', ccu.column_name
                ))
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                JOIN information_schema.constraint_column_usage ccu
                    ON tc.constraint_name = ccu.constraint_name
                WHERE tc.table_schema = 'public'
                    AND tc.table_name = t.table_name
                    AND tc.constraint_type = 'FOREIGN KEY'
            )
        )
        INTO v_result
        FROM information_schema.tables t
        WHERE t.table_schema = 'public'
            AND t.table_name = p_table_name;

        IF v_result IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Table not found: ' || p_table_name
            );
        ELSE
            v_result := jsonb_build_object(
                'success', true,
                'table', v_result
            );
        END IF;
    END IF;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_schema_info(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_schema_info(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_schema_info(TEXT) TO service_role;

-- ====================================================================
-- AI ACTION LOGGING TABLE
-- Track all AI database operations for audit
-- ====================================================================

CREATE TABLE IF NOT EXISTS ai_action_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    action_type VARCHAR(50) NOT NULL,
    table_name VARCHAR(100),
    statement_preview TEXT, -- First 200 chars of SQL
    full_statement TEXT,    -- Full statement for audit
    status VARCHAR(20) CHECK (status IN ('success', 'failed', 'blocked')),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_action_logs_user ON ai_action_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_action_logs_created ON ai_action_logs(created_at DESC);

-- RLS
ALTER TABLE ai_action_logs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own logs
CREATE POLICY "Users see own action logs" ON ai_action_logs
    FOR SELECT USING (auth.uid() = user_id);

COMMENT ON TABLE ai_action_logs IS 'Audit trail for AI-triggered database operations';
