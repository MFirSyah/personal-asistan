/**
 * AI Database Tool Executor
 * Handles execution of AI-requested database operations
 */

import { supabaseAdmin } from '@/lib/services/supabase';
import { allowedTables, rateLimits, databaseToolDefinitions } from './database-tools';

// Rate limiting storage (in-memory, reset on server restart)
const queryCounts = new Map<string, { minute: number; daily: number; lastMinuteReset: number; lastDayReset: number }>();

function getRateLimitKey(userId: string): string {
  return `db_tool_${userId}`;
}

function checkRateLimit(userId: string): { allowed: boolean; reason?: string } {
  const key = getRateLimitKey(userId);
  const now = Date.now();

  let counts = queryCounts.get(key);
  if (!counts) {
    counts = {
      minute: 0,
      daily: 0,
      lastMinuteReset: now,
      lastDayReset: now
    };
    queryCounts.set(key, counts);
  }

  // Reset minute counter if needed
  if (now - counts.lastMinuteReset > 60000) {
    counts.minute = 0;
    counts.lastMinuteReset = now;
  }

  // Reset daily counter if needed (at midnight)
  if (now - counts.lastDayReset > 86400000) {
    counts.daily = 0;
    counts.lastDayReset = now;
  }

  // Check limits
  if (counts.minute >= rateLimits.maxQueriesPerMinute) {
    return {
      allowed: false,
      reason: `Rate limit exceeded: Max ${rateLimits.maxQueriesPerMinute} queries per minute`
    };
  }

  if (counts.daily >= rateLimits.maxQueriesPerDay) {
    return {
      allowed: false,
      reason: `Daily limit exceeded: Max ${rateLimits.maxQueriesPerDay} queries per day`
    };
  }

  // Increment counters
  counts.minute++;
  counts.daily++;

  return { allowed: true };
}

/**
 * Get database schema (all tables or specific table)
 */
export async function getDatabaseSchema(tableName?: string) {
  try {
    const { data, error } = await supabaseAdmin.rpc('get_schema_info', {
      p_table_name: tableName || null
    });

    if (error) {
      return {
        success: false,
        error: `Failed to get schema: ${error.message}`
      };
    }

    return {
      success: true,
      data: data
    };
  } catch (err: any) {
    console.error('Schema fetch error:', err);
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Execute a database query via the validated function
 */
export async function executeDatabaseQuery(
  statement: string,
  tableName: string,
  intent: string,
  userId: string
) {
  // Check rate limit
  const rateCheck = checkRateLimit(userId);
  if (!rateCheck.allowed) {
    return {
      success: false,
      error: rateCheck.reason,
      blocked: true
    };
  }

  // Validate table name
  const normalizedTable = tableName.toLowerCase();
  if (!allowedTables.includes(normalizedTable)) {
    return {
      success: false,
      error: `Table '${tableName}' is not allowed. Available tables: ${allowedTables.join(', ')}`,
      blocked: true
    };
  }

  // Log the action attempt
  await logAIAction({
    userId,
    actionType: `query_${intent}`,
    tableName,
    statement,
    status: 'pending'
  });

  try {
    // Execute via Supabase RPC function
    const { data, error } = await supabaseAdmin.rpc('exec_sql', {
      p_statement: statement,
      p_table_name: normalizedTable
    });

    if (error) {
      // Log failed attempt
      await logAIAction({
        userId,
        actionType: `query_${intent}`,
        tableName,
        statement,
        status: 'failed',
        errorMessage: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }

    // Parse result from RPC
    const result = typeof data === 'string' ? JSON.parse(data) : data;

    if (!result.success) {
      // Log blocked/failed attempt
      await logAIAction({
        userId,
        actionType: `query_${intent}`,
        tableName,
        statement,
        status: result.blocked ? 'blocked' : 'failed',
        errorMessage: result.error
      });

      return result;
    }

    // Log success
    await logAIAction({
      userId,
      actionType: `query_${intent}`,
      tableName,
      statement,
      status: 'success'
    });

    return {
      success: true,
      message: result.message,
      operation: result.operation,
      affected_rows: result.affected_rows
    };

  } catch (err: any) {
    console.error('Database execution error:', err);

    // Log error
    await logAIAction({
      userId,
      actionType: `query_${intent}`,
      tableName,
      statement,
      status: 'failed',
      errorMessage: err.message
    });

    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * List all available tables
 */
export async function listAvailableTables() {
  try {
    const { data, error } = await supabaseAdmin
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .not('table_name', 'like', 'pg_%')
      .not('table_name', 'like', 'sql_%');

    if (error) {
      return {
        success: false,
        error: error.message
      };
    }

    // Filter to allowed tables only
    const allowed = data
      ?.filter(t => allowedTables.includes(t.table_name))
      .map(t => t.table_name) || [];

    return {
      success: true,
      tables: allowed,
      allTables: data?.map(t => t.table_name) || []
    };
  } catch (err: any) {
    console.error('List tables error:', err);
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Log AI action to database
 */
async function logAIAction(params: {
  userId: string;
  actionType: string;
  tableName: string;
  statement: string;
  status: 'pending' | 'success' | 'failed' | 'blocked';
  errorMessage?: string;
}) {
  try {
    await supabaseAdmin.from('ai_action_logs').insert({
      user_id: params.userId,
      action_type: params.actionType,
      table_name: params.tableName,
      statement_preview: params.statement.substring(0, 200),
      full_statement: params.statement,
      status: params.status,
      error_message: params.errorMessage || null
    });
  } catch (err) {
    // Silently fail logging - don't break the main operation
    console.error('Failed to log AI action:', err);
  }
}

/**
 * Get user's AI action logs
 */
export async function getAIActionLogs(userId: string, limit: number = 50) {
  try {
    const { data, error } = await supabaseAdmin
      .from('ai_action_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return {
        success: false,
        error: error.message
      };
    }

    return {
      success: true,
      logs: data
    };
  } catch (err: any) {
    console.error('Get logs error:', err);
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Main tool handler - routes to appropriate function
 */
export async function handleToolCall(
  toolName: string,
  args: Record<string, any>,
  userId: string
) {
  switch (toolName) {
    case 'get_database_schema':
      return await getDatabaseSchema(args.table_name);

    case 'execute_database_query':
      return await executeDatabaseQuery(
        args.statement,
        args.table_name,
        args.intent,
        userId
      );

    case 'list_available_tables':
      return await listAvailableTables();

    default:
      return {
        success: false,
        error: `Unknown tool: ${toolName}`
      };
  }
}
