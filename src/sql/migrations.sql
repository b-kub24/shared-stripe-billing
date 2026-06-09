-- ============================================================================
-- Shared Stripe Billing — Supabase Migration
-- ============================================================================
-- Run this in the Supabase SQL editor or via `supabase db push`.
-- Creates: billing_customers, billing_subscriptions, billing_purchases,
--          billing_usage tables with Row Level Security policies.
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --------------------------------------------------------------------------
-- 1. billing_customers
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_customers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL,
  name          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_customers_user_id
  ON public.billing_customers(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_customers_stripe_id
  ON public.billing_customers(stripe_customer_id);

ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;

-- Users can read their own customer record
CREATE POLICY "Users can view own customer record"
  ON public.billing_customers FOR SELECT
  USING (auth.uid() = user_id);

-- Only service role can insert/update (webhook handler)
CREATE POLICY "Service role manages customers"
  ON public.billing_customers FOR ALL
  USING (auth.role() = 'service_role');

-- --------------------------------------------------------------------------
-- 2. billing_subscriptions
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id             UUID NOT NULL REFERENCES public.billing_customers(id) ON DELETE CASCADE,
  stripe_subscription_id  TEXT NOT NULL UNIQUE,
  stripe_price_id         TEXT NOT NULL,
  tier_id                 TEXT NOT NULL DEFAULT 'free',
  status                  TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','trialing','past_due','canceled','unpaid','incomplete','incomplete_expired','paused')),
  "interval"              TEXT NOT NULL DEFAULT 'month' CHECK ("interval" IN ('month','year')),
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  cancel_at_period_end    BOOLEAN NOT NULL DEFAULT false,
  canceled_at             TIMESTAMPTZ,
  trial_start             TIMESTAMPTZ,
  trial_end               TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_subs_customer
  ON public.billing_subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_billing_subs_stripe_id
  ON public.billing_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_billing_subs_status
  ON public.billing_subscriptions(status);

ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own subscriptions
CREATE POLICY "Users can view own subscriptions"
  ON public.billing_subscriptions FOR SELECT
  USING (
    customer_id IN (
      SELECT id FROM public.billing_customers WHERE user_id = auth.uid()
    )
  );

-- Service role manages subscriptions
CREATE POLICY "Service role manages subscriptions"
  ON public.billing_subscriptions FOR ALL
  USING (auth.role() = 'service_role');

-- --------------------------------------------------------------------------
-- 3. billing_purchases (one-time payments)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_purchases (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id               UUID NOT NULL REFERENCES public.billing_customers(id) ON DELETE CASCADE,
  stripe_payment_intent_id  TEXT NOT NULL UNIQUE,
  stripe_price_id           TEXT,
  product_id                TEXT NOT NULL,
  amount                    INTEGER NOT NULL,
  currency                  TEXT NOT NULL DEFAULT 'usd',
  status                    TEXT NOT NULL DEFAULT 'succeeded'
    CHECK (status IN ('succeeded','pending','failed','refunded')),
  metadata                  JSONB NOT NULL DEFAULT '{}',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_purchases_customer
  ON public.billing_purchases(customer_id);

ALTER TABLE public.billing_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own purchases"
  ON public.billing_purchases FOR SELECT
  USING (
    customer_id IN (
      SELECT id FROM public.billing_customers WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role manages purchases"
  ON public.billing_purchases FOR ALL
  USING (auth.role() = 'service_role');

-- --------------------------------------------------------------------------
-- 4. billing_usage (metered billing / usage tracking)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_usage (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id   UUID NOT NULL REFERENCES public.billing_customers(id) ON DELETE CASCADE,
  event_name    TEXT NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 1,
  metadata      JSONB NOT NULL DEFAULT '{}',
  period_start  TIMESTAMPTZ NOT NULL,
  period_end    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_usage_customer
  ON public.billing_usage(customer_id);
CREATE INDEX IF NOT EXISTS idx_billing_usage_event
  ON public.billing_usage(event_name);
CREATE INDEX IF NOT EXISTS idx_billing_usage_period
  ON public.billing_usage(period_start, period_end);

ALTER TABLE public.billing_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage"
  ON public.billing_usage FOR SELECT
  USING (
    customer_id IN (
      SELECT id FROM public.billing_customers WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role manages usage"
  ON public.billing_usage FOR ALL
  USING (auth.role() = 'service_role');

-- --------------------------------------------------------------------------
-- 5. Helper function: get user tier
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_tier(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tier TEXT;
BEGIN
  SELECT s.tier_id INTO v_tier
  FROM public.billing_subscriptions s
  JOIN public.billing_customers c ON c.id = s.customer_id
  WHERE c.user_id = p_user_id
    AND s.status IN ('active', 'trialing')
  ORDER BY s.created_at DESC
  LIMIT 1;

  RETURN COALESCE(v_tier, 'free');
END;
$$;

-- --------------------------------------------------------------------------
-- 6. Helper function: check usage against limit
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_usage_limit(
  p_user_id UUID,
  p_event_name TEXT,
  p_limit INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total INTEGER;
  v_period_start TIMESTAMPTZ;
BEGIN
  v_period_start := date_trunc('month', now());

  SELECT COALESCE(SUM(u.quantity), 0) INTO v_total
  FROM public.billing_usage u
  JOIN public.billing_customers c ON c.id = u.customer_id
  WHERE c.user_id = p_user_id
    AND u.event_name = p_event_name
    AND u.created_at >= v_period_start;

  RETURN v_total < p_limit;
END;
$$;

-- --------------------------------------------------------------------------
-- 7. Updated-at trigger
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER billing_customers_updated_at
  BEFORE UPDATE ON public.billing_customers
  FOR EACH ROW EXECUTE FUNCTION public.billing_set_updated_at();

CREATE TRIGGER billing_subscriptions_updated_at
  BEFORE UPDATE ON public.billing_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.billing_set_updated_at();
