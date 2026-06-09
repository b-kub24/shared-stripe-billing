import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '../lib/stripe';
import { getBillingConfig } from '../lib/config';

// ---------------------------------------------------------------------------
// POST /api/billing/portal
// Creates a Stripe Customer Portal session so users can manage their
// subscription, update payment methods, view invoices, and cancel.
// ---------------------------------------------------------------------------

export interface PortalRequest {
  /** Stripe customer ID */
  stripeCustomerId: string;
  /** Optional: URL to return to after the portal session */
  returnUrl?: string;
}

export async function createPortalHandler(req: NextRequest) {
  try {
    const body = (await req.json()) as PortalRequest;
    const { stripeCustomerId, returnUrl } = body;

    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: 'Missing stripeCustomerId' },
        { status: 400 }
      );
    }

    const config = getBillingConfig();
    const stripe = getStripe();

    const sessionParams: Record<string, unknown> = {
      customer: stripeCustomerId,
      return_url: returnUrl ?? `${config.appUrl}${config.billingPath}`,
    };

    // Optionally use a pre-configured portal
    if (config.portalConfigId) {
      sessionParams.configuration = config.portalConfigId;
    }

    const session = await stripe.billingPortal.sessions.create(
      sessionParams as Parameters<typeof stripe.billingPortal.sessions.create>[0]
    );

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[portal] Error creating portal session:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Next.js App Router export:
//
//   import { createPortalHandler } from '@b-kub24/shared-stripe-billing/api/portal';
//   export const POST = createPortalHandler;
// ---------------------------------------------------------------------------
