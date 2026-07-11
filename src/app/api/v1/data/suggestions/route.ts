/**
 * AI Suggestions API - Smart Backfill
 * Arsitektur Reference: Bagian 22.4, 22.5
 *
 * CRUD untuk staging area saran AI sebelum di-approve user
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/services/supabase';
import { verifyGatewayAndUser } from '@/lib/middleware/gateway';

type RouteParams = { params: Promise<{ id: string }> };

// ============================================================================
// GET /api/v1/data/suggestions - List all suggestions for user
// ============================================================================

export async function GET(req: NextRequest) {
  const authResult = await verifyGatewayAndUser(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = authResult;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'pending';
    const tableName = searchParams.get('table');

    let query = supabaseAdmin
      .from('ai_suggestions')
      .select('*')
      .eq('user_id', userId);

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    if (tableName) {
      query = query.eq('table_name', tableName);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch suggestions:', error);
      return NextResponse.json({ error: 'Failed to fetch suggestions' }, { status: 500 });
    }

    return NextResponse.json({ suggestions: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ============================================================================
// POST /api/v1/data/suggestions - Create suggestion (AI internal use)
// ============================================================================

export async function POST(req: NextRequest) {
  const authResult = await verifyGatewayAndUser(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = authResult;

  try {
    const body = await req.json();
    const { tableName, recordId, fieldKey, suggestedValue, confidence } = body;

    if (!tableName || !recordId || !fieldKey || !suggestedValue) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate confidence
    const conf = typeof confidence === 'number' ? confidence : 0;
    if (conf < 0.4 && conf !== 0) {
      // Low confidence suggestions are not stored - too uncertain
      return NextResponse.json({ message: 'Suggestion not stored due to low confidence' });
    }

    const suggestionData = {
      user_id: userId,
      table_name: tableName,
      record_id: recordId,
      field_key: fieldKey,
      suggested_value: {
        value: suggestedValue.value || suggestedValue,
        confidence: conf,
        reasoning: suggestedValue.reasoning || '',
      },
      status: 'pending',
    };

    const { data, error } = await supabaseAdmin
      .from('ai_suggestions')
      .upsert(suggestionData, {
        onConflict: 'user_id,table_name,record_id,field_key',
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create suggestion:', error);
      return NextResponse.json({ error: 'Failed to create suggestion' }, { status: 500 });
    }

    return NextResponse.json({ suggestion: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
