import { NextRequest, NextResponse } from 'next/server';
import { verifyGatewayAndUser } from '@/lib/middleware/gateway';
import { supabaseAdmin } from '@/lib/services/supabase';

// Security headers
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
};

// GET - Fetch user's analysis preferences
export async function GET(req: NextRequest) {
  const authResult = await verifyGatewayAndUser(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = authResult;

  try {
    // Get user's analysis preferences
    const { data: preferences, error } = await supabaseAdmin
      .from('user_analysis_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching preferences:', error);
      return NextResponse.json(
        { error: 'Failed to fetch preferences' },
        { status: 500, headers: securityHeaders }
      );
    }

    // Get available insight categories
    const { data: categories } = await supabaseAdmin
      .from('insight_categories')
      .select('*')
      .eq('is_active', true)
      .order('display_order');

    // If no preferences exist, create defaults
    if (!preferences) {
      const { data: newPrefs, error: createError } = await supabaseAdmin
        .from('user_analysis_preferences')
        .insert({ user_id: userId })
        .select()
        .single();

      if (createError) {
        console.error('Error creating preferences:', createError);
        return NextResponse.json(
          { error: 'Failed to create default preferences' },
          { status: 500, headers: securityHeaders }
        );
      }

      return NextResponse.json({
        preferences: newPrefs,
        categories: categories || [],
        is_default: true
      }, { headers: securityHeaders });
    }

    return NextResponse.json({
      preferences,
      categories: categories || [],
      is_default: false
    }, { headers: securityHeaders });

  } catch (err: any) {
    console.error('Preferences API error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// PUT - Update user's analysis preferences
export async function PUT(req: NextRequest) {
  const authResult = await verifyGatewayAndUser(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = authResult;

  try {
    const body = await req.json();

    // Validate input
    const allowedFields = [
      'preferred_categories',
      'exclude_categories',
      'currency_format',
      'date_range',
      'savings_target_percent',
      'include_cash_flow',
      'include_leak_audit',
      'include_consistency',
      'include_priority_matrix',
      'include_runway_prediction',
      'include_risk_simulation',
      'include_burnout_detection',
      'include_mood_correlation',
      'include_worth_it_score',
      'analysis_frequency',
      'insight_detail_level',
      'prefer_visualizations',
      'prefer_action_plans',
      'notify_on_alerts',
      'alert_threshold_risk'
    ];

    // Filter to only allowed fields
    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    // Always update timestamp
    updates.updated_at = new Date().toISOString();

    // Update preferences
    const { data: updated, error } = await supabaseAdmin
      .from('user_analysis_preferences')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating preferences:', error);
      return NextResponse.json(
        { error: 'Failed to update preferences' },
        { status: 500, headers: securityHeaders }
      );
    }

    return NextResponse.json({
      success: true,
      preferences: updated
    }, { headers: securityHeaders });

  } catch (err: any) {
    console.error('Preferences update error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// PATCH - Quick toggle for specific analysis type
export async function PATCH(req: NextRequest) {
  const authResult = await verifyGatewayAndUser(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = authResult;

  try {
    const body = await req.json();
    const { analysis_type, enabled } = body;

    // Map analysis type to database field
    const fieldMap: Record<string, string> = {
      'cash_flow': 'include_cash_flow',
      'leak_audit': 'include_leak_audit',
      'consistency': 'include_consistency',
      'priority': 'include_priority_matrix',
      'runway': 'include_runway_prediction',
      'risk': 'include_risk_simulation',
      'burnout': 'include_burnout_detection',
      'mood_correlation': 'include_mood_correlation',
      'worth_it': 'include_worth_it_score'
    };

    const field = fieldMap[analysis_type];
    if (!field) {
      return NextResponse.json(
        { error: 'Invalid analysis type' },
        { status: 400, headers: securityHeaders }
      );
    }

    // Toggle the setting
    const { data: updated, error } = await supabaseAdmin
      .from('user_analysis_preferences')
      .update({
        [field]: enabled,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error toggling analysis type:', error);
      return NextResponse.json(
        { error: 'Failed to toggle analysis type' },
        { status: 500, headers: securityHeaders }
      );
    }

    return NextResponse.json({
      success: true,
      analysis_type,
      enabled,
      preferences: updated
    }, { headers: securityHeaders });

  } catch (err: any) {
    console.error('Toggle analysis error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
