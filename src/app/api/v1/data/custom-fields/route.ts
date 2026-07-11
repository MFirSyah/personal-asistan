/**
 * Custom Field Definitions API
 * Arsitektur Reference: Bagian 13.7, 22.2
 *
 * CRUD untuk definisi kolom dinamis (Notion-style)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/services/supabase';
import { verifyGatewayAndUser } from '@/lib/middleware/gateway';

// ============================================================================
// Schema Validation
// ============================================================================

const CreateFieldDefSchema = z.object({
  tableName: z.enum(['finance_records', 'activity_log', 'notifications_log']),
  fieldKey: z.string().min(1).max(50).regex(/^[a-z][a-z0-9_]*$/, 'Huruf kecil & underscore saja'),
  label: z.string().min(1).max(100),
  fieldType: z.enum(['text', 'number', 'select', 'boolean', 'date']),
  selectOptions: z.array(z.string()).optional(),
  inferable: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

const UpdateFieldDefSchema = CreateFieldDefSchema.partial();

// ============================================================================
// GET /api/v1/data/custom-fields - List field definitions
// ============================================================================

export async function GET(req: NextRequest) {
  const authResult = await verifyGatewayAndUser(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = authResult;

  try {
    const { searchParams } = new URL(req.url);
    const tableName = searchParams.get('table');

    let query = supabaseAdmin
      .from('custom_field_definitions')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (tableName) {
      query = query.eq('table_name', tableName);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch field definitions:', error);
      return NextResponse.json({ error: 'Failed to fetch field definitions' }, { status: 500 });
    }

    return NextResponse.json({ fields: data || [] });
  } catch (err: any) {
    console.error('Error fetching field definitions:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ============================================================================
// POST /api/v1/data/custom-fields - Create field definition
// ============================================================================

export async function POST(req: NextRequest) {
  const authResult = await verifyGatewayAndUser(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = authResult;

  try {
    const body = await req.json();
    const validation = CreateFieldDefSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({
        error: 'Invalid field definition',
        details: validation.error.flatten(),
      }, { status: 400 });
    }

    const fieldData = {
      user_id: userId,
      table_name: validation.data.tableName,
      field_key: validation.data.fieldKey,
      label: validation.data.label,
      field_type: validation.data.fieldType,
      select_options: validation.data.selectOptions || [],
      inferable: validation.data.inferable,
      sort_order: validation.data.sortOrder,
    };

    const { data, error } = await supabaseAdmin
      .from('custom_field_definitions')
      .insert(fieldData)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({
          error: 'Field with this key already exists',
        }, { status: 409 });
      }
      console.error('Failed to create field definition:', error);
      return NextResponse.json({ error: 'Failed to create field definition' }, { status: 500 });
    }

    return NextResponse.json({ field: data }, { status: 201 });
  } catch (err: any) {
    console.error('Error creating field definition:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
