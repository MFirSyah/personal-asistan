import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export async function GET() {
  const checks: Record<string, string> = {};
  
  // 1. Check env vars
  checks.GEMINI_API_KEY = process.env.GEMINI_API_KEY ? `exists (${process.env.GEMINI_API_KEY.substring(0, 6)}...)` : 'MISSING';
  checks.GATEWAY_KEY = process.env.GATEWAY_KEY ? 'exists' : 'MISSING';
  checks.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ? 'exists' : 'MISSING';
  
  // 2. Test Gemini connection
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const result = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: 'Reply with exactly: OK',
    });
    checks.gemini_connection = `OK - response: "${result.text}"`;
  } catch (err: any) {
    checks.gemini_connection = `FAILED - ${err.message || err}`;
  }
  
  return NextResponse.json({
    status: 'health-check',
    timestamp: new Date().toISOString(),
    checks,
  });
}
