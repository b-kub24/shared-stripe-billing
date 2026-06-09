import { NextRequest, NextResponse } from 'next/server';
import { getStripe, getOrCreateStripeCustomer } from '../lib/stripe';
import { getBillingConfig, getStripePriceId } from '../lib/config';

// ---------------------------------------------------------------------------
// POST /api/billing/checkout
// Creates a Stripe Checkout session for subscription or one-time purchase.
// ---------------------------------------------------------------------------

export interface CheckoutRequest {
  /** The tier to subscribe to (e.g. "pro", "enterprise") */
  tierId: string;
  /** Billing interval */
  interval: 'monthly' | 'annual';
  /** User's email */
  email: string;
  /** Supabase user ID — stored in Stripe customer metadata */
  userId: string;
  /** Optional: for one-time purchase, pass the price ID directly */
  priceId?: string;
  /** Optional: checkout mode — 'subscription' (default) or 'payment' */
  mode?: 'subscription' | 'payment';
  /** Optional: trial days */
  trialDays?: number;
  /** Optional: additional metadata */
  metadata?: Record<string, string>;
}

export async function createCheckoutHandler(req: NextRequest) {
  try {
    const body = (await req.json()) as CheckoutRequest;
    const { tierId, interval, email, userId, priceId, mode, trialDays, metadata } = body;

    if (!email || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields: email, userId' },
        { status: 400 }
      );
    }

    const config = getBillingConfig();
    const stripe = getStripe();

    // Resolve price ID
    const resolvedPriceId = priceId ?? getStripePriceId(tierId, interval);
    if (!resolvedPriceId) {
      return NextResponse.json(
        { error: `No Stripe price ID configured for tier "${tierId}" (${interval})` },
        { status: 400 }
      );
    }

    // Get or create Stripe customer
    const customer = await getOrCreateStripeCustomer(email, {
      supabase_user_id: userId,
      ...metadata,
    });

    // Build checkout session params
    const checkoutMode = mode ?? 'subscription';
    const sessionParams: Record<string, unknown> = {
      customer: customer.id,
      line_items: [{ price: resolvedPriceId, quantity: 1 }],
      mode: checkoutMode,
      success_url: `${config.appUrl}${config.successPath}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.appUrl}${config.cancelPath}`,
      metadata: {
        supabase_user_id: userId,
        tier_id: tierId,
        ...metadata,
      },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
    };

    // Add subscription-specific options
    if (checkoutMode === 'subscription') {
      if (trialDays && trialDays > 0) {
        (sessionParams as Record<string, unknown>).subscription_data = {
          trial_period_days: trialDays,
          metadata: {
            supabase_user_id: userId,
            tier_id: tierId,
          },
        };
      } else {
        (sessionParams as Record<string, unknown>).subscription_data = {
          metadata: {
            supabase_user_id: userId,
            tier_id: tierId,
          },
        };
      }
    }

    const session = await stripe.checkout.sessions.create(
      sessionParams as Parameters<typeof stripe.checkout.sessions.create>[0]
    );

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[checkout] Error creating checkout session:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Next.js App Router export
// Copy this into your app/api/billing/checkout/route.ts:
//
//   import { createCheckoutHandler } from '@b-kub24/shared-stripe-billing/api/checkout';
//   export const POST = createCheckoutHandler;
// ---------------------------------------------------------------------------
