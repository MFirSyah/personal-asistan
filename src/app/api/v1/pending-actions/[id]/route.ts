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

// PUT /api/v1/pending-actions/[id] - Approve pending action
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: actionId } = await params;
  const authResult = await verifyGatewayAndUser(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = authResult;

  try {
    if (!actionId) {
      return NextResponse.json(
        { error: 'action_id is required' },
        { status: 400, headers: securityHeaders }
      );
    }

    // Get pending action
    const { data: action, error: fetchError } = await supabaseAdmin
      .from('pending_destructive_actions')
      .select('*')
      .eq('id', actionId)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .single();

    if (fetchError || !action) {
      return NextResponse.json(
        { error: 'Pending action not found or already processed' },
        { status: 404, headers: securityHeaders }
      );
    }

    // Check if expired
    if (new Date(action.expires_at) < new Date()) {
      await supabaseAdmin
        .from('pending_destructive_actions')
        .update({ status: 'expired' })
        .eq('id', actionId);

      return NextResponse.json(
        { error: 'Action has expired. Please create a new request.' },
        { status: 410, headers: securityHeaders }
      );
    }

    // Execute the destructive action via tool executor
    console.log(`[PENDING ACTION] Approving and executing: ${action.statement}`);

    const result = await handleToolCall(
      'execute_database_query',
      {
        statement: action.statement,
        table_name: action.table_name,
        intent: action.intent
      },
      userId
    );

    // Update action status
    const newStatus = result.success ? 'approved' : 'failed';
    await supabaseAdmin
      .from('pending_destructive_actions')
      .update({
        status: newStatus,
        approved_at: new Date().toISOString()
      })
      .eq('id', actionId);

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Action approved and executed successfully`,
        affected_rows: (result as any).affected_rows || 0,
        result
      }, { headers: securityHeaders });
    } else {
      return NextResponse.json({
        success: false,
        message: `Action execution failed: ${result.error}`,
        result
      }, { status: 500, headers: securityHeaders });
    }

  } catch (err: any) {
    console.error('Approve action error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/pending-actions/[id] - Reject pending action
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: actionId } = await params;
  const authResult = await verifyGatewayAndUser(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = authResult;

  try {
    if (!actionId) {
      return NextResponse.json(
        { error: 'action_id is required' },
        { status: 400, headers: securityHeaders }
      );
    }

    // Update status to rejected
    const { error } = await supabaseAdmin
      .from('pending_destructive_actions')
      .update({
        status: 'rejected',
        rejected_at: new Date().toISOString()
      })
      .eq('id', actionId)
      .eq('user_id', userId)
      .eq('status', 'pending');

    if (error) {
      console.error('Reject action error:', error);
      return NextResponse.json(
        { error: 'Failed to reject action' },
        { status: 500, headers: securityHeaders }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Action rejected and cancelled'
    }, { headers: securityHeaders });

  } catch (err: any) {
    console.error('Reject action error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
