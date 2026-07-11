/**
 * AI Suggestion API - Single Record
 * Arsitektur Reference: Bagian 22.4, 22.5
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/services/supabase';
import { verifyGatewayAndUser } from '@/lib/middleware/gateway';

type RouteParams = { params: Promise<{ id: string }> };

// ============================================================================
// GET /api/v1/data/suggestions/[id] - Get single suggestion
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
      .from('ai_suggestions')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
    }

    return NextResponse.json({ suggestion: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ============================================================================
// PATCH /api/v1/data/suggestions/[id] - Approve or reject suggestion
// Arsitektur Reference: Bagian 22.5
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
    const { action } = body; // 'approve' | 'reject' | 'expire'

    if (!['approve', 'reject', 'expire'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Get the suggestion first
    const { data: suggestion, error: fetchError } = await supabaseAdmin
      .from('ai_suggestions')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !suggestion) {
      return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
    }

    if (suggestion.status !== 'pending') {
      return NextResponse.json({ error: 'Suggestion already processed' }, { status: 409 });
    }

    const newStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'expired';

    // If approved, apply the value to the actual record
    if (action === 'approve') {
      const { table_name, record_id, field_key, suggested_value } = suggestion;
      const valueToApply = suggested_value.value;

      // Update the record using jsonb_set_key
      const tableToUpdate = table_name === 'finance_records' ? 'finance_records' : 'activity_log';

      const { error: updateError } = await supabaseAdmin.rpc('jsonb_set_value', {
        p_table: tableToUpdate,
        p_record_id: record_id,
        p_field_key: field_key,
        p_value: JSON.stringify(valueToApply),
        p_user_id: userId,
      });

      if (updateError) {
        console.error('Failed to apply suggestion:', updateError);
        // Fallback: try direct update
        const { data: record } = await supabaseAdmin
          .from(tableToUpdate)
          .select('custom_fields')
          .eq('id', record_id)
          .eq('user_id', userId)
          .single();

        if (record) {
          const updatedFields = {
            ...(record.custom_fields || {}),
            [field_key]: valueToApply,
          };

          await supabaseAdmin
            .from(tableToUpdate)
            .update({ custom_fields: updatedFields })
            .eq('id', record_id)
            .eq('user_id', userId);
        }
      }
    }

    // Update suggestion status
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('ai_suggestions')
      .update({
        status: newStatus,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update suggestion' }, { status: 500 });
    }

    return NextResponse.json({
      suggestion: updated,
      message: action === 'approve'
        ? `Suggestion approved and applied to ${suggestion.table_name}`
        : `Suggestion ${action === 'reject' ? 'rejected' : 'expired'}`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ============================================================================
// DELETE /api/v1/data/suggestions/[id] - Delete suggestion
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
      .from('ai_suggestions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      return NextResponse.json({ error: 'Failed to delete suggestion' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Suggestion deleted' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
