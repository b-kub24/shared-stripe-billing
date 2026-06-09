'use client';

import React, { useEffect, useState, ReactNode } from 'react';

// ---------------------------------------------------------------------------
// SubscriptionGate — paywall / feature-gating wrapper
// ---------------------------------------------------------------------------
// Wrap any content that should only be visible to users on a specific tier
// or higher. Shows a configurable fallback (upgrade prompt) otherwise.
// ---------------------------------------------------------------------------

export interface SubscriptionGateProps {
  /** The minimum tier required to view the children */
  requiredTier: string;
  /** Current user's tier (pass from your auth/session context) */
  currentTier: string;
  /** Ordered list of tier IDs from lowest to highest */
  tierOrder?: string[];
  /** Content shown to authorized users */
  children: ReactNode;
  /** Content shown to unauthorized users (default: upgrade prompt) */
  fallback?: ReactNode;
  /** Called when user clicks the upgrade button in default fallback */
  onUpgrade?: () => void;
  /** If true, shows a loading state while tier is being determined */
  loading?: boolean;
}

function defaultTierHasAccess(
  currentTier: string,
  requiredTier: string,
  tierOrder: string[]
): boolean {
  const currentIdx = tierOrder.indexOf(currentTier);
  const requiredIdx = tierOrder.indexOf(requiredTier);
  if (currentIdx === -1 || requiredIdx === -1) return false;
  return currentIdx >= requiredIdx;
}

export function SubscriptionGate({
  requiredTier,
  currentTier,
  tierOrder = ['free', 'pro', 'enterprise'],
  children,
  fallback,
  onUpgrade,
  loading = false,
}: SubscriptionGateProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-indigo-600" />
      </div>
    );
  }

  const hasAccess = defaultTierHasAccess(currentTier, requiredTier, tierOrder);

  if (hasAccess) {
    return <>{children}</>;
  }

  // Default fallback: upgrade prompt
  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900">
        <svg
          className="h-6 w-6 text-indigo-600 dark:text-indigo-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
        Upgrade to {requiredTier.charAt(0).toUpperCase() + requiredTier.slice(1)}
      </h3>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        This feature requires a {requiredTier} plan or higher. Upgrade to unlock full access.
      </p>
      {onUpgrade && (
        <button
          onClick={onUpgrade}
          className="mt-6 inline-flex items-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
        >
          Upgrade Now
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Server-side middleware helper
// ---------------------------------------------------------------------------
// Use this in your Next.js middleware or API routes to gate access:
//
//   import { checkTierAccess } from '@b-kub24/shared-stripe-billing/components/SubscriptionGate';
//
//   if (!await checkTierAccess(supabase, userId, 'pro')) {
//     return NextResponse.json({ error: 'Upgrade required' }, { status: 403 });
//   }
// ---------------------------------------------------------------------------

export async function checkTierAccess(
  supabase: any,
  userId: string,
  requiredTier: string,
  tierOrder: string[] = ['free', 'pro', 'enterprise']
): Promise<boolean> {
  // Dynamic import to avoid pulling in Supabase on the client
  const { getUserTier } = await import('../lib/supabase-billing');
  const currentTier = await getUserTier(supabase, userId);
  return defaultTierHasAccess(currentTier, requiredTier, tierOrder);
}

export default SubscriptionGate;
