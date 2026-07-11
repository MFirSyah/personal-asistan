/**
 * AI Database Tool Executor
 * Handles execution of AI-requested database operations
 *
 * SECURITY: Uses whitelist query builder approach (no raw SQL)
 * Arsitektur reference: Bagian 11 - Opsi A (query_config whitelist)
 */

import { supabaseAdmin } from '@/lib/services/supabase';
import {
  allowedTables,
  allowedOperations,
  allowedColumns,
  rateLimits,
  databaseToolDefinitions
} from './database-tools';

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

// ====================================================================
// SAFE QUERY BUILDERS (No Raw SQL - Whitelist Approach)
// ====================================================================

/**
 * Validate table name against whitelist
 */
function validateTable(tableName: string): { valid: boolean; error?: string } {
  const normalized = tableName.toLowerCase();
  if (!allowedTables.includes(normalized)) {
    return {
      valid: false,
      error: `Table '${tableName}' is not allowed. Allowed tables: ${allowedTables.join(', ')}`
    };
  }
  return { valid: true };
}

/**
 * Validate column names against whitelist
 */
function validateColumns(tableName: string, columns: string[]): { valid: boolean; error?: string } {
  const normalized = tableName.toLowerCase();
  const allowed = allowedColumns[normalized] || [];

  for (const col of columns) {
    if (!allowed.includes(col)) {
      return {
        valid: false,
        error: `Column '${col}' is not allowed for table '${tableName}'. Allowed: ${allowed.join(', ')}`
      };
    }
  }
  return { valid: true };
}

/**
 * List finance records with safe query builder
 */
async function listFinanceRecords(
  userId: string,
  params: {
    limit?: number;
    type_filter?: string;
    start_date?: string;
    end_date?: string;
  }
) {
  const table = 'money_trackers';
  const tableValidation = validateTable(table);
  if (!tableValidation.valid) return { success: false, error: tableValidation.error };

  const limit = Math.min(params.limit || 20, 100);
  let query = supabaseAdmin
    .from(table)
    .select('*')
    .eq('user_id', userId);

  if (params.type_filter && params.type_filter !== 'all') {
    query = query.eq('type', params.type_filter);
  }

  if (params.start_date) {
    query = query.gte('transaction_date', params.start_date);
  }

  if (params.end_date) {
    query = query.lte('transaction_date', params.end_date);
  }

  query = query.order('created_at', { ascending: false }).limit(limit);

  const { data, error } = await query;

  if (error) {
    return { success: false, error: error.message };
  }

  // Calculate summary
  let totalIncome = 0;
  let totalExpense = 0;
  data?.forEach(t => {
    if (t.type === 'income') totalIncome += Number(t.amount);
    else if (t.type === 'expense') totalExpense += Number(t.amount);
  });

  return {
    success: true,
    records: data || [],
    summary: {
      count: data?.length || 0,
      total_income: totalIncome,
      total_expense: totalExpense,
      net_balance: totalIncome - totalExpense
    }
  };
}

/**
 * List todo items with safe query builder
 */
async function listTodoItems(
  userId: string,
  params: {
    limit?: number;
    status_filter?: string;
  }
) {
  const table = 'todo_lists';
  const tableValidation = validateTable(table);
  if (!tableValidation.valid) return { success: false, error: tableValidation.error };

  const limit = Math.min(params.limit || 20, 100);
  let query = supabaseAdmin
    .from(table)
    .select('*')
    .eq('user_id', userId);

  if (params.status_filter && params.status_filter !== 'all') {
    query = query.eq('status', params.status_filter);
  }

  query = query.order('created_at', { ascending: false }).limit(limit);

  const { data, error } = await query;

  if (error) {
    return { success: false, error: error.message };
  }

  const stats = {
    total: data?.length || 0,
    pending: data?.filter(t => t.status === 'pending').length || 0,
    completed: data?.filter(t => t.status === 'completed').length || 0,
    cancelled: data?.filter(t => t.status === 'cancelled').length || 0
  };

  return {
    success: true,
    records: data || [],
    stats
  };
}

/**
 * Create finance record with safe insert builder
 */
async function createFinanceRecord(
  userId: string,
  params: {
    type: 'income' | 'expense';
    amount: number;
    description: string;
    transaction_date?: string;
  }
) {
  const table = 'money_trackers';
  const tableValidation = validateTable(table);
  if (!tableValidation.valid) return { success: false, error: tableValidation.error };

  const allowedOps = allowedOperations[table] || [];
  if (!allowedOps.includes('INSERT')) {
    return { success: false, error: `INSERT not allowed on table '${table}'` };
  }

  // Validate amount
  if (typeof params.amount !== 'number' || params.amount <= 0) {
    return { success: false, error: 'Amount must be a positive number' };
  }

  // Sanitize description
  const description = String(params.description || '').trim().substring(0, 500);

  const { data, error } = await supabaseAdmin
    .from(table)
    .insert({
      user_id: userId,
      type: params.type,
      amount: params.amount,
      description,
      transaction_date: params.transaction_date || new Date().toISOString().split('T')[0]
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    message: `Transaction recorded: ${params.type} of Rp ${params.amount.toLocaleString('id-ID')}`,
    record: data
  };
}

/**
 * Create todo item with safe insert builder
 */
async function createTodoItem(
  userId: string,
  params: {
    task_name: string;
    due_date?: string;
    priority?: string;
  }
) {
  const table = 'todo_lists';
  const tableValidation = validateTable(table);
  if (!tableValidation.valid) return { success: false, error: tableValidation.error };

  const allowedOps = allowedOperations[table] || [];
  if (!allowedOps.includes('INSERT')) {
    return { success: false, error: `INSERT not allowed on table '${table}'` };
  }

  // Sanitize task name
  const taskName = String(params.task_name || '').trim().substring(0, 500);
  if (!taskName) {
    return { success: false, error: 'Task name cannot be empty' };
  }

  // Validate priority
  const validPriorities = ['low', 'medium', 'high'];
  const priority = params.priority && validPriorities.includes(params.priority)
    ? params.priority
    : 'medium';

  const record: Record<string, any> = {
    user_id: userId,
    task_name: taskName,
    status: 'pending',
    due_date: params.due_date || null
  };

  // Add priority to dynamic_metadata
  record.dynamic_metadata = { priority };

  const { data, error } = await supabaseAdmin
    .from(table)
    .insert(record)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    message: `Task created: "${taskName}"`,
    record: data
  };
}

/**
 * Update todo status with safe update builder
 */
async function updateTodoStatus(
  userId: string,
  params: {
    task_name: string;
    new_status: 'pending' | 'completed' | 'cancelled';
  }
) {
  const table = 'todo_lists';
  const tableValidation = validateTable(table);
  if (!tableValidation.valid) return { success: false, error: tableValidation.error };

  const allowedOps = allowedOperations[table] || [];
  if (!allowedOps.includes('UPDATE')) {
    return { success: false, error: `UPDATE not allowed on table '${table}'` };
  }

  // Validate status
  const validStatuses = ['pending', 'completed', 'cancelled'];
  if (!validStatuses.includes(params.new_status)) {
    return { success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` };
  }

  // Find task by name (case-insensitive partial match)
  const { data: existingTasks, error: findError } = await supabaseAdmin
    .from(table)
    .select('id, task_name')
    .eq('user_id', userId)
    .ilike('task_name', `%${params.task_name}%`)
    .limit(5);

  if (findError) {
    return { success: false, error: findError.message };
  }

  if (!existingTasks || existingTasks.length === 0) {
    return { success: false, error: `No task found matching "${params.task_name}"` };
  }

  // Update all matching tasks
  const taskIds = existingTasks.map(t => t.id);
  const { data, error } = await supabaseAdmin
    .from(table)
    .update({ status: params.new_status })
    .in('id', taskIds)
    .select();

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    message: `Updated ${data?.length || 0} task(s) to "${params.new_status}"`,
    updated_count: data?.length || 0
  };
}

/**
 * Get finance summary with safe aggregation query
 */
async function getFinanceSummary(
  userId: string,
  params: {
    start_date: string;
    end_date: string;
  }
) {
  const table = 'money_trackers';
  const tableValidation = validateTable(table);
  if (!tableValidation.valid) return { success: false, error: tableValidation.error };

  // Query with date range
  const { data, error } = await supabaseAdmin
    .from(table)
    .select('type, amount, description, transaction_date, dynamic_metadata')
    .eq('user_id', userId)
    .gte('transaction_date', params.start_date)
    .lte('transaction_date', params.end_date)
    .order('transaction_date', { ascending: false });

  if (error) {
    return { success: false, error: error.message };
  }

  // Calculate summary
  let totalIncome = 0;
  let totalExpense = 0;
  const byCategory: Record<string, number> = {};
  const byDate: Record<string, { income: number; expense: number }> = {};

  data?.forEach(t => {
    const amt = Number(t.amount) || 0;
    const date = t.transaction_date?.split('T')[0] || 'unknown';

    if (t.type === 'income') {
      totalIncome += amt;
    } else if (t.type === 'expense') {
      totalExpense += amt;
      const cat = t.dynamic_metadata?.kategori || t.description || 'Lainnya';
      byCategory[cat] = (byCategory[cat] || 0) + amt;
    }

    if (!byDate[date]) byDate[date] = { income: 0, expense: 0 };
    byDate[date][t.type as 'income' | 'expense'] += amt;
  });

  return {
    success: true,
    summary: {
      period: { start: params.start_date, end: params.end_date },
      total_income: totalIncome,
      total_expense: totalExpense,
      net_balance: totalIncome - totalExpense,
      transaction_count: data?.length || 0,
      by_category: byCategory,
      by_date: byDate
    }
  };
}

/**
 * Get database schema (all tables or specific table)
 */
export async function getDatabaseSchema(tableName?: string) {
  try {
    // Validate table name if provided
    if (tableName) {
      const validation = validateTable(tableName);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }
    }

    // Return schema info for allowed tables
    const schemaInfo: Record<string, string[]> = {};
    for (const table of allowedTables) {
      schemaInfo[table] = allowedColumns[table] || [];
    }

    return {
      success: true,
      data: {
        tables: Object.entries(schemaInfo).map(([name, columns]) => ({
          table_name: name,
          columns: columns
        })),
        instructions: 'Use these tool functions to interact with data: list_finance_records, list_todo_items, create_finance_record, create_todo_item, update_todo_status, get_finance_summary'
      }
    };
  } catch (err: any) {
    console.error('Schema fetch error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * List all available tables
 */
export async function listAvailableTables() {
  return {
    success: true,
    tables: allowedTables,
    instructions: 'Use these tool functions to interact with data: list_finance_records, list_todo_items, create_finance_record, create_todo_item, update_todo_status, get_finance_summary'
  };
}

/**
 * Main tool handler - routes to appropriate function
 * SECURITY: No raw SQL - all operations use whitelist query builder
 */
export async function handleToolCall(
  toolName: string,
  args: Record<string, any>,
  userId: string
) {
  // Check rate limit first
  const rateCheck = checkRateLimit(userId);
  if (!rateCheck.allowed) {
    return { success: false, error: rateCheck.reason, blocked: true };
  }

  // Log the action
  await logAIAction({
    userId,
    toolName,
    args: args,
    status: 'pending'
  });

  let result: { success: boolean; error?: string; [key: string]: any };

  try {
    switch (toolName) {
      case 'get_database_schema':
        result = await getDatabaseSchema(args.table_name);
        break;

      case 'list_available_tables':
        result = await listAvailableTables();
        break;

      case 'list_finance_records':
        result = await listFinanceRecords(userId, {
          limit: args.limit,
          type_filter: args.type_filter,
          start_date: args.start_date,
          end_date: args.end_date
        });
        break;

      case 'list_todo_items':
        result = await listTodoItems(userId, {
          limit: args.limit,
          status_filter: args.status_filter
        });
        break;

      case 'create_finance_record':
        result = await createFinanceRecord(userId, {
          type: args.type,
          amount: args.amount,
          description: args.description,
          transaction_date: args.transaction_date
        });
        break;

      case 'create_todo_item':
        result = await createTodoItem(userId, {
          task_name: args.task_name,
          due_date: args.due_date,
          priority: args.priority
        });
        break;

      case 'update_todo_status':
        result = await updateTodoStatus(userId, {
          task_name: args.task_name,
          new_status: args.new_status
        });
        break;

      case 'get_finance_summary':
        result = await getFinanceSummary(userId, {
          start_date: args.start_date,
          end_date: args.end_date
        });
        break;

      default:
        result = { success: false, error: `Unknown tool: ${toolName}` };
    }

    // Log result status
    await logAIAction({
      userId,
      toolName,
      args: args,
      status: result.success ? 'success' : 'failed',
      errorMessage: result.error
    });

    return result;

  } catch (err: any) {
    console.error(`Tool execution error [${toolName}]:`, err);

    await logAIAction({
      userId,
      toolName,
      args: args,
      status: 'error',
      errorMessage: err.message
    });

    return { success: false, error: err.message };
  }
}

/**
 * Log AI action to database
 */
async function logAIAction(params: {
  userId: string;
  toolName: string;
  args: Record<string, any>;
  status: 'pending' | 'success' | 'failed' | 'blocked' | 'error';
  errorMessage?: string;
}) {
  try {
    await supabaseAdmin.from('ai_action_logs').insert({
      user_id: params.userId,
      action_type: `tool_${params.toolName}`,
      table_name: null,
      statement_preview: `${params.toolName}(${JSON.stringify(params.args).substring(0, 100)})`,
      full_statement: JSON.stringify({ tool: params.toolName, args: params.args }),
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
      return { success: false, error: error.message };
    }

    return { success: true, logs: data };
  } catch (err: any) {
    console.error('Get logs error:', err);
    return { success: false, error: err.message };
  }
}
