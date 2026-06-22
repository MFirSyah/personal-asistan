import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

export interface AuthenticatedUser {
  userId: string;
  email?: string;
}

/**
 * Verifies the incoming request for gateway security and Supabase JWT authenticity.
 * @param req NextRequest
 * @returns AuthenticatedUser or a NextResponse representing an error
 */
export async function verifyGatewayAndUser(
  req: NextRequest
): Promise<AuthenticatedUser | NextResponse> {
  // 1. Lapis 1: Gateway Key Verification
  const gatewayKey = req.headers.get('x-jarvis-gateway-key');
  const expectedGatewayKey = process.env.GATEWAY_KEY;

  if (!expectedGatewayKey) {
    console.error('GATEWAY_KEY is not defined in environment variables.');
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  if (gatewayKey !== expectedGatewayKey) {
    return NextResponse.json(
      { error: 'Unauthorized: Invalid gateway key' },
      { status: 401 }
    );
  }

  // 2. Lapis 2: Supabase JWT Verification
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Unauthorized: Missing or invalid Authorization header' },
      { status: 401 }
    );
  }

  const token = authHeader.split(' ')[1];
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;

  if (!jwtSecret) {
    console.error('SUPABASE_JWT_SECRET is not defined in environment variables.');
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  try {
    // Supabase JWT is signed with HS256 using the project's JWT Secret
    const decoded = jwt.verify(token, jwtSecret) as {
      sub: string;
      email?: string;
      role?: string;
    };

    if (!decoded.sub) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid token claims' },
        { status: 401 }
      );
    }

    return {
      userId: decoded.sub,
      email: decoded.email,
    };
  } catch (error) {
    console.error('JWT Verification failed:', error);
    return NextResponse.json(
      { error: 'Unauthorized: Token validation failed or expired' },
      { status: 401 }
    );
  }
}
