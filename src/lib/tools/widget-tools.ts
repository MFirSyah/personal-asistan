/**
 * AI Tools untuk Gemini Function Calling
 * sesuai arsitektur reference:
 * - createAnalysisWidget: buat dashboard widget
 * - updateAnalysisWidget: update widget
 * - deleteAnalysisWidget: hapus widget
 * - suggestFieldValues: smart backfill (writes to ai_suggestions)
 */

import { supabaseAdmin } from '@/lib/services/supabase';

// Types sesuai arsitektur reference
export interface QueryConfig {
  groupBy?: string;
  aggregation: 'sum' | 'count' | 'avg' | 'min' | 'max';
  valueField?: string;
  filters?: Array<{
    field: string;
    operator: 'eq' | 'gt' | 'lt' | 'between';
    value: string | number | [string, string];
  }>;
  dateRange: {
    type: 'relative';
    value: 'today' | 'this_week' | 'this_month' | 'last_30_days';
  } | {
    type: 'absolute';
    start: string;
    end: string;
  };
  sortBy?: string;
  limit?: number;
}

export interface WidgetSpec {
  title: string;
  chartType: 'line' | 'bar' | 'pie' | 'table' | 'number';
  dataSource: 'money_trackers' | 'todo_lists' | 'notifications_log';
  groupBy?: string;
  aggregation: 'sum' | 'count' | 'avg' | 'min' | 'max';
  valueField?: string;
  dateRangeType: 'relative' | 'absolute';
  dateRangeValue: string;
}

// ====================================================================
// Tool Definitions untuk Gemini
// ====================================================================

export const widgetToolDeclarations = {
  functionDeclarations: [
    {
      name: 'createAnalysisWidget',
      description: 'Buat widget analisis baru yang akan muncul permanen di web dashboard user',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Judul widget' },
          chartType: {
            type: 'string',
            enum: ['line', 'bar', 'pie', 'table', 'number'],
            description: 'Tipe chart untuk menampilkan data'
          },
          dataSource: {
            type: 'string',
            enum: ['money_trackers', 'todo_lists', 'notifications_log'],
            description: 'Sumber data untuk widget'
          },
          groupBy: { type: 'string', description: 'Kolom untuk grouping data' },
          aggregation: {
            type: 'string',
            enum: ['sum', 'count', 'avg', 'min', 'max'],
            description: 'Tipe agregasi data'
          },
          valueField: { type: 'string', description: 'Kolom yang diagregasi' },
          dateRangeType: { type: 'string', enum: ['relative', 'absolute'] },
          dateRangeValue: { type: 'string', description: 'Nilai rentang tanggal' }
        },
        required: ['title', 'chartType', 'dataSource', 'aggregation', 'dateRangeType', 'dateRangeValue']
      }
    },
    {
      name: 'updateAnalysisWidget',
      description: 'Update widget analisis yang sudah ada',
      parameters: {
        type: 'object',
        properties: {
          widgetId: { type: 'string', description: 'ID widget yang akan diupdate' },
          title: { type: 'string', description: 'Judul widget baru' },
          chartType: { type: 'string', enum: ['line', 'bar', 'pie', 'table', 'number'] },
          groupBy: { type: 'string' },
          aggregation: { type: 'string', enum: ['sum', 'count', 'avg', 'min', 'max'] },
          valueField: { type: 'string' },
          dateRangeType: { type: 'string', enum: ['relative', 'absolute'] },
          dateRangeValue: { type: 'string' },
          isPinned: { type: 'boolean', description: 'Pin widget di dashboard' }
        },
        required: ['widgetId']
      }
    },
    {
      name: 'deleteAnalysisWidget',
      description: 'Hapus widget analisis dari dashboard',
      parameters: {
        type: 'object',
        properties: {
          widgetId: { type: 'string', description: 'ID widget yang akan dihapus' }
        },
        required: ['widgetId']
      }
    },
    {
      name: 'suggestFieldValues',
      description: 'Analisis baris yang kosong pada kolom tertentu dan usulkan nilai HANYA berdasarkan data lain yang sudah ada di baris yang sama. Jangan pernah mengarang berdasarkan asumsi umum/pengetahuan luar.',
      parameters: {
        type: 'object',
        properties: {
          table: {
            type: 'string',
            enum: ['money_trackers', 'todo_lists'],
            description: 'Nama tabel yang akan dianalisis'
          },
          column: { type: 'string', description: 'Nama kolom yang akan disuggest' },
          rowIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'ID baris yang akan dianalisis'
          }
        },
        required: ['table', 'column', 'rowIds']
      }
    }
  ]
};

// ====================================================================
// Tool Implementations
// ====================================================================

/**
 * Create a new analysis widget
 */
export async function createWidget(
  userId: string,
  spec: WidgetSpec
): Promise<{ success: boolean; widgetId?: string; error?: string }> {
  try {
    // Validate chart type
    const validChartTypes = ['line', 'bar', 'pie', 'table', 'number'];
    if (!validChartTypes.includes(spec.chartType)) {
      return { success: false, error: 'Invalid chart type' };
    }

    // Validate data source
    const validDataSources = ['money_trackers', 'todo_lists', 'notifications_log'];
    if (!validDataSources.includes(spec.dataSource)) {
      return { success: false, error: 'Invalid data source' };
    }

    // Build query_config from spec
    const queryConfig: QueryConfig = {
      aggregation: spec.aggregation,
      dateRange: spec.dateRangeType === 'relative'
        ? { type: 'relative', value: spec.dateRangeValue as any }
        : { type: 'absolute', start: spec.dateRangeValue, end: spec.dateRangeValue }
    };

    if (spec.groupBy) queryConfig.groupBy = spec.groupBy;
    if (spec.valueField) queryConfig.valueField = spec.valueField;

    // Insert widget
    const { data, error } = await supabaseAdmin
      .from('custom_analyses')
      .insert({
        user_id: userId,
        title: spec.title,
        chart_type: spec.chartType,
        data_source: spec.dataSource,
        query_config: queryConfig
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error creating widget:', error);
      return { success: false, error: error.message };
    }

    return { success: true, widgetId: data.id };
  } catch (err) {
    console.error('Exception creating widget:', err);
    return { success: false, error: 'Internal error' };
  }
}

/**
 * Update an existing widget
 */
export async function updateWidget(
  userId: string,
  widgetId: string,
  updates: Partial<WidgetSpec & { isPinned?: boolean }>
): Promise<{ success: boolean; error?: string }> {
  try {
    // Build update object
    const updateData: Record<string, any> = {};

    if (updates.title) updateData.title = updates.title;
    if (updates.chartType) updateData.chart_type = updates.chartType;
    if (updates.isPinned !== undefined) updateData.is_pinned = updates.isPinned;

    if (updates.groupBy || updates.aggregation || updates.valueField || updates.dateRangeType || updates.dateRangeValue) {
      // Get existing widget first
      const { data: existing } = await supabaseAdmin
        .from('custom_analyses')
        .select('query_config')
        .eq('id', widgetId)
        .eq('user_id', userId)
        .single();

      if (!existing) {
        return { success: false, error: 'Widget not found' };
      }

      const queryConfig = existing.query_config || {};
      if (updates.groupBy) queryConfig.groupBy = updates.groupBy;
      if (updates.aggregation) queryConfig.aggregation = updates.aggregation;
      if (updates.valueField) queryConfig.valueField = updates.valueField;
      if (updates.dateRangeType && updates.dateRangeValue) {
        queryConfig.dateRange = updates.dateRangeType === 'relative'
          ? { type: 'relative', value: updates.dateRangeValue as any }
          : { type: 'absolute', start: updates.dateRangeValue, end: updates.dateRangeValue };
      }

      updateData.query_config = queryConfig;
    }

    // Update widget
    const { error } = await supabaseAdmin
      .from('custom_analyses')
      .update(updateData)
      .eq('id', widgetId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating widget:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception updating widget:', err);
    return { success: false, error: 'Internal error' };
  }
}

/**
 * Delete a widget
 */
export async function deleteWidget(
  userId: string,
  widgetId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabaseAdmin
      .from('custom_analyses')
      .delete()
      .eq('id', widgetId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting widget:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception deleting widget:', err);
    return { success: false, error: 'Internal error' };
  }
}

/**
 * Get list of widgets for user
 */
export async function getUserWidgets(
  userId: string
): Promise<{ success: boolean; widgets?: any[]; error?: string }> {
  try {
    const { data, error } = await supabaseAdmin
      .from('custom_analyses')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching widgets:', error);
      return { success: false, error: error.message };
    }

    return { success: true, widgets: data };
  } catch (err) {
    console.error('Exception fetching widgets:', err);
    return { success: false, error: 'Internal error' };
  }
}

/**
 * Execute widget query and return data
 * Implements whitelist-based query builder for security
 */
export async function executeWidgetQuery(
  userId: string,
  widgetId: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    // Get widget
    const { data: widget, error: widgetError } = await supabaseAdmin
      .from('custom_analyses')
      .select('*')
      .eq('id', widgetId)
      .eq('user_id', userId)
      .single();

    if (widgetError || !widget) {
      return { success: false, error: 'Widget not found' };
    }

    const { data_source, query_config } = widget;

    // Whitelist tables
    const ALLOWED_TABLES = ['money_trackers', 'todo_lists', 'notifications_log'];
    if (!ALLOWED_TABLES.includes(data_source)) {
      return { success: false, error: 'Invalid data source' };
    }

    // Whitelist columns per table
    const ALLOWED_COLUMNS: Record<string, string[]> = {
      money_trackers: ['category', 'type', 'amount', 'created_at', 'transaction_date', 'description'],
      todo_lists: ['status', 'task_name', 'created_at', 'due_date'],
      notifications_log: ['source_app', 'category', 'priority', 'created_at', 'received_at']
    };

    const allowedCols = ALLOWED_COLUMNS[data_source] || [];
    const queryConfig = query_config as QueryConfig || { aggregation: 'count' };

    // Build date filter based on dateRange
    let dateFilter = '';
    const now = new Date();
    let startDate: Date;

    if (queryConfig.dateRange?.type === 'relative') {
      const rangeMap: Record<string, number> = {
        'today': 0,
        'this_week': 7,
        'this_month': 30,
        'last_30_days': 30
      };
      const days = rangeMap[queryConfig.dateRange.value] || 30;
      startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    } else if (queryConfig.dateRange?.type === 'absolute') {
      startDate = new Date(queryConfig.dateRange.start);
    } else {
      // Default: last 30 days
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const dateCol = data_source === 'money_trackers' ? 'transaction_date' :
                   data_source === 'notifications_log' ? 'received_at' : 'created_at';

    // Build aggregation query
    let query = supabaseAdmin.from(data_source).select('*').eq('user_id', userId);

    // Add date filter
    query = query.gte(dateCol, startDate.toISOString());

    // Grouping must be handled client-side or via RPC, removing invalid .group()
    // if (queryConfig.groupBy && allowedCols.includes(queryConfig.groupBy)) {
    //   // manual grouping logic here
    // }

    // Add limit
    if (queryConfig.limit) {
      query = query.limit(queryConfig.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error executing widget query:', error);
      return { success: false, error: error.message };
    }

    // Process aggregation on results (for simplicity)
    let processedData = data || [];

    if (queryConfig.aggregation === 'count') {
      processedData = [{ value: processedData.length }];
    } else if (queryConfig.aggregation === 'sum' && queryConfig.valueField === 'amount') {
      const total = processedData.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
      processedData = [{ value: total }];
    }

    return { success: true, data: processedData };
  } catch (err) {
    console.error('Exception executing widget query:', err);
    return { success: false, error: 'Internal error' };
  }
}

/**
 * Suggest field values for smart backfill
 * Writes to ai_suggestions (staging), NOT directly to columns
 */
export async function suggestFieldValues(
  userId: string,
  table: 'money_trackers' | 'todo_lists',
  column: string,
  rowIds: string[]
): Promise<{ success: boolean; suggestions?: Record<string, any>; error?: string }> {
  try {
    // Check if column is marked as inferable
    const { data: fieldDef, error: fieldDefError } = await supabaseAdmin
      .from('custom_field_definitions')
      .select('id, inferable')
      .eq('user_id', userId)
      .eq('table_name', table)
      .eq('field_key', column)
      .single();

    if (fieldDefError || !fieldDef) {
      return { success: false, error: 'Field not defined or not inferable' };
    }

    if (fieldDef.inferable === false) {
      return { success: false, error: 'This field is not marked as inferable' };
    }

    // Get rows to analyze
    const { data: rows, error: rowsError } = await supabaseAdmin
      .from(table)
      .select('id, *')
      .eq('user_id', userId)
      .in('id', rowIds);

    if (rowsError) {
      console.error('Error fetching rows:', rowsError);
      return { success: false, error: rowsError.message };
    }

    // For each row, analyze and create suggestion
    // In production, this would use Gemini to analyze patterns
    // For now, we'll create placeholder suggestions
    const suggestions: Record<string, any> = {};

    for (const row of rows || []) {
      // Check if custom_fields exists and is not empty
      let customFields: Record<string, any> = {};
      try {
        if (row.custom_fields) {
          customFields = typeof row.custom_fields === 'string'
            ? JSON.parse(row.custom_fields)
            : row.custom_fields;
        }
      } catch (e) {
        customFields = {};
      }

      // Check if suggestion already exists
      let aiSuggestions: Record<string, any> = {};
      try {
        if (row.ai_suggestions) {
          aiSuggestions = typeof row.ai_suggestions === 'string'
            ? JSON.parse(row.ai_suggestions)
            : row.ai_suggestions;
        }
      } catch (e) {
        aiSuggestions = {};
      }

      // If column already has value, skip
      if (customFields[column]) {
        continue;
      }

      // For now, set low confidence (0) indicating we cannot infer
      // In production, Gemini would analyze patterns here
      aiSuggestions[column] = {
        value: null,
        confidence: 0,
        reasoning: 'Indeferable - tidak ada informasi terkait di data yang tersedia'
      };

      // Update ai_suggestions using the database function
      await supabaseAdmin.rpc('update_ai_suggestion', {
        p_row_id: row.id,
        p_user_id: userId,
        p_field_key: column,
        p_suggestion: aiSuggestions[column]
      });

      suggestions[row.id] = aiSuggestions[column];
    }

    return { success: true, suggestions };
  } catch (err) {
    console.error('Exception in suggestFieldValues:', err);
    return { success: false, error: 'Internal error' };
  }
}
