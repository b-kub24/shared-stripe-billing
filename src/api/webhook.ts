import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { constructWebhookEvent, getStripe } from '../lib/stripe';
import {
  upsertCustomer,
  upsertSubscription,
  createPurchase,
  getCustomerByStripeId,
} from '../lib/supabase-billing';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// POST /api/billing/webhook
// Handles all relevant Stripe webhook events.
// ---------------------------------------------------------------------------

/** Optional callbacks you can register for custom logic (e.g. sending emails) */
export interface WebhookCallbacks {
  onCheckoutComplete?: (session: Stripe.Checkout.Session, supabase: SupabaseClient) => Promise<void>;
  onSubscriptionCreated?: (sub: Stripe.Subscription, supabase: SupabaseClient) => Promise<void>;
  onSubscriptionUpdated?: (sub: Stripe.Subscription, supabase: SupabaseClient) => Promise<void>;
  onSubscriptionDeleted?: (sub: Stripe.Subscription, supabase: SupabaseClient) => Promise<void>;
  onInvoicePaid?: (invoice: Stripe.Invoice, supabase: SupabaseClient) => Promise<void>;
  onInvoicePaymentFailed?: (invoice: Stripe.Invoice, supabase: SupabaseClient) => Promise<void>;
  onPaymentIntentSucceeded?: (pi: Stripe.PaymentIntent, supabase: SupabaseClient) => Promise<void>;
}

let _callbacks: WebhookCallbacks = {};

/** Register callback hooks for webhook events */
export function registerWebhookCallbacks(cbs: WebhookCallbacks) {
  _callbacks = { ..._callbacks, ...cbs };
}

function getServiceSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('[webhook] Missing Supabase env vars');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleCheckoutComplete(
  session: Stripe.Checkout.Session,
  supabase: SupabaseClient
) {
  const userId = session.metadata?.supabase_user_id;
  const customerId = session.customer as string;

  if (userId && customerId) {
    await upsertCustomer(supabase, {
      user_id: userId,
      stripe_customer_id: customerId,
      email: session.customer_details?.email ?? session.customer_email ?? '',
      name: session.customer_details?.name,
    });
  }

  // Handle one-time payment
  if (session.mode === 'payment' && session.payment_intent) {
    const customer = await getCustomerByStripeId(supabase, customerId);
    if (customer) {
      await createPurchase(supabase, {
        customer_id: customer.id,
        stripe_payment_intent_id: session.payment_intent as string,
        stripe_price_id: null,
        product_id: session.metadata?.product_id ?? 'unknown',
        amount: session.amount_total ?? 0,
        currency: session.currency ?? 'usd',
        status: 'succeeded',
        metadata: session.metadata ?? {},
      });
    }
  }

  await _callbacks.onCheckoutComplete?.(session, supabase);
}

async function handleSubscriptionEvent(
  subscription: Stripe.Subscription,
  supabase: SupabaseClient,
  eventType: 'created' | 'updated' | 'deleted'
) {
  const customerId = subscription.customer as string;
  const customer = await getCustomerByStripeId(supabase, customerId);

  if (!customer) {
    console.warn(`[webhook] No customer found for Stripe ID: ${customerId}`);
    return;
  }

  const priceItem = subscription.items.data[0];
  const tierId = subscription.metadata?.tier_id ?? 'pro';

  const subStatus = eventType === 'deleted' ? 'canceled' : subscription.status;

  await upsertSubscription(supabase, {
    customer_id: customer.id,
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceItem?.price?.id ?? '',
    tier_id: tierId,
    status: subStatus as any,
    interval: priceItem?.price?.recurring?.interval === 'year' ? 'year' : 'month',
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end,
    canceled_at: subscription.canceled_at
      ? new Date(subscription.canceled_at * 1000).toISOString()
      : null,
    trial_start: subscription.trial_start
      ? new Date(subscription.trial_start * 1000).toISOString()
      : null,
    trial_end: subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null,
  });

  if (eventType === 'created') await _callbacks.onSubscriptionCreated?.(subscription, supabase);
  if (eventType === 'updated') await _callbacks.onSubscriptionUpdated?.(subscription, supabase);
  if (eventType === 'deleted') await _callbacks.onSubscriptionDeleted?.(subscription, supabase);
}

async function handleInvoicePaid(
  invoice: Stripe.Invoice,
  supabase: SupabaseClient
) {
  // Log the successful payment — useful for receipt emails
  console.log(
    `[webhook] Invoice paid: ${invoice.id} — $${(invoice.amount_paid / 100).toFixed(2)}`
  );
  await _callbacks.onInvoicePaid?.(invoice, supabase);
}

async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  supabase: SupabaseClient
) {
  console.error(
    `[webhook] Invoice payment failed: ${invoice.id} for customer ${invoice.customer}`
  );
  await _callbacks.onInvoicePaymentFailed?.(invoice, supabase);
}

// ---------------------------------------------------------------------------
// Main webhook handler
// ---------------------------------------------------------------------------

export async function createWebhookHandler(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 });
    }

    const event = constructWebhookEvent(body, signature);
    const supabase = getServiceSupabase();

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object as Stripe.Checkout.Session, supabase);
        break;

      case 'customer.subscription.created':
        await handleSubscriptionEvent(event.data.object as Stripe.Subscription, supabase, 'created');
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionEvent(event.data.object as Stripe.Subscription, supabase, 'updated');
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionEvent(event.data.object as Stripe.Subscription, supabase, 'deleted');
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaid(event.data.object as Stripe.Invoice, supabase);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice, supabase);
        break;

      default:
        console.log(`[webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[webhook] Error processing webhook:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// ---------------------------------------------------------------------------
// IMPORTANT: Disable body parsing for webhook route.
// In your app/api/billing/webhook/route.ts:
//
//   import { createWebhookHandler } from '@b-kub24/shared-stripe-billing/api/webhook';
//   export const POST = createWebhookHandler;
//   export const runtime = 'nodejs';
//   // Next.js App Router reads raw body automatically for route handlers
// ---------------------------------------------------------------------------
