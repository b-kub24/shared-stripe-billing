import { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types for the billing tables
// ---------------------------------------------------------------------------

export interface BillingCustomer {
  id: string;
  user_id: string;
  stripe_customer_id: string;
  email: string;
  name: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillingSubscription {
  id: string;
  customer_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string;
  tier_id: string;
  status: SubscriptionStatus;
  interval: 'month' | 'year';
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  trial_start: string | null;
  trial_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillingPurchase {
  id: string;
  customer_id: string;
  stripe_payment_intent_id: string;
  stripe_price_id: string | null;
  product_id: string;
  amount: number;
  currency: string;
  status: 'succeeded' | 'pending' | 'failed' | 'refunded';
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface UsageRecord {
  id: string;
  customer_id: string;
  event_name: string;
  quantity: number;
  metadata: Record<string, unknown>;
  period_start: string;
  period_end: string;
  created_at: string;
}

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused';

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * All query functions accept a Supabase client (server or browser) so they
 * work with both service-role and user-scoped RLS contexts.
 */

// ---- Customers ----

export async function getCustomerByUserId(
  supabase: SupabaseClient,
  userId: string
): Promise<BillingCustomer | null> {
  const { data, error } = await supabase
    .from('billing_customers')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getCustomerByStripeId(
  supabase: SupabaseClient,
  stripeCustomerId: string
): Promise<BillingCustomer | null> {
  const { data, error } = await supabase
    .from('billing_customers')
    .select('*')
    .eq('stripe_customer_id', stripeCustomerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertCustomer(
  supabase: SupabaseClient,
  customer: {
    user_id: string;
    stripe_customer_id: string;
    email: string;
    name?: string | null;
  }
): Promise<BillingCustomer> {
  const { data, error } = await supabase
    .from('billing_customers')
    .upsert(
      {
        user_id: customer.user_id,
        stripe_customer_id: customer.stripe_customer_id,
        email: customer.email,
        name: customer.name ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---- Subscriptions ----

export async function getActiveSubscription(
  supabase: SupabaseClient,
  customerId: string
): Promise<BillingSubscription | null> {
  const { data, error } = await supabase
    .from('billing_subscriptions')
    .select('*')
    .eq('customer_id', customerId)
    .in('status', ['active', 'trialing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getSubscriptionByStripeId(
  supabase: SupabaseClient,
  stripeSubscriptionId: string
): Promise<BillingSubscription | null> {
  const { data, error } = await supabase
    .from('billing_subscriptions')
    .select('*')
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertSubscription(
  supabase: SupabaseClient,
  sub: Omit<BillingSubscription, 'id' | 'created_at' | 'updated_at'>
): Promise<BillingSubscription> {
  const { data, error } = await supabase
    .from('billing_subscriptions')
    .upsert(
      {
        ...sub,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'stripe_subscription_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---- One-time purchases ----

export async function createPurchase(
  supabase: SupabaseClient,
  purchase: Omit<BillingPurchase, 'id' | 'created_at'>
): Promise<BillingPurchase> {
  const { data, error } = await supabase
    .from('billing_purchases')
    .insert(purchase)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getPurchasesByCustomer(
  supabase: SupabaseClient,
  customerId: string
): Promise<BillingPurchase[]> {
  const { data, error } = await supabase
    .from('billing_purchases')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ---- Usage tracking ----

export async function recordUsage(
  supabase: SupabaseClient,
  record: {
    customer_id: string;
    event_name: string;
    quantity?: number;
    metadata?: Record<string, unknown>;
  }
): Promise<UsageRecord> {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const { data, error } = await supabase
    .from('billing_usage')
    .insert({
      customer_id: record.customer_id,
      event_name: record.event_name,
      quantity: record.quantity ?? 1,
      metadata: record.metadata ?? {},
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getUsageForPeriod(
  supabase: SupabaseClient,
  customerId: string,
  eventName: string,
  periodStart?: Date,
  periodEnd?: Date
): Promise<number> {
  const now = new Date();
  const start = periodStart ?? new Date(now.getFullYear(), now.getMonth(), 1);
  const end = periodEnd ?? new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const { data, error } = await supabase
    .from('billing_usage')
    .select('quantity')
    .eq('customer_id', customerId)
    .eq('event_name', eventName)
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString());

  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + (row.quantity ?? 0), 0);
}

// ---- User tier helpers ----

/**
 * Gets the current tier for a user. Returns 'free' if no active subscription.
 * This is the primary function you'll use to gate features.
 */
export async function getUserTier(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const customer = await getCustomerByUserId(supabase, userId);
  if (!customer) return 'free';
  const sub = await getActiveSubscription(supabase, customer.id);
  return sub?.tier_id ?? 'free';
}

/**
 * Check if a user has access to a given tier (their tier >= required tier).
 * Tier order is determined by the tiers array in config.
 */
export async function hasAccess(
  supabase: SupabaseClient,
  userId: string,
  requiredTier: string,
  tierOrder: string[] = ['free', 'pro', 'enterprise']
): Promise<boolean> {
  const userTier = await getUserTier(supabase, userId);
  const userIndex = tierOrder.indexOf(userTier);
  const requiredIndex = tierOrder.indexOf(requiredTier);
  if (userIndex === -1 || requiredIndex === -1) return false;
  return userIndex >= requiredIndex;
}
