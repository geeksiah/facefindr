/**
 * PayPal Payment Integration
 * 
 * Uses PayPal Commerce Platform for marketplace payments
 * Documentation: https://developer.paypal.com/docs/api/orders/v2/
 */

import {
  Client,
  Environment,
  OrdersController,
  PaymentsController,
  LogLevel,
  CheckoutPaymentIntent,
  OrderApplicationContextLandingPage,
  OrderApplicationContextUserAction,
} from '@paypal/paypal-server-sdk';

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox'; // 'sandbox' or 'live'

// Platform fee percentage
const PLATFORM_FEE_PERCENT = 0.15;

// Initialize PayPal client
let paypalClient: Client | null = null;
let ordersController: OrdersController | null = null;
let paymentsController: PaymentsController | null = null;

if (PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET) {
  paypalClient = new Client({
    clientCredentialsAuthCredentials: {
      oAuthClientId: PAYPAL_CLIENT_ID,
      oAuthClientSecret: PAYPAL_CLIENT_SECRET,
    },
    timeout: 30000,
    environment: PAYPAL_MODE === 'live' ? Environment.Production : Environment.Sandbox,
    logging: {
      logLevel: LogLevel.Info,
      logRequest: { logBody: true },
      logResponse: { logBody: true },
    },
  });

  ordersController = new OrdersController(paypalClient);
  paymentsController = new PaymentsController(paypalClient);
}

export function isPayPalConfigured(): boolean {
  return !!paypalClient;
}

function getPayPalApiBaseUrl(): string {
  return PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

async function getPayPalAccessToken(): Promise<string> {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error('PayPal credentials are not configured');
  }

  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`${getPayPalApiBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error('Failed to obtain PayPal access token');
  }

  const data = await response.json();
  if (!data?.access_token) {
    throw new Error('PayPal access token missing in response');
  }

  return data.access_token as string;
}

export function getPayPalClientId(): string | undefined {
  return PAYPAL_CLIENT_ID;
}

// ============================================
// ORDER CREATION
// ============================================

export interface CreateOrderParams {
  eventId: string | null;
  eventName: string;
  items: Array<{
    name: string;
    description?: string;
    amount: number; // in cents
    quantity: number;
    mediaIds?: string[];
  }>;
  currency: string;
  photographerPayPalEmail: string | null;
  returnUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface PayPalOrder {
  id: string;
  status: string;
  links: Array<{
    href: string;
    rel: string;
    method: string;
  }>;
}

export interface CreateBillingSubscriptionParams {
  planId: string;
  returnUrl: string;
  cancelUrl: string;
  customId?: string;
  subscriber?: {
    email?: string;
    givenName?: string;
    surname?: string;
  };
}

export interface PayPalBillingSubscription {
  id: string;
  status: string;
  links: Array<{
    href: string;
    rel: string;
    method: string;
  }>;
}

export async function createOrder(params: CreateOrderParams): Promise<PayPalOrder> {
  if (!ordersController) {
    throw new Error('PayPal is not configured');
  }

  const totalAmount = params.items.reduce((sum, item) => sum + item.amount * item.quantity, 0);
  const platformFee = Math.round(totalAmount * PLATFORM_FEE_PERCENT);
  const photographerAmount = totalAmount - platformFee;

  // Convert cents to dollars string with 2 decimal places
  const formatAmount = (cents: number) => (cents / 100).toFixed(2);

  const { body } = await ordersController.createOrder({
    body: {
      intent: CheckoutPaymentIntent.Capture,
      purchaseUnits: [
        {
          referenceId: params.eventId || 'drop-in',
          description: `Photos from ${params.eventName}`,
          customId: JSON.stringify({
            event_id: params.eventId || 'drop-in',
            ...params.metadata,
          }),
          amount: {
            currencyCode: params.currency,
            value: formatAmount(totalAmount),
            breakdown: {
              itemTotal: {
                currencyCode: params.currency,
                value: formatAmount(totalAmount),
              },
            },
          },
          items: params.items.map((item) => ({
            name: item.name,
            description: item.description,
            quantity: String(item.quantity),
            unitAmount: {
              currencyCode: params.currency,
              value: formatAmount(item.amount),
            },
          })),
          payee: {
            emailAddress: params.photographerPayPalEmail || '',
          },
          paymentInstruction: {
            platformFees: [
              {
                amount: {
                  currencyCode: params.currency,
                  value: formatAmount(platformFee),
                },
              },
            ],
          },
        },
      ],
      applicationContext: {
        brandName: 'Ferchr',
        landingPage: OrderApplicationContextLandingPage.NoPreference,
        userAction: OrderApplicationContextUserAction.PayNow,
        returnUrl: params.returnUrl,
        cancelUrl: params.cancelUrl,
      },
    },
    prefer: 'return=representation',
  });

  // Parse the response body
  const order = typeof body === 'string' ? JSON.parse(body) : body;

  return {
    id: order.id,
    status: order.status,
    links: order.links || [],
  };
}

export async function createBillingSubscription(
  params: CreateBillingSubscriptionParams
): Promise<PayPalBillingSubscription> {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error('PayPal is not configured');
  }

  const accessToken = await getPayPalAccessToken();
  const response = await fetch(`${getPayPalApiBaseUrl()}/v1/billing/subscriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      plan_id: params.planId,
      ...(params.customId ? { custom_id: params.customId } : {}),
      ...(params.subscriber
        ? {
            subscriber: {
              ...(params.subscriber.email ? { email_address: params.subscriber.email } : {}),
              ...(params.subscriber.givenName || params.subscriber.surname
                ? {
                    name: {
                      ...(params.subscriber.givenName ? { given_name: params.subscriber.givenName } : {}),
                      ...(params.subscriber.surname ? { surname: params.subscriber.surname } : {}),
                    },
                  }
                : {}),
            },
          }
        : {}),
      application_context: {
        brand_name: 'Ferchr',
        user_action: 'SUBSCRIBE_NOW',
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
      },
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || 'Failed to create PayPal billing subscription');
  }

  return {
    id: data.id,
    status: data.status,
    links: data.links || [],
  };
}

export async function getBillingSubscription(subscriptionId: string): Promise<{
  id: string;
  status: string;
  plan_id?: string;
  custom_id?: string;
}> {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error('PayPal is not configured');
  }

  const accessToken = await getPayPalAccessToken();
  const response = await fetch(
    `${getPayPalApiBaseUrl()}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || 'Failed to fetch PayPal billing subscription');
  }

  return {
    id: data.id,
    status: data.status,
    plan_id: data.plan_id,
    custom_id: data.custom_id,
  };
}

// ============================================
// ORDER CAPTURE
// ============================================

export interface CapturedOrder {
  id: string;
  status: string;
  purchaseUnits: Array<{
    referenceId: string;
    payments: {
      captures: Array<{
        id: string;
        status: string;
        amount: {
          currencyCode: string;
          value: string;
        };
      }>;
    };
  }>;
  payer: {
    emailAddress: string;
    payerId: string;
    name: {
      givenName: string;
      surname: string;
    };
  };
}

export async function captureOrder(orderId: string): Promise<CapturedOrder> {
  if (!ordersController) {
    throw new Error('PayPal is not configured');
  }

  const { body } = await ordersController.captureOrder({
    id: orderId,
    prefer: 'return=representation',
  });

  const order = typeof body === 'string' ? JSON.parse(body) : body;

  return order as CapturedOrder;
}

// ============================================
// ORDER DETAILS
// ============================================

export async function getOrder(orderId: string): Promise<PayPalOrder> {
  if (!ordersController) {
    throw new Error('PayPal is not configured');
  }

  const { body } = await ordersController.getOrder({
    id: orderId,
  });

  const order = typeof body === 'string' ? JSON.parse(body) : body;

  return {
    id: order.id,
    status: order.status,
    links: order.links || [],
  };
}

// ============================================
// REFUNDS
// ============================================

export interface RefundResult {
  id: string;
  status: string;
  amount: {
    currencyCode: string;
    value: string;
  };
}

export async function refundCapture(
  captureId: string,
  amount?: number,
  currency?: string
): Promise<RefundResult> {
  if (!paymentsController) {
    throw new Error('PayPal is not configured');
  }

  const { body } = await paymentsController.refundCapturedPayment({
    captureId,
    body: amount && currency
      ? {
          amount: {
            currencyCode: currency,
            value: (amount / 100).toFixed(2),
          },
        }
      : undefined,
    prefer: 'return=representation',
  });

  const refund = typeof body === 'string' ? JSON.parse(body) : body;

  return {
    id: refund.id,
    status: refund.status,
    amount: refund.amount,
  };
}

// ============================================
// WEBHOOK VERIFICATION
// ============================================

export async function verifyWebhook(
  headers: Record<string, string>,
  body: string,
  webhookId: string
): Promise<boolean> {
  if (!paypalClient) {
    throw new Error('PayPal is not configured');
  }

  const transmissionId = headers['paypal-transmission-id'];
  const transmissionTime = headers['paypal-transmission-time'];
  const certUrl = headers['paypal-cert-url'];
  const transmissionSig = headers['paypal-transmission-sig'];
  const authAlgo = headers['paypal-auth-algo'];

  if (!transmissionId || !transmissionTime || !certUrl || !transmissionSig || !authAlgo) {
    return false;
  }

  try {
    const accessToken = await getPayPalAccessToken();
    const webhookEvent = JSON.parse(body);
    const response = await fetch(`${getPayPalApiBaseUrl()}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: webhookId,
        webhook_event: webhookEvent,
      }),
    });

    if (!response.ok) {
      return false;
    }

    const verification = await response.json();
    return verification?.verification_status === 'SUCCESS';
  } catch {
    return false;
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

export function getApprovalUrl(order: PayPalOrder): string | null {
  const approveLink = order.links.find((link) => link.rel === 'approve');
  return approveLink?.href || null;
}

export function calculateFees(grossAmount: number): {
  platformFee: number;
  paypalFee: number;
  netAmount: number;
} {
  // PayPal fee: 2.9% + $0.30 for US domestic
  const paypalFee = Math.round(grossAmount * 0.029 + 30);
  const platformFee = Math.round(grossAmount * PLATFORM_FEE_PERCENT);
  const netAmount = grossAmount - platformFee - paypalFee;

  return { platformFee, paypalFee, netAmount };
}
