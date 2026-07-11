/**
 * Dynamic Widgets API - Custom Analysis Widgets
 * Arsitektur Reference: Bagian 11 - Opsi A
 *
 * Endpoint untuk membuat, membaca, mengupdate, dan menghapus widget analisis dinamis
 * yang dibuat user via chat AI
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/services/supabase';
import { verifyGatewayAndUser } from '@/lib/middleware/gateway';

// ============================================================================
// Schema Validation
// ============================================================================

const QueryConfigSchema = z.object({
  groupBy: z.string().optional(),
  aggregation: z.enum(['sum', 'count', 'avg', 'min', 'max']),
  valueField: z.string().optional(),
  filters: z.array(z.object({
    field: z.string(),
    operator: z.enum(['eq', 'gt', 'lt', 'between', 'like']),
    value: z.union([z.string(), z.number(), z.array(z.string())]),
  })).optional(),
  dateRange: z.object({
    type: z.enum(['relative', 'absolute']),
    value: z.string().optional(),
    start: z.string().optional(),
    end: z.string().optional(),
  }),
  sortBy: z.string().optional(),
  limit: z.number().int().positive().max(500).optional(),
});

const CreateWidgetSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  chartType: z.enum(['line', 'bar', 'pie', 'table', 'number']),
  dataSource: z.enum(['finance_records', 'activity_log', 'notifications_log']),
  queryConfig: QueryConfigSchema,
  isPinned: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const UpdateWidgetSchema = CreateWidgetSchema.partial();

// ============================================================================
// Helper: Verify ownership
// ============================================================================

async function verifyOwnership(widgetId: string, userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('custom_analyses')
    .select('id')
    .eq('id', widgetId)
    .eq('user_id', userId)
    .single();

  return !!data;
}

// ============================================================================
// GET /api/v1/analytics/widgets - List all widgets for user
// ============================================================================

export async function GET(req: NextRequest) {
  const authResult = await verifyGatewayAndUser(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = authResult;

  try {
    const { data, error } = await supabaseAdmin
      .from('custom_analyses')
      .select('*')
      .eq('user_id', userId)
      .order('is_pinned', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch widgets:', error);
      return NextResponse.json({ error: 'Failed to fetch widgets' }, { status: 500 });
    }

    return NextResponse.json({ widgets: data || [] });
  } catch (err: any) {
    console.error('Error fetching widgets:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ============================================================================
// POST /api/v1/analytics/widgets - Create new widget
// ============================================================================

export async function POST(req: NextRequest) {
  const authResult = await verifyGatewayAndUser(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = authResult;

  try {
    const body = await req.json();
    const validation = CreateWidgetSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({
        error: 'Invalid widget configuration',
        details: validation.error.flatten(),
      }, { status: 400 });
    }

    const widgetData = {
      user_id: userId,
      title: validation.data.title,
      description: validation.data.description,
      chart_type: validation.data.chartType,
      data_source: validation.data.dataSource,
      query_config: validation.data.queryConfig,
      is_pinned: validation.data.isPinned || false,
      sort_order: validation.data.sortOrder || 0,
    };

    const { data, error } = await supabaseAdmin
      .from('custom_analyses')
      .insert(widgetData)
      .select()
      .single();

    if (error) {
      console.error('Failed to create widget:', error);
      return NextResponse.json({ error: 'Failed to create widget' }, { status: 500 });
    }

    return NextResponse.json({ widget: data }, { status: 201 });
  } catch (err: any) {
    console.error('Error creating widget:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
