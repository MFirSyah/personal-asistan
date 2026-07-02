import { NextRequest, NextResponse } from 'next/server';
import { verifyGatewayAndUser } from '@/lib/middleware/gateway';
import { supabaseAdmin } from '@/lib/services/supabase';

// Security headers
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
};

export async function GET(req: NextRequest) {
  const authResult = await verifyGatewayAndUser(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    // Get active payment methods
    const { data: paymentMethods, error } = await supabaseAdmin
      .from('payment_methods')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching payment methods:', error);
      return NextResponse.json(
        { error: 'Failed to fetch payment methods' },
        { status: 500, headers: securityHeaders }
      );
    }

    return NextResponse.json({
      payment_methods: paymentMethods || [],
    });
  } catch (err: any) {
    console.error('Payment methods API error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
