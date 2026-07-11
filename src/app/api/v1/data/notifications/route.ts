/**
 * Notifications Log API
 * Arsitektur Reference: Bagian 2, 14
 *
 * CRUD untuk notifications_log (read-only primary, actioned toggle)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/services/supabase';
import { verifyGatewayAndUser } from '@/lib/middleware/gateway';

// ============================================================================
// Schema Validation
// ============================================================================

const CreateNotificationSchema = z.object({
  sourceApp: z.string().min(1),
  title: z.string().optional(),
  body: z.string().optional(),
  category: z.enum(['meeting', 'finance', 'urgent', 'message', 'delivery', 'social', 'other']).optional(),
  priority: z.enum(['urgent', 'important', 'informational', 'noise']).default('informational'),
  isImportant: z.boolean().optional(),
  rawPayload: z.record(z.string(), z.any()).optional(),
  receivedAt: z.string().datetime(),
});

const UpdateNotificationSchema = z.object({
  isActioned: z.boolean().optional(),
  isImportant: z.boolean().optional(),
  userFeedback: z.enum(['confirmed_important', 'marked_not_important']).optional(),
});

// ============================================================================
// GET /api/v1/data/notifications - List notifications
// ============================================================================

export async function GET(req: NextRequest) {
  const authResult = await verifyGatewayAndUser(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = authResult;

  try {
    const { searchParams } = new URL(req.url);
    const sourceApp = searchParams.get('sourceApp');
    const priority = searchParams.get('priority');
    const isImportant = searchParams.get('isImportant');
    const isActioned = searchParams.get('isActioned');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '20'), 100);

    let query = supabaseAdmin
      .from('notifications_log')
      .select('*', { count: 'exact' })
      .eq('user_id', userId);

    if (sourceApp) {
      query = query.eq('source_app', sourceApp);
    }

    if (priority) {
      query = query.eq('priority', priority);
    }

    if (isImportant === 'true') {
      query = query.eq('is_important', true);
    }

    if (isActioned === 'true') {
      query = query.eq('is_actioned', true);
    } else if (isActioned === 'false') {
      query = query.eq('is_actioned', false);
    }

    if (startDate) {
      query = query.gte('received_at', startDate);
    }

    if (endDate) {
      query = query.lte('received_at', endDate);
    }

    query = query
      .order('received_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize);

    const { data, error, count } = await query;

    if (error) {
      console.error('Failed to fetch notifications:', error);
      return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
    }

    // Get unique source apps for filter options
    const { data: sourceApps } = await supabaseAdmin
      .from('notifications_log')
      .select('source_app')
      .eq('user_id', userId)
      .limit(1000);

    const uniqueSourceApps = [...new Set(sourceApps?.map(n => n.source_app) || [])];

    return NextResponse.json({
      notifications: data || [],
      filterOptions: {
        sourceApps: uniqueSourceApps,
      },
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
    });
  } catch (err: any) {
    console.error('Error fetching notifications:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ============================================================================
// POST /api/v1/data/notifications - Create notification (from mobile app)
// ============================================================================

export async function POST(req: NextRequest) {
  const authResult = await verifyGatewayAndUser(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = authResult;

  try {
    const body = await req.json();
    const validation = CreateNotificationSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({
        error: 'Invalid notification data',
        details: validation.error.flatten(),
      }, { status: 400 });
    }

    const notificationData = {
      user_id: userId,
      source_app: validation.data.sourceApp,
      title: validation.data.title,
      body: validation.data.body,
      category: validation.data.category,
      priority: validation.data.priority,
      is_important: validation.data.isImportant || false,
      is_actioned: false,
      requires_action: validation.data.priority === 'urgent' || validation.data.priority === 'important',
      raw_payload: validation.data.rawPayload || {},
      received_at: validation.data.receivedAt,
    };

    const { data, error } = await supabaseAdmin
      .from('notifications_log')
      .insert(notificationData)
      .select()
      .single();

    if (error) {
      console.error('Failed to create notification:', error);
      return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 });
    }

    return NextResponse.json({ notification: data }, { status: 201 });
  } catch (err: any) {
    console.error('Error creating notification:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
