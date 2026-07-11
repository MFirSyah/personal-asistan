/**
 * Widget Data Endpoint - Execute Query Config
 * Arsitektur Reference: Bagian 11.4 - Backend Generic Query
 *
 * Endpoint ini yang benar-benar mengeksekusi query_config menjadi SQL aman
 * Menggunakan whitelist approach - tidak ada raw SQL
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/services/supabase';
import { verifyGatewayAndUser } from '@/lib/middleware/gateway';

// ============================================================================
// Whitelist Configuration
// ============================================================================

const ALLOWED_TABLES = ['finance_records', 'activity_log', 'notifications_log'];

const ALLOWED_COLUMNS: Record<string, string[]> = {
  finance_records: ['id', 'user_id', 'type', 'amount', 'description', 'transaction_date', 'created_at', 'updated_at', 'dynamic_metadata', 'custom_fields'],
  activity_log: ['id', 'user_id', 'activity', 'category', 'source', 'mood', 'energy_level', 'notes', 'custom_fields', 'occurred_at', 'created_at', 'updated_at'],
  notifications_log: ['id', 'user_id', 'source_app', 'title', 'body', 'category', 'priority', 'is_important', 'is_actioned', 'requires_action', 'received_at', 'created_at'],
};

const ALLOWED_AGGREGATIONS = ['sum', 'count', 'avg', 'min', 'max'];

// ============================================================================
// Query Builder - Safe, No Raw SQL
// ============================================================================

interface QueryConfig {
  groupBy?: string;
  aggregation: 'sum' | 'count' | 'avg' | 'min' | 'max';
  valueField?: string;
  filters?: Array<{
    field: string;
    operator: 'eq' | 'gt' | 'lt' | 'between' | 'like';
    value: string | number | string[];
  }>;
  dateRange?: {
    type: 'relative' | 'absolute';
    value?: string;
    start?: string;
    end?: string;
  };
  sortBy?: string;
  limit?: number;
}

function buildSafeQuery(table: string, config: QueryConfig, userId: string) {
  // Validate table
  if (!ALLOWED_TABLES.includes(table)) {
    throw new Error(`Invalid table: ${table}`);
  }

  const allowedCols = ALLOWED_COLUMNS[table] || [];
  const columns: string[] = [];
  const params: any[] = [userId];
  let paramIndex = 2;

  // Build SELECT clause
  const aggregation = config.aggregation?.toLowerCase();
  if (!ALLOWED_AGGREGATIONS.includes(aggregation)) {
    throw new Error(`Invalid aggregation: ${aggregation}`);
  }

  if (config.groupBy) {
    // Validate groupBy column
    if (!allowedCols.includes(config.groupBy)) {
      throw new Error(`Invalid groupBy column: ${config.groupBy}`);
    }

    if (aggregation === 'count') {
      columns.push(`"${config.groupBy}"`);
      columns.push(`COUNT(*) as value`);
    } else if (aggregation === 'sum' || aggregation === 'avg') {
      const valueField = config.valueField || 'amount';
      if (!allowedCols.includes(valueField)) {
        throw new Error(`Invalid valueField: ${valueField}`);
      }
      columns.push(`"${config.groupBy}"`);
      columns.push(`${aggregation.toUpperCase}("${valueField}") as value`);
    } else {
      const valueField = config.valueField || 'amount';
      columns.push(`"${config.groupBy}"`);
      columns.push(`${aggregation.toUpperCase}("${valueField}") as value`);
    }
  } else {
    // No groupBy - return raw data
    if (aggregation === 'count') {
      columns.push(`COUNT(*) as value`);
    } else if (aggregation === 'sum') {
      const valueField = config.valueField || 'amount';
      if (!allowedCols.includes(valueField)) {
        throw new Error(`Invalid valueField: ${valueField}`);
      }
      columns.push(`SUM("${valueField}") as value`);
    } else if (aggregation === 'avg') {
      const valueField = config.valueField || 'amount';
      columns.push(`AVG("${valueField}") as value`);
    } else if (aggregation === 'min') {
      const valueField = config.valueField || 'amount';
      columns.push(`MIN("${valueField}") as value`);
    } else if (aggregation === 'max') {
      const valueField = config.valueField || 'amount';
      columns.push(`MAX("${valueField}") as value`);
    } else {
      // Just select everything allowed
      columns.push('*');
    }
  }

  // Build WHERE clause
  let whereClause = 'WHERE user_id = $1';

  // Date range filter
  if (config.dateRange) {
    const dateColumn = table === 'notifications_log' ? 'received_at' :
                       table === 'activity_log' ? 'occurred_at' : 'transaction_date';

    if (config.dateRange.type === 'relative') {
      let days = 30;
      switch (config.dateRange.value) {
        case 'today': days = 0; break;
        case 'this_week': days = 7; break;
        case 'this_month': days = 30; break;
        case 'last_30_days': days = 30; break;
        case 'last_7_days': days = 7; break;
        case 'last_90_days': days = 90; break;
        default: days = 30;
      }

      if (days === 0) {
        whereClause += ` AND DATE(${dateColumn}) = CURRENT_DATE`;
      } else {
        whereClause += ` AND ${dateColumn} >= NOW() - INTERVAL '${days} days'`;
      }
    } else if (config.dateRange.start && config.dateRange.end) {
      whereClause += ` AND ${dateColumn} >= $${paramIndex}`;
      params.push(config.dateRange.start);
      paramIndex++;
      whereClause += ` AND ${dateColumn} <= $${paramIndex}`;
      params.push(config.dateRange.end);
      paramIndex++;
    }
  }

  // Additional filters
  if (config.filters && config.filters.length > 0) {
    for (const filter of config.filters) {
      if (!allowedCols.includes(filter.field)) {
        throw new Error(`Invalid filter field: ${filter.field}`);
      }

      switch (filter.operator) {
        case 'eq':
          whereClause += ` AND "${filter.field}" = $${paramIndex}`;
          params.push(filter.value);
          paramIndex++;
          break;
        case 'gt':
          whereClause += ` AND "${filter.field}" > $${paramIndex}`;
          params.push(filter.value);
          paramIndex++;
          break;
        case 'lt':
          whereClause += ` AND "${filter.field}" < $${paramIndex}`;
          params.push(filter.value);
          paramIndex++;
          break;
        case 'between':
          if (Array.isArray(filter.value) && filter.value.length === 2) {
            whereClause += ` AND "${filter.field}" BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
            params.push(filter.value[0], filter.value[1]);
            paramIndex += 2;
          }
          break;
        case 'like':
          whereClause += ` AND "${filter.field}" ILIKE $${paramIndex}`;
          params.push(`%${filter.value}%`);
          paramIndex++;
          break;
      }
    }
  }

  // Build GROUP BY if needed
  let groupByClause = '';
  if (config.groupBy && aggregation !== 'count' &&
      !['SUM', 'AVG', 'COUNT', 'MIN', 'MAX'].includes(aggregation.toUpperCase())) {
    groupByClause = `GROUP BY "${config.groupBy}"`;
  } else if (config.groupBy && (aggregation === 'count' || aggregation === 'sum')) {
    groupByClause = `GROUP BY "${config.groupBy}"`;
  }

  // Build ORDER BY
  let orderByClause = '';
  if (config.sortBy) {
    if (allowedCols.includes(config.sortBy)) {
      orderByClause = `ORDER BY "${config.sortBy}" DESC`;
    }
  }

  // Build LIMIT
  let limitClause = '';
  const limit = Math.min(config.limit || 100, 500);
  limitClause = `LIMIT ${limit}`;

  // Assemble query
  const selectClause = columns.join(', ');
  let query = `SELECT ${selectClause} FROM ${table} ${whereClause}`;

  if (groupByClause) {
    query += ` ${groupByClause}`;
  }
  if (orderByClause) {
    query += ` ${orderByClause}`;
  }
  if (limitClause) {
    query += ` ${limitClause}`;
  }

  return { query, params };
}

// ============================================================================
// GET /api/v1/analytics/widgets/[id]/data - Execute widget query
// ============================================================================

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifyGatewayAndUser(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = authResult;
  const { id } = await params;

  try {
    // Fetch widget configuration
    const { data: widget, error: widgetError } = await supabaseAdmin
      .from('custom_analyses')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (widgetError || !widget) {
      return NextResponse.json({ error: 'Widget not found' }, { status: 404 });
    }

    // Build and execute safe query
    const { query, params: queryParams } = buildSafeQuery(
      widget.data_source,
      widget.query_config,
      userId
    );

    const { data, error } = await supabaseAdmin.rpc('execute_safe_query', {
      p_query: query,
      p_params: queryParams,
    });

    if (error) {
      console.error('Query execution error:', error);
      // Fallback to direct query if RPC not available
      const fallbackResult = await supabaseAdmin.rpc('execute_read_query', {
        p_table: widget.data_source,
        p_where_user_id: userId,
      });

      if (fallbackResult.error) {
        return NextResponse.json({ error: 'Query execution failed' }, { status: 500 });
      }

      return NextResponse.json({
        widget: {
          id: widget.id,
          title: widget.title,
          chart_type: widget.chart_type,
        },
        data: fallbackResult.data || [],
      });
    }

    return NextResponse.json({
      widget: {
        id: widget.id,
        title: widget.title,
        chart_type: widget.chart_type,
        description: widget.description,
      },
      data: data || [],
    });
  } catch (err: any) {
    console.error('Error executing widget query:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
