import Stripe from 'stripe';

// Initialize Stripe with secret key
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  console.warn('STRIPE_SECRET_KEY is not set. Stripe payments will not work.');
}

export const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      apiVersion: '2024-12-18.acacia',
      typescript: true,
    })
  : null;

// Platform fee percentage (e.g., 15% = 0.15)
const PLATFORM_FEE_PERCENT = 0.15;

export function isStripeConfigured(): boolean {
  return !!stripe;
}

// ============================================
// CONNECT ACCOUNT MANAGEMENT
// ============================================

export interface CreateConnectAccountParams {
  email: string;
  country: string;
  businessName?: string;
  photographerId: string;
}

export async function createConnectAccount({
  email,
  country,
  businessName,
  photographerId,
}: CreateConnectAccountParams): Promise<Stripe.Account> {
  if (!stripe) throw new Error('Stripe is not configured');

  const account = await stripe.accounts.create({
    type: 'express',
    country,
    email,
    business_type: 'individual',
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_profile: {
      name: businessName,
      product_description: 'Event photography services',
      mcc: '7221', // Photographic studios
    },
    metadata: {
      photographer_id: photographerId,
    },
  });

  return account;
}

export async function createAccountLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string
): Promise<Stripe.AccountLink> {
  if (!stripe) throw new Error('Stripe is not configured');

  return stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });
}

export async function createLoginLink(accountId: string): Promise<Stripe.LoginLink> {
  if (!stripe) throw new Error('Stripe is not configured');

  return stripe.accounts.createLoginLink(accountId);
}

export async function getConnectAccount(accountId: string): Promise<Stripe.Account> {
  if (!stripe) throw new Error('Stripe is not configured');

  return stripe.accounts.retrieve(accountId);
}

export async function deleteConnectAccount(accountId: string): Promise<Stripe.DeletedAccount> {
  if (!stripe) throw new Error('Stripe is not configured');

  return stripe.accounts.del(accountId);
}

// ============================================
// CHECKOUT & PAYMENTS
// ============================================

export interface CreateCheckoutParams {
  photographerAccountId: string;
  eventId: string;
  eventName: string;
  items: Array<{
    name: string;
    description?: string;
    amount: number; // in cents
    quantity: number;
    mediaIds?: string[];
  }>;
  currency: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export async function createCheckoutSession({
  photographerAccountId,
  eventId,
  eventName,
  items,
  currency,
  customerEmail,
  successUrl,
  cancelUrl,
  metadata = {},
}: CreateCheckoutParams): Promise<Stripe.Checkout.Session> {
  if (!stripe) throw new Error('Stripe is not configured');

  const totalAmount = items.reduce((sum, item) => sum + item.amount * item.quantity, 0);
  const platformFee = Math.round(totalAmount * PLATFORM_FEE_PERCENT);

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map((item) => ({
    price_data: {
      currency: currency.toLowerCase(),
      product_data: {
        name: item.name,
        description: item.description,
        metadata: item.mediaIds ? { media_ids: item.mediaIds.join(',') } : {},
      },
      unit_amount: item.amount,
    },
    quantity: item.quantity,
  }));

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: lineItems,
    customer_email: customerEmail,
    success_url: successUrl,
    cancel_url: cancelUrl,
    payment_intent_data: {
      application_fee_amount: platformFee,
      transfer_data: {
        destination: photographerAccountId,
      },
    },
    metadata: {
      event_id: eventId,
      event_name: eventName,
      ...metadata,
    },
  });

  return session;
}

export async function getCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
  if (!stripe) throw new Error('Stripe is not configured');

  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['payment_intent', 'line_items'],
  });
}

export async function getPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
  if (!stripe) throw new Error('Stripe is not configured');

  return stripe.paymentIntents.retrieve(paymentIntentId);
}

// ============================================
// REFUNDS
// ============================================

export async function createRefund(
  paymentIntentId: string,
  amount?: number,
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer'
): Promise<Stripe.Refund> {
  if (!stripe) throw new Error('Stripe is not configured');

  return stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount,
    reason,
    reverse_transfer: true,
    refund_application_fee: true,
  });
}

// ============================================
// BALANCE & PAYOUTS
// ============================================

export async function getAccountBalance(accountId: string): Promise<Stripe.Balance> {
  if (!stripe) throw new Error('Stripe is not configured');

  return stripe.balance.retrieve({
    stripeAccount: accountId,
  });
}

export async function listPayouts(
  accountId: string,
  limit = 10
): Promise<Stripe.ApiList<Stripe.Payout>> {
  if (!stripe) throw new Error('Stripe is not configured');

  return stripe.payouts.list(
    { limit },
    { stripeAccount: accountId }
  );
}

// ============================================
// WEBHOOKS
// ============================================

export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string,
  secret: string
): Stripe.Event {
  if (!stripe) throw new Error('Stripe is not configured');

  return stripe.webhooks.constructEvent(payload, signature, secret);
}

// ============================================
// PRICING HELPERS
// ============================================

export function calculateFees(grossAmount: number): {
  platformFee: number;
  stripeFee: number;
  netAmount: number;
} {
  // Stripe fee: 2.9% + $0.30 for US
  const stripeFee = Math.round(grossAmount * 0.029 + 30);
  const platformFee = Math.round(grossAmount * PLATFORM_FEE_PERCENT);
  const netAmount = grossAmount - platformFee - stripeFee;

  return { platformFee, stripeFee, netAmount };
}
