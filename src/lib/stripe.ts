import Stripe from 'stripe';

// ---------------------------------------------------------------------------
// Stripe client singleton
// ---------------------------------------------------------------------------

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error(
        '[shared-stripe-billing] Missing STRIPE_SECRET_KEY environment variable.'
      );
    }
    stripeInstance = new Stripe(key, {
      apiVersion: '2024-06-20',
      typescript: true,
    });
  }
  return stripeInstance;
}

// ---------------------------------------------------------------------------
// Webhook signature verification
// ---------------------------------------------------------------------------

export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string,
  webhookSecret?: string
): Stripe.Event {
  const stripe = getStripe();
  const secret = webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      '[shared-stripe-billing] Missing STRIPE_WEBHOOK_SECRET environment variable.'
    );
  }
  return stripe.webhooks.constructEvent(payload, signature, secret);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Retrieve or create a Stripe customer for a given user */
export async function getOrCreateStripeCustomer(
  email: string,
  metadata?: Record<string, string>
): Promise<Stripe.Customer> {
  const stripe = getStripe();

  // Search for existing customer by email
  const existing = await stripe.customers.list({ email, limit: 1 });
  if (existing.data.length > 0) {
    return existing.data[0];
  }

  // Create new customer
  return stripe.customers.create({
    email,
    metadata: metadata ?? {},
  });
}

/** Retrieve a Stripe subscription by ID */
export async function getSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  return stripe.subscriptions.retrieve(subscriptionId);
}

/** Cancel a subscription at period end */
export async function cancelSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
}

/** Resume a subscription that was set to cancel */
export async function resumeSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: false,
  });
}
