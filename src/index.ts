// ===========================================================================
// @b-kub24/shared-stripe-billing — barrel exports
// ===========================================================================

// ---- Config ----
export {
  createBillingConfig,
  getBillingConfig,
  getTierById,
  getStripePriceId,
  formatPrice,
  type BillingConfig,
  type PricingTier,
  type PricingFeature,
} from './lib/config';

// ---- Stripe helpers ----
export {
  getStripe,
  constructWebhookEvent,
  getOrCreateStripeCustomer,
  getSubscription,
  cancelSubscription,
  resumeSubscription,
} from './lib/stripe';

// ---- Supabase billing queries ----
export {
  getCustomerByUserId,
  getCustomerByStripeId,
  upsertCustomer,
  getActiveSubscription,
  getSubscriptionByStripeId,
  upsertSubscription,
  createPurchase,
  getPurchasesByCustomer,
  recordUsage,
  getUsageForPeriod,
  getUserTier,
  hasAccess,
  type BillingCustomer,
  type BillingSubscription,
  type BillingPurchase,
  type UsageRecord,
  type SubscriptionStatus,
} from './lib/supabase-billing';

// ---- API handlers ----
export { createCheckoutHandler, type CheckoutRequest } from './api/checkout';
export {
  createWebhookHandler,
  registerWebhookCallbacks,
  type WebhookCallbacks,
} from './api/webhook';
export { createPortalHandler, type PortalRequest } from './api/portal';
export {
  recordUsageHandler,
  getUsageHandler,
  checkUsageLimit,
  type RecordUsageRequest,
} from './api/usage';

// ---- Components ----
export { PricingPage, type PricingPageProps } from './components/PricingPage';
export {
  SubscriptionGate,
  checkTierAccess,
  type SubscriptionGateProps,
} from './components/SubscriptionGate';
export {
  BillingDashboard,
  type BillingDashboardProps,
  type BillingInfo,
} from './components/BillingDashboard';
