'use client';

import React, { useEffect, useState } from 'react';
import { formatPrice } from '../lib/config';

// ---------------------------------------------------------------------------
// BillingDashboard — customer billing overview
// ---------------------------------------------------------------------------
// Displays: current plan, next billing date, usage stats, invoice history,
// and a button to open the Stripe Customer Portal.
// ---------------------------------------------------------------------------

export interface BillingInfo {
  tier: string;
  status: string;
  interval: 'month' | 'year' | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  monthlyPrice: number;
  usage?: {
    current: number;
    limit: number | null;
    eventName: string;
  };
}

export interface BillingDashboardProps {
  /** Billing information for the current user */
  billing: BillingInfo;
  /** Called when user clicks "Manage Subscription" */
  onManageSubscription: () => void;
  /** Called when user clicks "Upgrade" */
  onUpgrade: () => void;
  /** Loading state */
  loading?: boolean;
  /** Custom class name */
  className?: string;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    trialing: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    past_due: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    canceled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    free: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        colors[status] ?? colors.free
      }`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
    </span>
  );
}

export function BillingDashboard({
  billing,
  onManageSubscription,
  onUpgrade,
  loading = false,
  className = '',
}: BillingDashboardProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-indigo-600" />
      </div>
    );
  }

  const isFree = billing.tier === 'free';
  const isActive = billing.status === 'active' || billing.status === 'trialing';
  const usagePercent =
    billing.usage && billing.usage.limit
      ? Math.min(100, Math.round((billing.usage.current / billing.usage.limit) * 100))
      : null;

  return (
    <div className={`w-full max-w-3xl mx-auto space-y-6 ${className}`}>
      {/* Plan overview card */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Your Plan
          </h2>
          <StatusBadge status={isFree ? 'free' : billing.status} />
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          {/* Current plan */}
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Current Plan</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white capitalize">
              {billing.tier}
            </p>
          </div>

          {/* Price */}
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Price</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
              {isFree ? 'Free' : `${formatPrice(billing.monthlyPrice)}/mo`}
            </p>
            {!isFree && billing.interval === 'year' && (
              <p className="text-xs text-gray-400 dark:text-gray-500">Billed annually</p>
            )}
          </div>

          {/* Next billing */}
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {billing.cancelAtPeriodEnd ? 'Access Until' : 'Next Billing'}
            </p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
              {billing.currentPeriodEnd
                ? new Date(billing.currentPeriodEnd).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : 'N/A'}
            </p>
            {billing.cancelAtPeriodEnd && (
              <p className="text-xs text-red-500 dark:text-red-400">
                Cancels at end of period
              </p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-6 flex flex-wrap gap-3">
          {isFree ? (
            <button
              onClick={onUpgrade}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              Upgrade Plan
            </button>
          ) : (
            <>
              <button
                onClick={onManageSubscription}
                className="rounded-lg bg-white dark:bg-gray-700 px-5 py-2.5 text-sm font-semibold text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                Manage Subscription
              </button>
              <button
                onClick={onUpgrade}
                className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
              >
                Change Plan
              </button>
            </>
          )}
        </div>
      </div>

      {/* Usage card (if usage tracking is enabled) */}
      {billing.usage && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Usage This Period
          </h3>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400 capitalize">
                {billing.usage.eventName.replace(/_/g, ' ')}
              </span>
              <span className="font-medium text-gray-900 dark:text-white">
                {billing.usage.current.toLocaleString()}
                {billing.usage.limit !== null && (
                  <span className="text-gray-400 dark:text-gray-500">
                    {' '}
                    / {billing.usage.limit.toLocaleString()}
                  </span>
                )}
              </span>
            </div>

            {usagePercent !== null && (
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all ${
                    usagePercent >= 90
                      ? 'bg-red-500'
                      : usagePercent >= 75
                      ? 'bg-yellow-500'
                      : 'bg-indigo-600'
                  }`}
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
            )}

            {usagePercent !== null && usagePercent >= 80 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                You&apos;ve used {usagePercent}% of your plan&apos;s limit.{' '}
                <button
                  onClick={onUpgrade}
                  className="underline hover:no-underline font-medium"
                >
                  Upgrade for more
                </button>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default BillingDashboard;
