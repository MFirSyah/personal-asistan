/**
 * Activity Log API
 * Arsitektur Reference: Bagian 2, 22.2
 *
 * CRUD untuk activity_log dengan support custom_fields
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/services/supabase';
import { verifyGatewayAndUser } from '@/lib/middleware/gateway';

// ============================================================================
// Schema Validation
// ============================================================================

const CreateActivitySchema = z.object({
  activity: z.string().min(1).max(500),
  category: z.enum(['work', 'personal', 'health', 'social', 'education', 'other']).optional(),
  source: z.enum(['chat', 'notification', 'manual']).default('manual'),
  mood: z.enum(['happy', 'neutral', 'sad', 'stressed', 'energized', 'tired']).optional(),
  energyLevel: z.number().int().min(1).max(5).optional(),
  notes: z.string().max(1000).optional(),
  customFields: z.record(z.string(), z.any()).optional(),
  occurredAt: z.string().datetime().optional(),
});

const UpdateActivitySchema = z.object({
  activity: z.string().min(1).max(500).optional(),
  category: z.enum(['work', 'personal', 'health', 'social', 'education', 'other']).optional(),
  mood: z.enum(['happy', 'neutral', 'sad', 'stressed', 'energized', 'tired']).optional(),
  energyLevel: z.number().int().min(1).max(5).optional(),
  notes: z.string().max(1000).optional(),
  customFields: z.record(z.string(), z.any()).optional(),
});

// ============================================================================
// GET /api/v1/data/activity - List activities
// ============================================================================

export async function GET(req: NextRequest) {
  const authResult = await verifyGatewayAndUser(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = authResult;

  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '20'), 100);

    let query = supabaseAdmin
      .from('activity_log')
      .select('*', { count: 'exact' })
      .eq('user_id', userId);

    if (category) {
      query = query.eq('category', category);
    }

    if (startDate) {
      query = query.gte('occurred_at', startDate);
    }

    if (endDate) {
      query = query.lte('occurred_at', endDate);
    }

    query = query
      .order('occurred_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize);

    const { data, error, count } = await query;

    if (error) {
      console.error('Failed to fetch activities:', error);
      return NextResponse.json({ error: 'Failed to fetch activities' }, { status: 500 });
    }

    return NextResponse.json({
      activities: data || [],
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
    });
  } catch (err: any) {
    console.error('Error fetching activities:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ============================================================================
// POST /api/v1/data/activity - Create activity
// ============================================================================

export async function POST(req: NextRequest) {
  const authResult = await verifyGatewayAndUser(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = authResult;

  try {
    const body = await req.json();
    const validation = CreateActivitySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({
        error: 'Invalid activity data',
        details: validation.error.flatten(),
      }, { status: 400 });
    }

    const activityData = {
      user_id: userId,
      activity: validation.data.activity,
      category: validation.data.category || 'other',
      source: validation.data.source,
      mood: validation.data.mood,
      energy_level: validation.data.energyLevel,
      notes: validation.data.notes,
      custom_fields: validation.data.customFields || {},
      occurred_at: validation.data.occurredAt || new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('activity_log')
      .insert(activityData)
      .select()
      .single();

    if (error) {
      console.error('Failed to create activity:', error);
      return NextResponse.json({ error: 'Failed to create activity' }, { status: 500 });
    }

    return NextResponse.json({ activity: data }, { status: 201 });
  } catch (err: any) {
    console.error('Error creating activity:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
