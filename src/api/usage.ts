import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  recordUsage,
  getUsageForPeriod,
  getCustomerByUserId,
} from '../lib/supabase-billing';
import { getBillingConfig, getTierById } from '../lib/config';

// ---------------------------------------------------------------------------
// Usage tracking API
// ---------------------------------------------------------------------------

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('[usage] Missing Supabase env vars');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// POST /api/billing/usage — record a usage event
// ---------------------------------------------------------------------------

export interface RecordUsageRequest {
  userId: string;
  eventName: string;
  quantity?: number;
  metadata?: Record<string, unknown>;
}

export async function recordUsageHandler(req: NextRequest) {
  try {
    const body = (await req.json()) as RecordUsageRequest;
    const { userId, eventName, quantity, metadata } = body;

    if (!userId || !eventName) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, eventName' },
        { status: 400 }
      );
    }

    const supabase = getServiceSupabase();
    const customer = await getCustomerByUserId(supabase, userId);

    if (!customer) {
      return NextResponse.json(
        { error: 'No billing customer found for this user' },
        { status: 404 }
      );
    }

    const record = await recordUsage(supabase, {
      customer_id: customer.id,
      event_name: eventName,
      quantity: quantity ?? 1,
      metadata: metadata ?? {},
    });

    return NextResponse.json({ recorded: true, record });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[usage] Error recording usage:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// GET /api/billing/usage?userId=...&eventName=... — get current usage
// ---------------------------------------------------------------------------

export async function getUsageHandler(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const eventName = searchParams.get('eventName') ?? 'api_call';

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId param' }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    const customer = await getCustomerByUserId(supabase, userId);

    if (!customer) {
      return NextResponse.json(
        { error: 'No billing customer found for this user' },
        { status: 404 }
      );
    }

    const totalUsage = await getUsageForPeriod(supabase, customer.id, eventName);

    // Look up the user's tier limit
    const config = getBillingConfig();
    // Determine tier from active subscription
    const { getActiveSubscription } = await import('../lib/supabase-billing');
    const sub = await getActiveSubscription(supabase, customer.id);
    const tierId = sub?.tier_id ?? 'free';
    const tier = getTierById(tierId);
    const limit = tier?.usageLimit ?? null;

    return NextResponse.json({
      usage: totalUsage,
      limit,
      remaining: limit !== null ? Math.max(0, limit - totalUsage) : null,
      tier: tierId,
      withinLimit: limit === null || totalUsage < limit,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[usage] Error getting usage:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Middleware helper: check usage before processing a request
// ---------------------------------------------------------------------------

export async function checkUsageLimit(
  userId: string,
  eventName: string = 'api_call'
): Promise<{ allowed: boolean; usage: number; limit: number | null; remaining: number | null }> {
  const supabase = getServiceSupabase();
  const customer = await getCustomerByUserId(supabase, userId);

  if (!customer) {
    return { allowed: false, usage: 0, limit: 0, remaining: 0 };
  }

  const totalUsage = await getUsageForPeriod(supabase, customer.id, eventName);
  const { getActiveSubscription } = await import('../lib/supabase-billing');
  const sub = await getActiveSubscription(supabase, customer.id);
  const tierId = sub?.tier_id ?? 'free';
  const tier = getTierById(tierId);
  const limit = tier?.usageLimit ?? null;

  return {
    allowed: limit === null || totalUsage < limit,
    usage: totalUsage,
    limit,
    remaining: limit !== null ? Math.max(0, limit - totalUsage) : null,
  };
}

// ---------------------------------------------------------------------------
// Next.js App Router export:
//
//   import { recordUsageHandler, getUsageHandler } from '@b-kub24/shared-stripe-billing/api/usage';
//   export const POST = recordUsageHandler;
//   export const GET = getUsageHandler;
// ---------------------------------------------------------------------------
