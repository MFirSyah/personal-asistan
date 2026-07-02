import { NextRequest, NextResponse } from 'next/server';
import { verifyGatewayAndUser } from '@/lib/middleware/gateway';
import { supabaseAdmin } from '@/lib/services/supabase';

// Security headers
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
};

// CORS headers for dashboard
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Schema cache (5 minutes)
let schemaCache: { data: any; timestamp: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function GET(req: NextRequest) {
  // Skip auth for public schema (for initial dashboard load)
  const authHeader = req.headers.get('Authorization');
  let userId: string | null = null;

  if (authHeader) {
    const authResult = await verifyGatewayAndUser(req);
    if (!(authResult instanceof NextResponse)) {
      userId = authResult.userId;
    }
  }

  try {
    const { searchParams } = new URL(req.url);
    const tableName = searchParams.get('table');
    const refresh = searchParams.get('refresh') === 'true';

    // Check cache (only for full schema, not specific table)
    if (!tableName && !refresh && schemaCache && Date.now() - schemaCache.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({
        ...schemaCache.data,
        cached: true,
        cached_at: new Date(schemaCache.timestamp).toISOString()
      }, { headers: { ...securityHeaders, ...corsHeaders } });
    }

    // Build schema response
    let schemaData: any;

    if (tableName) {
      // Get specific table schema using database function
      const { data, error } = await supabaseAdmin.rpc('get_schema_info', {
        p_table_name: tableName
      });

      if (error) {
        return NextResponse.json(
          { error: 'Failed to get table schema' },
          { status: 500, headers: securityHeaders }
        );
      }

      schemaData = data;
    } else {
      // Get all tables schema
      const { data, error } = await supabaseAdmin.rpc('get_schema_info', {
        p_table_name: null
      });

      if (error) {
        return NextResponse.json(
          { error: 'Failed to get schema' },
          { status: 500, headers: securityHeaders }
        );
      }

      schemaData = data;
    }

    // Enrich with additional metadata
    const enrichedData = enrichSchemaData(schemaData, userId);

    // Update cache for full schema
    if (!tableName) {
      schemaCache = {
        data: enrichedData,
        timestamp: Date.now()
      };
    }

    return NextResponse.json({
      ...enrichedData,
      cached: false,
      generated_at: new Date().toISOString()
    }, { headers: { ...securityHeaders, ...corsHeaders } });

  } catch (err: any) {
    console.error('Schema API error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// OPTIONS for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

function enrichSchemaData(data: any, userId: string | null) {
  // Add human-readable descriptions and UI hints
  const tableMetadata: Record<string, any> = {
    money_trackers: {
      name: '💰 Transaksi',
      description: 'Catatan pemasukan dan pengeluaran',
      icon: '💰',
      color: '#4CAF50',
      commonActions: ['view', 'filter', 'chart'],
      fields: {
        amount: { label: 'Jumlah', type: 'currency' },
        type: { label: 'Jenis', type: 'badge' },
        description: { label: 'Keterangan', type: 'text' },
        transaction_date: { label: 'Tanggal', type: 'date' },
        payment_method_id: { label: 'Metode Bayar', type: 'reference' }
      }
    },
    todo_lists: {
      name: '✅ Tugas',
      description: 'Daftar tugas dan todo',
      icon: '✅',
      color: '#2196F3',
      commonActions: ['view', 'filter', 'sort'],
      fields: {
        task_name: { label: 'Nama Tugas', type: 'text' },
        status: { label: 'Status', type: 'badge' },
        due_date: { label: 'Batas Waktu', type: 'date' }
      }
    },
    user_profiles: {
      name: '👤 Profil',
      description: 'Informasi profil pengguna',
      icon: '👤',
      color: '#9C27B0',
      commonActions: ['view', 'edit'],
      fields: {
        fullname: { label: 'Nama Lengkap', type: 'text' },
        assistant_name: { label: 'Nama AI', type: 'text' },
        user_nickname: { label: 'Panggilan', type: 'text' }
      }
    },
    payment_methods: {
      name: '💳 Metode Bayar',
      description: 'Sumber dana transaksi',
      icon: '💳',
      color: '#FF9800',
      commonActions: ['view'],
      fields: {
        name: { label: 'Nama', type: 'text' },
        category: { label: 'Kategori', type: 'badge' },
        icon: { label: 'Icon', type: 'emoji' },
        color: { label: 'Warna', type: 'color' }
      }
    },
    app_chat_messages: {
      name: '💬 Pesan',
      description: 'Riwayat percakapan',
      icon: '💬',
      color: '#607D8B',
      commonActions: ['view', 'search'],
      fields: {
        message: { label: 'Pesan', type: 'text' },
        sender_personality_id: { label: 'Pengirim', type: 'badge' },
        created_at: { label: 'Waktu', type: 'datetime' }
      }
    },
    chat_preferences: {
      name: '⚙️ Preferensi',
      description: 'Pengaturan chat AI',
      icon: '⚙️',
      color: '#E91E63',
      commonActions: ['view', 'edit'],
      fields: {
        communication_style: { label: 'Gaya Bahasa', type: 'text' },
        prefers_emoji: { label: 'Pakai Emoji', type: 'boolean' },
        prefers_lists: { label: 'Pakai List', type: 'boolean' }
      }
    }
  };

  // Add metadata to each table
  if (data.tables && Array.isArray(data.tables)) {
    data.tables = data.tables.map((table: any) => ({
      ...table,
      metadata: tableMetadata[table.table_name] || {
        name: table.table_name,
        description: '',
        icon: '📊',
        color: '#6B7280',
        commonActions: ['view'],
        fields: {}
      }
    }));
  }

  return data;
}
