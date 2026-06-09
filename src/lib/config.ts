// ---------------------------------------------------------------------------
// Pricing tier configuration
// ---------------------------------------------------------------------------
// Define your pricing tiers here. This is the single source of truth used by
// the PricingPage component, checkout route, and subscription gate middleware.
// ---------------------------------------------------------------------------

export interface PricingFeature {
  text: string;
  included: boolean;
}

export interface PricingTier {
  /** Internal identifier (e.g. "free", "pro", "enterprise") */
  id: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Monthly price in cents (0 for free) */
  monthlyPrice: number;
  /** Annual price in cents (0 for free) */
  annualPrice: number;
  /** Stripe price ID for monthly billing */
  stripePriceIdMonthly: string | null;
  /** Stripe price ID for annual billing */
  stripePriceIdAnnual: string | null;
  /** Feature list for the pricing card */
  features: PricingFeature[];
  /** Show as "most popular" */
  highlighted?: boolean;
  /** CTA button text */
  cta?: string;
  /** Max usage units per period (for metered billing) — null = unlimited */
  usageLimit?: number | null;
  /** Sort order */
  order: number;
}

export interface BillingConfig {
  /** All pricing tiers */
  tiers: PricingTier[];
  /** Your app's public URL */
  appUrl: string;
  /** Route users return to after checkout */
  successPath: string;
  /** Route users return to if they cancel checkout */
  cancelPath: string;
  /** Route for the billing/account page */
  billingPath: string;
  /** Enable usage-based metering */
  enableUsageTracking: boolean;
  /** Table name prefix in Supabase (default: "billing") */
  tablePrefix: string;
  /** Stripe customer portal configuration ID (optional) */
  portalConfigId?: string;
}

// ---------------------------------------------------------------------------
// Default config — override via createBillingConfig()
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: BillingConfig = {
  tiers: [
    {
      id: 'free',
      name: 'Free',
      description: 'Get started with basic features',
      monthlyPrice: 0,
      annualPrice: 0,
      stripePriceIdMonthly: null,
      stripePriceIdAnnual: null,
      features: [
        { text: '100 requests/month', included: true },
        { text: 'Basic support', included: true },
        { text: 'API access', included: false },
        { text: 'Priority support', included: false },
        { text: 'Custom integrations', included: false },
      ],
      cta: 'Get Started',
      usageLimit: 100,
      order: 0,
    },
    {
      id: 'pro',
      name: 'Pro',
      description: 'For professionals and growing teams',
      monthlyPrice: 2900,
      annualPrice: 29000,
      stripePriceIdMonthly: null,
      stripePriceIdAnnual: null,
      features: [
        { text: '10,000 requests/month', included: true },
        { text: 'Priority support', included: true },
        { text: 'API access', included: true },
        { text: 'Advanced analytics', included: true },
        { text: 'Custom integrations', included: false },
      ],
      highlighted: true,
      cta: 'Upgrade to Pro',
      usageLimit: 10000,
      order: 1,
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      description: 'For large organizations with custom needs',
      monthlyPrice: 9900,
      annualPrice: 99000,
      stripePriceIdMonthly: null,
      stripePriceIdAnnual: null,
      features: [
        { text: 'Unlimited requests', included: true },
        { text: 'Dedicated support', included: true },
        { text: 'API access', included: true },
        { text: 'Advanced analytics', included: true },
        { text: 'Custom integrations', included: true },
      ],
      cta: 'Contact Sales',
      usageLimit: null,
      order: 2,
    },
  ],
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  successPath: '/billing?success=true',
  cancelPath: '/billing?canceled=true',
  billingPath: '/billing',
  enableUsageTracking: true,
  tablePrefix: 'billing',
  portalConfigId: undefined,
};

let _config: BillingConfig = { ...DEFAULT_CONFIG };

/** Merge partial overrides into the billing configuration */
export function createBillingConfig(
  overrides: Partial<BillingConfig> & { tiers?: PricingTier[] }
): BillingConfig {
  _config = {
    ...DEFAULT_CONFIG,
    ...overrides,
    tiers: overrides.tiers ?? DEFAULT_CONFIG.tiers,
  };
  return _config;
}

/** Read the current billing configuration */
export function getBillingConfig(): BillingConfig {
  return _config;
}

/** Look up a tier by its id */
export function getTierById(tierId: string): PricingTier | undefined {
  return _config.tiers.find((t) => t.id === tierId);
}

/** Get the Stripe price ID for a tier + interval */
export function getStripePriceId(
  tierId: string,
  interval: 'monthly' | 'annual'
): string | null {
  const tier = getTierById(tierId);
  if (!tier) return null;
  return interval === 'annual'
    ? tier.stripePriceIdAnnual
    : tier.stripePriceIdMonthly;
}

/** Format cents to a display-friendly currency string */
export function formatPrice(
  cents: number,
  currency = 'USD',
  locale = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
