/**
 * Billing seam — client → n8n → Stripe (web/external rail, decision P1).
 *
 * The billing backend lives in n8n (same pattern as onboarding + AI coach). This
 * module is the ONLY place the client talks to it. The client never mutates plan
 * state: it asks n8n to create Stripe objects, then the authoritative state flows
 * back Stripe → n8n → Appwrite (`subscriptions`/`entitlements`), which the app
 * reads. See the billing architecture doc.
 *
 *   subscribe/upgrade:  createCheckoutSession → open hosted Stripe Checkout (external)
 *   extra AI message:   createAddonPaymentIntent → confirm with Stripe PaymentSheet
 *   recover state:      requestSubscriptionSync (sync-on-foreground / after return)
 *
 * Endpoints are n8n webhook URLs, injected via env (never hardcoded). When the
 * base URL is absent (local dev without backend), calls report `unavailable` so
 * the UI can fall back to a simulated flow.
 */
import { Linking } from 'react-native';
import type { UserPlan } from './store';

/**
 * Base URL of the n8n billing webhooks, e.g. https://n8n.piggnify.com/webhook.
 * Each flow is a path under it (overridable individually for n8n's per-workflow
 * webhook ids).
 */
const N8N_BILLING_BASE_URL = process.env.EXPO_PUBLIC_N8N_BILLING_URL ?? '';

const ENDPOINTS = {
  checkout: process.env.EXPO_PUBLIC_N8N_CHECKOUT_PATH ?? 'billing-checkout',
  addon: process.env.EXPO_PUBLIC_N8N_ADDON_PATH ?? 'billing-addon',
  sync: process.env.EXPO_PUBLIC_N8N_SYNC_PATH ?? 'billing-sync',
};

export function isBillingConfigured(): boolean {
  return N8N_BILLING_BASE_URL.length > 0;
}

function endpointUrl(path: string): string {
  return `${N8N_BILLING_BASE_URL.replace(/\/$/, '')}/${path}`;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(endpointUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Billing request failed (${res.status}) at ${path}`);
  }
  return (await res.json()) as T;
}

// ─── Subscribe / upgrade ────────────────────────────────────────────────────

export type CheckoutStatus = 'completed' | 'canceled' | 'unavailable';
export interface CheckoutResult {
  status: CheckoutStatus;
}

interface CheckoutSessionResponse {
  url: string;
}

/**
 * Ask n8n to create a Stripe Checkout Session for the target plan and return its
 * hosted URL. n8n picks the Price by plan + the user's country/currency (USD/PLN/
 * HUF + Stripe Tax) and attaches the Family trial when applicable.
 */
export async function createCheckoutSession(
  plan: UserPlan,
  userId: string,
  country?: string
): Promise<string | null> {
  if (!isBillingConfigured()) return null;
  const { url } = await postJson<CheckoutSessionResponse>(ENDPOINTS.checkout, {
    plan,
    userId,
    country,
  });
  return url ?? null;
}

/**
 * Open hosted Stripe Checkout in the external browser for `plan`.
 * `completed` only means the page opened; the real plan change arrives via the
 * Stripe → n8n → Appwrite sync. Callers should refresh entitlements on return.
 */
export async function startCheckout(plan: UserPlan, userId?: string): Promise<CheckoutResult> {
  if (!isBillingConfigured() || !userId) return { status: 'unavailable' };
  try {
    const url = await createCheckoutSession(plan, userId);
    if (!url) return { status: 'unavailable' };
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) return { status: 'unavailable' };
    await Linking.openURL(url);
    return { status: 'completed' };
  } catch {
    return { status: 'unavailable' };
  }
}

// ─── Extra AI message add-on (pay before allow) ─────────────────────────────

export interface AddonPaymentIntent {
  clientSecret: string;
  paymentIntentId: string;
  amountCents: number;
  currency: string;
}

/**
 * Ask n8n to create a per-message PaymentIntent (no packs; decision D-ADDON-SHAPE)
 * and a pending `addon_purchases` row. The client confirms it with Stripe
 * PaymentSheet; only after `payment_intent.succeeded` does n8n credit the
 * `usage_counters.allowance_bonus`, after which the prompt is allowed.
 */
export async function createAddonPaymentIntent(userId: string): Promise<AddonPaymentIntent | null> {
  if (!isBillingConfigured()) return null;
  return postJson<AddonPaymentIntent>(ENDPOINTS.addon, { userId });
}

// ─── Recovery / sync-on-read ────────────────────────────────────────────────

/**
 * Ask n8n to refetch the user's Stripe subscription and recompute entitlements
 * (covers lost/delayed webhooks). Fire-and-forget on app foreground / after a
 * checkout return; the fresh `entitlements` snapshot is read from Appwrite.
 */
export async function requestSubscriptionSync(userId: string): Promise<void> {
  if (!isBillingConfigured()) return;
  try {
    await postJson(ENDPOINTS.sync, { userId });
  } catch {
    // Non-fatal: the reconcile cron is the backstop.
  }
}
