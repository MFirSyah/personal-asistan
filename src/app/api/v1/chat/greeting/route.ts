import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { verifyGatewayAndUser } from '@/lib/middleware/gateway';
import { supabaseAdmin } from '@/lib/services/supabase';

// In-memory cache for greeting timestamps (userId -> lastGreetingAt)
// Used as a fast check before DB lookup
const greetingCache = new Map<string, number>();
const GREETING_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function GET(req: NextRequest) {
  const authResult = await verifyGatewayAndUser(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const { userId } = authResult;

  try {
    // 1. Fast check: Is this user in our in-memory greeting cache?
    const cachedGreetingTime = greetingCache.get(userId);
    if (cachedGreetingTime && (Date.now() - cachedGreetingTime) < GREETING_CACHE_TTL_MS) {
      console.log(`[Greeting] Skipping - in-memory cache hit for user ${userId.substring(0, 8)}`);
      return NextResponse.json({ should_greet: false, greeting: null });
    }

    // 2. Fetch last chat message timestamp and user profile in parallel
    const [lastMsgResult, profileResult] = await Promise.all([
      supabaseAdmin
        .from('app_chat_messages')
        .select('created_at')
        .eq('user_id', userId)
        .is('room_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('user_profiles')
        .select('fullname, assistant_name, user_nickname, selected_personality, dynamic_metadata')
        .eq('id', userId)
        .maybeSingle()
    ]);

    const lastMsg = lastMsgResult.data;
    const profile = profileResult.data;
    const metadata = profile?.dynamic_metadata || {};

    // 3. Check dynamic_metadata for last greeting timestamp
    const lastGreetingTime = metadata.last_greeting_timestamp;
    if (lastGreetingTime) {
      const lastGreetingMs = new Date(lastGreetingTime).getTime();
      if ((Date.now() - lastGreetingMs) < GREETING_CACHE_TTL_MS) {
        console.log(`[Greeting] Skipping - DB cache hit for user ${userId.substring(0, 8)}`);
        // Update in-memory cache too
        greetingCache.set(userId, lastGreetingMs);
        return NextResponse.json({ should_greet: false, greeting: null });
      }
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const lastMsgTime = lastMsg?.created_at ? new Date(lastMsg.created_at) : null;

    // 4. Only greet if last message is older than 1 hour (or no messages at all)
    if (lastMsgTime && lastMsgTime > oneHourAgo) {
      return NextResponse.json({ should_greet: false, greeting: null });
    }

    const assistantName = profile?.assistant_name || 'Personal Asistan';
    const userNickname = profile?.user_nickname || 'Sobat';
    const personalityId = profile?.selected_personality || 'witty_sidekick';

    // 5. Parallel fetch: personality
    const [personalityResult] = await Promise.all([
      supabaseAdmin
        .from('ai_personalities')
        .select('system_instruction_template')
        .eq('id', personalityId)
        .maybeSingle()
    ]);

    const personality = personalityResult.data;
    const personalityHint = personality?.system_instruction_template
      ? personality.system_instruction_template.substring(0, 200)
      : 'Friendly and casual';

    // 6. Generate a short greeting with Gemini
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ should_greet: false, greeting: null });
    }

    const ai = new GoogleGenAI({ apiKey });
    const now = new Date();
    const hour = now.getUTCHours() + 7; // WIB offset
    let timeOfDay = 'siang';
    if (hour < 11) timeOfDay = 'pagi';
    else if (hour < 15) timeOfDay = 'siang';
    else if (hour < 18) timeOfDay = 'sore';
    else timeOfDay = 'malam';

    const result = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: `You are ${assistantName}, an AI personal assistant for ${userNickname}.
Your personality: ${personalityHint}
Current time in Indonesia (WIB): ${timeOfDay}, ${now.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} ${now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' })} WIB

Generate a SHORT friendly greeting in Indonesian (1-2 sentences max) to welcome the user back after being away for a while.
Include an appropriate emoji. Be warm, concise, and in character.
Do NOT ask what they need help with - just greet them naturally.`,
      config: {
        temperature: 0.8,
      },
    });

    const greeting = result.text ?? '';
    const nowISO = now.toISOString();

    // 7. Update greeting cache in DB and memory (fire and forget)
    greetingCache.set(userId, Date.now());
    const cacheUpdatePromise = supabaseAdmin
      .from('user_profiles')
      .update({
        dynamic_metadata: {
          ...metadata,
          last_greeting_timestamp: nowISO,
        },
      })
      .eq('id', userId);

    // Fire and forget - handle errors with async IIFE
    (async () => {
      try {
        await cacheUpdatePromise;
        console.log(`[Greeting] Cache updated for user ${userId.substring(0, 8)}`);
      } catch (err) {
        console.error('[Greeting] Failed to update cache:', err);
      }
    })();

    return NextResponse.json({
      should_greet: true,
      greeting: greeting.trim(),
    });
  } catch (err: any) {
    console.error('Greeting API error:', err);
    return NextResponse.json({ should_greet: false, greeting: null });
  }
}
