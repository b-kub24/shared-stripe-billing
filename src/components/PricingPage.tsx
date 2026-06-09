'use client';

import React, { useState } from 'react';
import { PricingTier, formatPrice } from '../lib/config';

// ---------------------------------------------------------------------------
// PricingPage — configurable, responsive pricing component
// ---------------------------------------------------------------------------

export interface PricingPageProps {
  /** Pricing tiers to display */
  tiers: PricingTier[];
  /** Currently active tier (to show "Current Plan") */
  currentTierId?: string;
  /** Called when user clicks a pricing CTA */
  onSelectTier: (tierId: string, interval: 'monthly' | 'annual') => void;
  /** Custom heading */
  heading?: string;
  /** Custom subheading */
  subheading?: string;
  /** Show annual toggle (default: true) */
  showAnnualToggle?: boolean;
  /** Custom class name for the container */
  className?: string;
  /** Loading state for tier being purchased */
  loadingTierId?: string | null;
  /** Currency code (default: 'USD') */
  currency?: string;
}

export function PricingPage({
  tiers,
  currentTierId,
  onSelectTier,
  heading = 'Simple, transparent pricing',
  subheading = 'Choose the plan that fits your needs. Upgrade or downgrade at any time.',
  showAnnualToggle = true,
  className = '',
  loadingTierId = null,
  currency = 'USD',
}: PricingPageProps) {
  const [interval, setInterval] = useState<'monthly' | 'annual'>('monthly');

  const sortedTiers = [...tiers].sort((a, b) => a.order - b.order);

  return (
    <div className={`w-full max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8 ${className}`}>
      {/* Header */}
      <div className="text-center mb-12">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
          {heading}
        </h2>
        <p className="mt-4 text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          {subheading}
        </p>

        {/* Interval toggle */}
        {showAnnualToggle && (
          <div className="mt-8 flex items-center justify-center gap-3">
            <span
              className={`text-sm font-medium ${
                interval === 'monthly'
                  ? 'text-gray-900 dark:text-white'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Monthly
            </span>
            <button
              onClick={() =>
                setInterval((prev) => (prev === 'monthly' ? 'annual' : 'monthly'))
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                interval === 'annual' ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'
              }`}
              role="switch"
              aria-checked={interval === 'annual'}
              aria-label="Toggle annual billing"
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  interval === 'annual' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span
              className={`text-sm font-medium ${
                interval === 'annual'
                  ? 'text-gray-900 dark:text-white'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Annual
              <span className="ml-1.5 inline-flex items-center rounded-full bg-green-100 dark:bg-green-900 px-2 py-0.5 text-xs font-medium text-green-800 dark:text-green-200">
                Save ~17%
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Pricing cards */}
      <div
        className={`grid gap-8 ${
          sortedTiers.length === 3
            ? 'lg:grid-cols-3'
            : sortedTiers.length === 2
            ? 'lg:grid-cols-2 max-w-4xl mx-auto'
            : 'lg:grid-cols-1 max-w-lg mx-auto'
        }`}
      >
        {sortedTiers.map((tier) => {
          const price =
            interval === 'annual' ? tier.annualPrice : tier.monthlyPrice;
          const monthlyEquiv =
            interval === 'annual' ? tier.annualPrice / 12 : tier.monthlyPrice;
          const isCurrent = currentTierId === tier.id;
          const isLoading = loadingTierId === tier.id;
          const isFree = price === 0;

          return (
            <div
              key={tier.id}
              className={`relative flex flex-col rounded-2xl border p-8 shadow-sm transition-shadow hover:shadow-lg ${
                tier.highlighted
                  ? 'border-indigo-600 dark:border-indigo-400 ring-2 ring-indigo-600 dark:ring-indigo-400'
                  : 'border-gray-200 dark:border-gray-700'
              } bg-white dark:bg-gray-800`}
            >
              {/* Popular badge */}
              {tier.highlighted && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center rounded-full bg-indigo-600 px-4 py-1 text-xs font-semibold text-white shadow-sm">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {tier.name}
                </h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {tier.description}
                </p>
              </div>

              {/* Price */}
              <div className="mb-8">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-gray-900 dark:text-white">
                    {isFree ? 'Free' : formatPrice(monthlyEquiv, currency)}
                  </span>
                  {!isFree && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      /month
                    </span>
                  )}
                </div>
                {!isFree && interval === 'annual' && (
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Billed {formatPrice(price, currency)}/year
                  </p>
                )}
              </div>

              {/* Features */}
              <ul className="mb-8 flex-1 space-y-3">
                {tier.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    {feature.included ? (
                      <svg
                        className="mt-0.5 h-5 w-5 flex-shrink-0 text-indigo-600 dark:text-indigo-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4.5 12.75l6 6 9-13.5"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="mt-0.5 h-5 w-5 flex-shrink-0 text-gray-300 dark:text-gray-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    )}
                    <span
                      className={`text-sm ${
                        feature.included
                          ? 'text-gray-700 dark:text-gray-300'
                          : 'text-gray-400 dark:text-gray-500'
                      }`}
                    >
                      {feature.text}
                    </span>
                  </li>
                ))}
              </ul>

              {/* CTA button */}
              <button
                onClick={() => onSelectTier(tier.id, interval)}
                disabled={isCurrent || isLoading}
                className={`w-full rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${
                  isCurrent
                    ? 'cursor-default bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                    : tier.highlighted
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                    : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                } ${isLoading ? 'opacity-70 cursor-wait' : ''}`}
              >
                {isLoading
                  ? 'Redirecting...'
                  : isCurrent
                  ? 'Current Plan'
                  : tier.cta ?? 'Get Started'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default PricingPage;
