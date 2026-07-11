/**
 * Activity Log API - Single Record
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/services/supabase';
import { verifyGatewayAndUser } from '@/lib/middleware/gateway';

type RouteParams = { params: Promise<{ id: string }> };

// ============================================================================
// GET /api/v1/data/activity/[id] - Get single activity
// ============================================================================

export async function GET(req: NextRequest, { params }: RouteParams) {
  const authResult = await verifyGatewayAndUser(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = authResult;
  const { id } = await params;

  try {
    const { data, error } = await supabaseAdmin
      .from('activity_log')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Activity not found' }, { status: 404 });
    }

    return NextResponse.json({ activity: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ============================================================================
// PATCH /api/v1/data/activity/[id] - Update activity
// ============================================================================

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const authResult = await verifyGatewayAndUser(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = authResult;
  const { id } = await params;

  try {
    const body = await req.json();
    const updateData: Record<string, any> = {};

    if (body.activity) updateData.activity = body.activity;
    if (body.category) updateData.category = body.category;
    if (body.mood) updateData.mood = body.mood;
    if (typeof body.energyLevel === 'number') updateData.energy_level = body.energyLevel;
    if (body.notes) updateData.notes = body.notes;

    // Handle custom_fields update using jsonb_set
    if (body.customFieldKey && body.value !== undefined) {
      updateData.custom_fields = supabaseAdmin.rpc('jsonb_set_key', {
        p_jsonb: supabaseAdmin.rpc('coalesce', { null_val: {} }),
        p_key: body.customFieldKey,
        p_value: JSON.stringify(body.value),
      });
    }

    const { data, error } = await supabaseAdmin
      .from('activity_log')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Failed to update activity:', error);
      return NextResponse.json({ error: 'Failed to update activity' }, { status: 500 });
    }

    return NextResponse.json({ activity: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ============================================================================
// DELETE /api/v1/data/activity/[id] - Delete activity
// ============================================================================

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const authResult = await verifyGatewayAndUser(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = authResult;
  const { id } = await params;

  try {
    const { error } = await supabaseAdmin
      .from('activity_log')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      return NextResponse.json({ error: 'Failed to delete activity' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Activity deleted' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
