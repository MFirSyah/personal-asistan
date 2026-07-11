/**
 * Custom Field Definition API - Single Record
 * Arsitektur Reference: Bagian 13.7, 22.2
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/services/supabase';
import { verifyGatewayAndUser } from '@/lib/middleware/gateway';

type RouteParams = { params: Promise<{ id: string }> };

// ============================================================================
// GET /api/v1/data/custom-fields/[id] - Get single field definition
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
      .from('custom_field_definitions')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Field definition not found' }, { status: 404 });
    }

    return NextResponse.json({ field: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ============================================================================
// PATCH /api/v1/data/custom-fields/[id] - Update field definition
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

    if (body.label) updateData.label = body.label;
    if (body.fieldType) updateData.field_type = body.fieldType;
    if (body.selectOptions) updateData.select_options = body.selectOptions;
    if (typeof body.inferable === 'boolean') updateData.inferable = body.inferable;
    if (typeof body.sortOrder === 'number') updateData.sort_order = body.sortOrder;

    const { data, error } = await supabaseAdmin
      .from('custom_field_definitions')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Failed to update field definition' }, { status: 404 });
    }

    return NextResponse.json({ field: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ============================================================================
// DELETE /api/v1/data/custom-fields/[id] - Delete field definition
// Soft delete - hanya hapus definisi, data di JSONB tetap ada
// ============================================================================

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const authResult = await verifyGatewayAndUser(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = authResult;
  const { id } = await params;

  try {
    // Verify ownership first
    const { data: existing } = await supabaseAdmin
      .from('custom_field_definitions')
      .select('id, field_key, table_name')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Field definition not found' }, { status: 404 });
    }

    // Soft delete - just remove the definition
    // Data di custom_fields JSONB TETAP ADA, cuma tidak ditampilkan lagi
    const { error } = await supabaseAdmin
      .from('custom_field_definitions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to delete field definition:', error);
      return NextResponse.json({ error: 'Failed to delete field definition' }, { status: 500 });
    }

    return NextResponse.json({
      message: `Field '${existing.field_key}' deleted. Data in ${existing.table_name}.custom_fields is preserved.`
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
