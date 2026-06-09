# Shared Stripe Billing

> Drop-in Stripe billing for Next.js + Supabase. One module, 13+ products.

A production-ready, reusable billing package that gives any Next.js + Supabase project:

- **Stripe Checkout** — subscription & one-time payment sessions
- **Webhook Handler** — processes 6 critical Stripe events automatically
- **Pricing Page** — beautiful, responsive, configurable React component
- **Customer Portal** — Stripe-hosted subscription management
- **Supabase Integration** — tables, RLS policies, and helper functions
- **Feature Gating** — `<SubscriptionGate>` component + server-side middleware
- **Usage Tracking** — metered billing for API calls, generations, etc.
- **Extensible Callbacks** — hook into any webhook event for emails, analytics, etc.

---

## Quick Start (Under 10 Minutes)

### 1. Install

```bash
# From npm (if published)
npm install @b-kub24/shared-stripe-billing

# Or clone directly into your project
git clone https://github.com/b-kub24/shared-stripe-billing.git lib/billing
```

### 2. Environment Variables

Add these to your `.env.local`:

```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_APP_URL=https://yourapp.com
```

### 3. Run the SQL Migration

Copy `src/sql/migrations.sql` into your Supabase SQL editor and run it. This creates:

| Table                    | Purpose                          |
| ------------------------ | -------------------------------- |
| `billing_customers`      | Links Supabase users → Stripe    |
| `billing_subscriptions`  | Tracks subscription state        |
| `billing_purchases`      | One-time payment records         |
| `billing_usage`          | Metered usage tracking           |

Plus RLS policies, indexes, and helper functions.

### 4. Configure Your Tiers

Create `lib/billing-config.ts` in your project:

```typescript
import { createBillingConfig } from '@b-kub24/shared-stripe-billing';

export const billingConfig = createBillingConfig({
  appUrl: process.env.NEXT_PUBLIC_APP_URL!,
  successPath: '/billing?success=true',
  cancelPath: '/pricing?canceled=true',
  billingPath: '/billing',
  enableUsageTracking: true,
  tiers: [
    {
      id: 'free',
      name: 'Free',
      description: 'Get started for free',
      monthlyPrice: 0,
      annualPrice: 0,
      stripePriceIdMonthly: null,
      stripePriceIdAnnual: null,
      features: [
        { text: '100 requests/month', included: true },
        { text: 'Basic support', included: true },
        { text: 'API access', included: false },
      ],
      cta: 'Get Started',
      usageLimit: 100,
      order: 0,
    },
    {
      id: 'pro',
      name: 'Pro',
      description: 'For power users',
      monthlyPrice: 2900, // $29.00
      annualPrice: 29000, // $290.00
      stripePriceIdMonthly: 'price_xxx_monthly',  // ← from Stripe Dashboard
      stripePriceIdAnnual: 'price_xxx_annual',     // ← from Stripe Dashboard
      features: [
        { text: '10,000 requests/month', included: true },
        { text: 'Priority support', included: true },
        { text: 'API access', included: true },
      ],
      highlighted: true,
      cta: 'Upgrade to Pro',
      usageLimit: 10000,
      order: 1,
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      description: 'Custom solutions',
      monthlyPrice: 9900, // $99.00
      annualPrice: 99000, // $990.00
      stripePriceIdMonthly: 'price_yyy_monthly',
      stripePriceIdAnnual: 'price_yyy_annual',
      features: [
        { text: 'Unlimited requests', included: true },
        { text: 'Dedicated support', included: true },
        { text: 'API access', included: true },
      ],
      cta: 'Go Enterprise',
      usageLimit: null, // unlimited
      order: 2,
    },
  ],
});
```

### 5. Create API Routes

Create these files in your Next.js app:

**`app/api/billing/checkout/route.ts`**
```typescript
import { createCheckoutHandler } from '@b-kub24/shared-stripe-billing/api/checkout';
import '@/lib/billing-config'; // ensure config is loaded
export const POST = createCheckoutHandler;
```

**`app/api/billing/webhook/route.ts`**
```typescript
import { createWebhookHandler, registerWebhookCallbacks } from '@b-kub24/shared-stripe-billing/api/webhook';
import '@/lib/billing-config';

// Optional: register callbacks for custom logic
registerWebhookCallbacks({
  onInvoicePaid: async (invoice, supabase) => {
    // Send receipt email, update analytics, etc.
    console.log(`Payment received: $${(invoice.amount_paid / 100).toFixed(2)}`);
  },
  onSubscriptionDeleted: async (sub, supabase) => {
    // Handle churn — send win-back email, etc.
    console.log(`Subscription canceled: ${sub.id}`);
  },
});

export const POST = createWebhookHandler;
```

**`app/api/billing/portal/route.ts`**
```typescript
import { createPortalHandler } from '@b-kub24/shared-stripe-billing/api/portal';
import '@/lib/billing-config';
export const POST = createPortalHandler;
```

**`app/api/billing/usage/route.ts`**
```typescript
import { recordUsageHandler, getUsageHandler } from '@b-kub24/shared-stripe-billing/api/usage';
import '@/lib/billing-config';
export const POST = recordUsageHandler;
export const GET = getUsageHandler;
```

### 6. Add the Pricing Page

```tsx
'use client';

import { PricingPage } from '@b-kub24/shared-stripe-billing/components/PricingPage';
import { getBillingConfig } from '@b-kub24/shared-stripe-billing/lib/config';
import { useRouter } from 'next/navigation';

export default function PricingRoute() {
  const router = useRouter();
  const config = getBillingConfig();

  const handleSelectTier = async (tierId: string, interval: 'monthly' | 'annual') => {
    if (tierId === 'free') return;

    const res = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tierId,
        interval,
        email: 'user@example.com',   // ← from your auth context
        userId: 'supabase-user-id',   // ← from your auth context
      }),
    });

    const { url } = await res.json();
    if (url) window.location.href = url;
  };

  return (
    <PricingPage
      tiers={config.tiers}
      onSelectTier={handleSelectTier}
      currentTierId="free" // ← from your user's subscription
    />
  );
}
```

### 7. Gate Features

```tsx
import { SubscriptionGate } from '@b-kub24/shared-stripe-billing/components/SubscriptionGate';

export default function ProFeature({ userTier }: { userTier: string }) {
  return (
    <SubscriptionGate
      requiredTier="pro"
      currentTier={userTier}
      onUpgrade={() => window.location.href = '/pricing'}
    >
      <div>This content is only visible to Pro users and above.</div>
    </SubscriptionGate>
  );
}
```

Server-side gating in API routes:

```typescript
import { checkTierAccess } from '@b-kub24/shared-stripe-billing/components/SubscriptionGate';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: Request) {
  const supabase = createClient(/* ... */);
  const userId = /* get from auth */;

  if (!await checkTierAccess(supabase, userId, 'pro')) {
    return Response.json({ error: 'Pro plan required' }, { status: 403 });
  }

  // ... pro-only logic
}
```

### 8. Track Usage

```typescript
import { checkUsageLimit } from '@b-kub24/shared-stripe-billing/api/usage';
import { recordUsage, getCustomerByUserId } from '@b-kub24/shared-stripe-billing/lib/supabase-billing';

// In your API route:
export async function POST(req: Request) {
  const userId = /* from auth */;

  // Check if user is within their limit
  const { allowed, remaining } = await checkUsageLimit(userId, 'api_call');
  if (!allowed) {
    return Response.json({ error: 'Usage limit reached. Please upgrade.' }, { status: 429 });
  }

  // Do the work...
  const result = await doExpensiveOperation();

  // Record the usage
  const customer = await getCustomerByUserId(supabase, userId);
  if (customer) {
    await recordUsage(supabase, {
      customer_id: customer.id,
      event_name: 'api_call',
    });
  }

  return Response.json(result);
}
```

### 9. Set Up Stripe Webhook

```bash
# Local development
stripe listen --forward-to localhost:3000/api/billing/webhook

# Production: Add the webhook endpoint in Stripe Dashboard
# URL: https://yourapp.com/api/billing/webhook
# Events: checkout.session.completed, customer.subscription.created,
#          customer.subscription.updated, customer.subscription.deleted,
#          invoice.payment_succeeded, invoice.payment_failed
```

---

## Architecture

```
Your Next.js App
├── app/api/billing/
│   ├── checkout/route.ts    → import { createCheckoutHandler }
│   ├── webhook/route.ts     → import { createWebhookHandler }
│   ├── portal/route.ts      → import { createPortalHandler }
│   └── usage/route.ts       → import { recordUsageHandler, getUsageHandler }
├── app/pricing/page.tsx     → <PricingPage />
├── app/billing/page.tsx     → <BillingDashboard />
├── components/
│   └── ProFeature.tsx       → <SubscriptionGate />
└── lib/
    └── billing-config.ts    → createBillingConfig({ ... })
```

**Data flow:**

1. User clicks "Upgrade" → `createCheckoutHandler` → Stripe Checkout
2. Payment succeeds → Stripe webhook → `createWebhookHandler` → Supabase tables updated
3. App queries `getUserTier()` or `<SubscriptionGate>` → gates features
4. User clicks "Manage" → `createPortalHandler` → Stripe Customer Portal

---

## API Reference

### Config

| Function              | Description                                 |
| --------------------- | ------------------------------------------- |
| `createBillingConfig` | Set up pricing tiers and app settings       |
| `getBillingConfig`    | Read the current config                     |
| `getTierById`         | Look up a tier by ID                        |
| `getStripePriceId`    | Get Stripe price ID for tier + interval     |
| `formatPrice`         | Format cents → display string               |

### Stripe Helpers

| Function                    | Description                            |
| --------------------------- | -------------------------------------- |
| `getStripe`                 | Get Stripe client singleton            |
| `getOrCreateStripeCustomer` | Find or create a Stripe customer       |
| `getSubscription`           | Retrieve a subscription by ID          |
| `cancelSubscription`        | Cancel at period end                   |
| `resumeSubscription`        | Undo a pending cancellation            |

### Supabase Queries

| Function                     | Description                            |
| ---------------------------- | -------------------------------------- |
| `getUserTier`                | Get user's current tier (or 'free')    |
| `hasAccess`                  | Check if user meets a tier requirement |
| `getCustomerByUserId`        | Look up billing customer               |
| `getActiveSubscription`      | Get active/trialing subscription       |
| `recordUsage`                | Log a usage event                      |
| `getUsageForPeriod`          | Sum usage for current month            |

### Components

| Component           | Description                                      |
| ------------------- | ------------------------------------------------ |
| `<PricingPage>`     | Full pricing page with tier cards + annual toggle |
| `<SubscriptionGate>`| Paywall wrapper with upgrade prompt               |
| `<BillingDashboard>`| Current plan, usage, and manage button            |

### Webhook Callbacks

```typescript
registerWebhookCallbacks({
  onCheckoutComplete: async (session, supabase) => { /* ... */ },
  onSubscriptionCreated: async (sub, supabase) => { /* ... */ },
  onSubscriptionUpdated: async (sub, supabase) => { /* ... */ },
  onSubscriptionDeleted: async (sub, supabase) => { /* ... */ },
  onInvoicePaid: async (invoice, supabase) => { /* email receipt */ },
  onInvoicePaymentFailed: async (invoice, supabase) => { /* alert user */ },
});
```

---

## File Structure

```
shared-stripe-billing/
├── README.md
├── package.json
├── tsconfig.json
├── next.config.js
├── .env.example
├── .gitignore
└── src/
    ├── index.ts                     # Barrel exports
    ├── api/
    │   ├── checkout.ts              # Stripe Checkout session creation
    │   ├── webhook.ts               # Stripe webhook handler (6 events)
    │   ├── portal.ts                # Customer portal session
    │   └── usage.ts                 # Usage tracking + limits
    ├── components/
    │   ├── PricingPage.tsx           # Pricing UI with toggle
    │   ├── SubscriptionGate.tsx      # Feature gating wrapper
    │   └── BillingDashboard.tsx      # Billing overview for users
    ├── lib/
    │   ├── stripe.ts                # Stripe client + helpers
    │   ├── config.ts                # Pricing tier configuration
    │   └── supabase-billing.ts      # Database queries + types
    └── sql/
        └── migrations.sql           # Supabase schema + RLS
```

---

## Recipes

### Send Email Receipts

```typescript
// In your webhook route:
registerWebhookCallbacks({
  onInvoicePaid: async (invoice, supabase) => {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'billing@yourapp.com',
        to: invoice.customer_email,
        subject: `Payment receipt — $${(invoice.amount_paid / 100).toFixed(2)}`,
        html: `<p>Thank you for your payment of $${(invoice.amount_paid / 100).toFixed(2)}.</p>`,
      }),
    });
  },
});
```

### Middleware-Based Feature Gating

```typescript
// middleware.ts
import { createClient } from '@supabase/supabase-js';
import { getUserTier } from '@b-kub24/shared-stripe-billing';
import { NextResponse } from 'next/server';

export async function middleware(req: Request) {
  const supabase = createClient(/* ... */);
  const userId = /* extract from session */;
  const tier = await getUserTier(supabase, userId);

  if (req.url.includes('/pro-feature') && tier === 'free') {
    return NextResponse.redirect(new URL('/pricing', req.url));
  }

  return NextResponse.next();
}
```

---

## License

MIT
