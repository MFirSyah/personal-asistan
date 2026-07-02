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
  const { userId } = authResult;

  try {
    // Get search query from URL params
    const { searchParams } = new URL(req.url);
    let query = searchParams.get('q')?.trim() || '';

    if (!query || query.length < 2) {
      return NextResponse.json(
        { error: 'Query minimal 2 karakter' },
        { status: 400, headers: securityHeaders }
      );
    }

    // SECURITY: Sanitize query to prevent SQL/pattern injection
    // Remove wildcard characters that could match all records
    query = query
      .replace(/[%_]/g, ' ')  // Remove SQL wildcards
      .replace(/[<>'"\\;]/g, '')  // Remove potential XSS/Injection chars
      .trim()
      .substring(0, 100);  // Limit query length

    if (query.length < 2) {
      return NextResponse.json(
        { error: 'Query tidak valid setelah sanitasi' },
        { status: 400, headers: securityHeaders }
      );
    }

    const searchPattern = `%${query}%`;
    const results = {
      transactions: [] as Array<{
        id: string;
        type: string;
        amount: number;
        description: string;
        date: string;
        category: string;
      }>,
      tasks: [] as Array<{
        id: string;
        task_name: string;
        status: string;
        due_date: string | null;
        category: string;
      }>,
      chat: [] as Array<{
        id: string;
        message: string;
        full_message: string;
        sender: string;
        date: string;
        category: string;
      }>,
    };

    // Search transactions
    const { data: transactions } = await supabaseAdmin
      .from('money_trackers')
      .select('*, payment_methods(*)')
      .eq('user_id', userId)
      .or(`description.ilike.${searchPattern},type.ilike.${searchPattern}`)
      .order('created_at', { ascending: false })
      .limit(20);

    if (transactions && transactions.length > 0) {
      results.transactions = transactions.map(t => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        description: t.description,
        date: t.transaction_date || t.created_at,
        category: 'transaction',
        payment_method_id: t.payment_method_id,
        payment_method: t.payment_methods,
      }));
    }

    // Search tasks
    const { data: tasks } = await supabaseAdmin
      .from('todo_lists')
      .select('*')
      .eq('user_id', userId)
      .ilike('task_name', searchPattern)
      .order('created_at', { ascending: false })
      .limit(20);

    if (tasks && tasks.length > 0) {
      results.tasks = tasks.map(t => ({
        id: t.id,
        task_name: t.task_name,
        status: t.status,
        due_date: t.due_date,
        category: 'task',
      }));
    }

    // Search chat messages
    const { data: chatMessages } = await supabaseAdmin
      .from('app_chat_messages')
      .select('*')
      .eq('user_id', userId)
      .ilike('message', searchPattern)
      .order('created_at', { ascending: false })
      .limit(20);

    if (chatMessages && chatMessages.length > 0) {
      results.chat = chatMessages.map(m => ({
        id: m.id,
        message: m.message.length > 150 ? m.message.substring(0, 150) + '...' : m.message,
        full_message: m.message,
        sender: m.sender_id === userId ? 'user' : 'ai',
        date: m.created_at,
        category: 'chat',
      }));
    }

    // Calculate total results
    const totalResults =
      (results.transactions?.length || 0) +
      (results.tasks?.length || 0) +
      (results.chat?.length || 0);

    return NextResponse.json({
      query,
      total: totalResults,
      results,
    });
  } catch (err: any) {
    console.error('Search error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
