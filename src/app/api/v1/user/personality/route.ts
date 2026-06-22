import { NextRequest, NextResponse } from 'next/server';
import { verifyGatewayAndUser } from '@/lib/middleware/gateway';
import { supabaseAdmin } from '@/lib/services/supabase';

export async function POST(req: NextRequest) {
  // 1. Authenticate Request
  const authResult = await verifyGatewayAndUser(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = authResult;

  try {
    const body = await req.json();
    const { selected_personality, assistant_name, user_nickname, fullname } = body;

    const updatePayload: Record<string, any> = {};

    if (fullname !== undefined) {
      updatePayload.fullname = fullname;
    }
    if (assistant_name !== undefined) {
      updatePayload.assistant_name = assistant_name;
    }
    if (user_nickname !== undefined) {
      updatePayload.user_nickname = user_nickname;
    }

    if (selected_personality !== undefined) {
      // Validate personality ID
      const { data: personality, error: personalityError } = await supabaseAdmin
        .from('ai_personalities')
        .select('id')
        .eq('id', selected_personality)
        .maybeSingle();

      if (personalityError || !personality) {
        return NextResponse.json(
          { error: `Invalid personality ID: ${selected_personality}` },
          { status: 400 }
        );
      }
      updatePayload.selected_personality = selected_personality;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { error: 'No update parameters provided' },
        { status: 400 }
      );
    }

    // Update user profile. Always filter by user ID manually since RLS is bypassed.
    const { data: updatedProfile, error: updateError } = await supabaseAdmin
      .from('user_profiles')
      .update(updatePayload)
      .eq('id', userId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating profile:', updateError);
      return NextResponse.json(
        { error: 'Database error updating profile' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Profile updated successfully',
      profile: updatedProfile,
    });
  } catch (err: any) {
    console.error('Error in Personality Update Endpoint:', err);
    return NextResponse.json(
      { error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
