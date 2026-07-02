import { NextRequest, NextResponse } from 'next/server';
import { verifyGatewayAndUser } from '@/lib/middleware/gateway';
import { supabaseAdmin } from '@/lib/services/supabase';
import { handleToolCall } from '@/lib/tools/executor';

// Security headers
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
};

// Destructive action types that require confirmation
const DESTRUCTIVE_TYPES = ['delete', 'update'];

// GET - Fetch pending destructive actions
export async function GET(req: NextRequest) {
  const authResult = await verifyGatewayAndUser(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = authResult;

  try {
    // Get all pending actions for user
    const { data: actions, error } = await supabaseAdmin
      .from('pending_destructive_actions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error fetching pending actions:', error);
      return NextResponse.json(
        { error: 'Failed to fetch pending actions' },
        { status: 500, headers: securityHeaders }
      );
    }

    // Cleanup expired actions
    await supabaseAdmin.rpc('cleanup_expired_pending_actions');

    return NextResponse.json({
      pending_actions: actions || [],
      count: actions?.length || 0
    }, { headers: securityHeaders });

  } catch (err: any) {
    console.error('Pending actions API error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// POST - Create new pending destructive action
export async function POST(req: NextRequest) {
  const authResult = await verifyGatewayAndUser(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = authResult;

  try {
    const body = await req.json();
    const { action_type, table_name, statement, intent } = body;

    // Validate required fields
    if (!action_type || !table_name || !statement || !intent) {
      return NextResponse.json(
        { error: 'Missing required fields: action_type, table_name, statement, intent' },
        { status: 400, headers: securityHeaders }
      );
    }

    // Only allow destructive types
    if (!DESTRUCTIVE_TYPES.includes(intent.toLowerCase())) {
      return NextResponse.json(
        { error: 'Only DELETE and UPDATE actions require confirmation' },
        { status: 400, headers: securityHeaders }
      );
    }

    // Check if user already has a pending action for this table
    const { data: existing } = await supabaseAdmin
      .from('pending_destructive_actions')
      .select('id')
      .eq('user_id', userId)
      .eq('table_name', table_name)
      .eq('status', 'pending')
      .gte('expires_at', new Date().toISOString())
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'You already have a pending action for this table' },
        { status: 409, headers: securityHeaders }
      );
    }

    // Estimate affected rows (preview)
    let affectedRowsEstimate = 0;
    if (intent.toLowerCase() === 'delete') {
      const { count } = await supabaseAdmin
        .from(table_name)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      affectedRowsEstimate = count || 0;
    }

    // Create pending action
    const { data: newAction, error } = await supabaseAdmin
      .from('pending_destructive_actions')
      .insert({
        user_id: userId,
        action_type,
        table_name,
        statement,
        statement_preview: statement.substring(0, 200),
        intent: intent.toLowerCase(),
        status: 'pending',
        context: {
          affected_rows_estimate: affectedRowsEstimate,
          created_via: 'ai_chat'
        }
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating pending action:', error);
      return NextResponse.json(
        { error: 'Failed to create pending action' },
        { status: 500, headers: securityHeaders }
      );
    }

    return NextResponse.json({
      success: true,
      pending_action: newAction,
      message: 'Action pending confirmation. Use /pending-actions/[id]/approve or /pending-actions/[id]/reject'
    }, { headers: securityHeaders });

  } catch (err: any) {
    console.error('Create pending action error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
