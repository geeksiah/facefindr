/**
 * Flutterwave Payment Integration
 * 
 * Supports:
 * - Card payments
 * - Mobile money (MTN, Vodafone, AirtelTigo)
 * - Bank transfers
 * - USSD
 * 
 * Payout Model:
 * - Platform collects payments via our Flutterwave account
 * - Payouts go directly to photographer's mobile money or bank
 * - No business registration required for photographers
 * 
 * Documentation: https://developer.flutterwave.com/docs
 */

const FLUTTERWAVE_SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY;
const FLUTTERWAVE_PUBLIC_KEY = process.env.NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY;
const FLUTTERWAVE_BASE_URL = 'https://api.flutterwave.com/v3';

// Platform fee percentage
const PLATFORM_FEE_PERCENT = 0.15;

export function isFlutterwaveConfigured(): boolean {
  return !!FLUTTERWAVE_SECRET_KEY;
}

export function getFlutterwavePublicKey(): string | undefined {
  return FLUTTERWAVE_PUBLIC_KEY;
}

// ============================================
// API HELPER
// ============================================

async function flutterwaveRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  if (!FLUTTERWAVE_SECRET_KEY) {
    throw new Error('Flutterwave is not configured');
  }

  const response = await fetch(`${FLUTTERWAVE_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Flutterwave API error');
  }

  return data;
}

// ============================================
// MOBILE MONEY PAYOUT DESTINATIONS
// ============================================

export type MomoNetwork = 'MTN' | 'VODAFONE' | 'TIGO' | 'AIRTEL';

export interface MomoPayoutDestination {
  type: 'momo';
  network: MomoNetwork;
  phoneNumber: string;
  country: string; // GH, NG, KE, UG, RW, etc.
}

export interface BankPayoutDestination {
  type: 'bank';
  bankCode: string;
  accountNumber: string;
  accountName: string;
  country: string;
}

export type PayoutDestination = MomoPayoutDestination | BankPayoutDestination;

// ============================================
// PHOTOGRAPHER PAYOUT PROFILE (No subaccount needed)
// ============================================

export interface CreatorPayoutProfile {
  photographerId: string;
  displayName: string;
  email: string;
  country: string;
  preferredCurrency: string;
  payoutDestination: PayoutDestination;
}

// ============================================
// PAYMENT INITIALIZATION (Platform collects)
// ============================================

export interface InitializePaymentParams {
  txRef: string;
  amount: number;
  currency: string;
  redirectUrl: string;
  customerEmail: string;
  customerName?: string;
  customerPhone?: string;
  eventId: string | null;
  eventName: string;
  photographerId: string | null;
  paymentOptions?: string; // 'card,mobilemoney,ussd,banktransfer'
  metadata?: Record<string, string>;
}

export interface FlutterwavePaymentLink {
  link: string;
}

export async function initializePayment(
  params: InitializePaymentParams
): Promise<FlutterwavePaymentLink> {
  // Platform collects full amount - we'll payout to photographer later
  const response = await flutterwaveRequest<{
    status: string;
    message: string;
    data: FlutterwavePaymentLink;
  }>('/payments', {
    method: 'POST',
    body: JSON.stringify({
      tx_ref: params.txRef,
      amount: params.amount / 100, // Flutterwave uses major units, not cents
      currency: params.currency,
      redirect_url: params.redirectUrl,
      customer: {
        email: params.customerEmail,
        name: params.customerName,
        phonenumber: params.customerPhone,
      },
      customizations: {
        title: 'Ferchr',
        description: `Photos from ${params.eventName}`,
        logo: process.env.NEXT_PUBLIC_APP_URL + '/assets/logos/icon.svg',
      },
      payment_options: params.paymentOptions || 'card,mobilemoney,banktransfer',
      meta: {
        event_id: params.eventId || 'drop-in',
        photographer_id: params.photographerId || '',
        platform_fee_percent: PLATFORM_FEE_PERCENT,
        ...params.metadata,
      },
    }),
  });

  return response.data;
}

// ============================================
// MOBILE MONEY CHARGE (Direct from customer)
// ============================================

export interface MomoChargeParams {
  txRef: string;
  amount: number;
  currency: string; // GHS, UGX, RWF, XAF, XOF, KES, ZAR
  phoneNumber: string;
  network: MomoNetwork;
  email: string;
  eventId: string;
  photographerId: string;
}

export async function initiateMomoCharge(
  params: MomoChargeParams
): Promise<{ status: string; message: string; mode?: string }> {
  const endpoint = getMomoEndpoint(params.currency);
  
  const response = await flutterwaveRequest<{
    status: string;
    message: string;
    meta?: { authorization: { mode: string } };
  }>(endpoint, {
    method: 'POST',
    body: JSON.stringify({
      tx_ref: params.txRef,
      amount: params.amount / 100,
      currency: params.currency,
      phone_number: params.phoneNumber,
      network: params.network,
      email: params.email,
      meta: {
        event_id: params.eventId,
        photographer_id: params.photographerId,
      },
    }),
  });

  return {
    status: response.status,
    message: response.message,
    mode: response.meta?.authorization?.mode,
  };
}

function getMomoEndpoint(currency: string): string {
  switch (currency) {
    case 'GHS':
      return '/charges?type=mobile_money_ghana';
    case 'UGX':
      return '/charges?type=mobile_money_uganda';
    case 'RWF':
      return '/charges?type=mobile_money_rwanda';
    case 'ZMW':
      return '/charges?type=mobile_money_zambia';
    case 'XAF':
    case 'XOF':
      return '/charges?type=mobile_money_franco';
    default:
      return '/charges?type=mobile_money_ghana';
  }
}

// ============================================
// TRANSACTION VERIFICATION
// ============================================

export interface FlutterwaveTransaction {
  id: number;
  tx_ref: string;
  flw_ref: string;
  device_fingerprint: string;
  amount: number;
  currency: string;
  charged_amount: number;
  app_fee: number;
  merchant_fee: number;
  processor_response: string;
  auth_model: string;
  ip: string;
  narration: string;
  status: 'successful' | 'failed' | 'pending';
  payment_type: string;
  created_at: string;
  account_id: number;
  customer: {
    id: number;
    name: string;
    phone_number: string;
    email: string;
    created_at: string;
  };
  meta?: Record<string, unknown>;
}

export async function verifyTransaction(
  transactionId: string
): Promise<FlutterwaveTransaction> {
  const response = await flutterwaveRequest<{
    status: string;
    message: string;
    data: FlutterwaveTransaction;
  }>(`/transactions/${transactionId}/verify`);

  return response.data;
}

export async function verifyTransactionByRef(
  txRef: string
): Promise<FlutterwaveTransaction> {
  const response = await flutterwaveRequest<{
    status: string;
    message: string;
    data: FlutterwaveTransaction;
  }>(`/transactions/verify_by_reference?tx_ref=${txRef}`);

  return response.data;
}

// ============================================
// REFUNDS
// ============================================

export async function createRefund(
  transactionId: number,
  amount?: number
): Promise<{ status: string; message: string }> {
  const response = await flutterwaveRequest<{
    status: string;
    message: string;
  }>(`/transactions/${transactionId}/refund`, {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });

  return response;
}

// ============================================
// TRANSFERS / PAYOUTS (To photographer's MoMo or Bank)
// ============================================

export interface MomoTransferParams {
  reference: string;
  amount: number; // in cents
  currency: string;
  phoneNumber: string;
  network: MomoNetwork;
  beneficiaryName: string;
  narration: string;
}

export async function createMomoTransfer(
  params: MomoTransferParams
): Promise<{ status: string; message: string; data?: { id: number; status: string } }> {
  const response = await flutterwaveRequest<{
    status: string;
    message: string;
    data?: { id: number; status: string };
  }>('/transfers', {
    method: 'POST',
    body: JSON.stringify({
      account_bank: getMomoBankCode(params.network, params.currency),
      account_number: params.phoneNumber,
      amount: params.amount / 100,
      currency: params.currency,
      narration: params.narration,
      reference: params.reference,
      beneficiary_name: params.beneficiaryName,
      meta: {
        mobile_number: params.phoneNumber,
        sender: 'Ferchr',
      },
    }),
  });

  return response;
}

function getMomoBankCode(network: MomoNetwork, currency: string): string {
  // Bank codes for mobile money in different countries
  if (currency === 'GHS') {
    switch (network) {
      case 'MTN':
        return 'MTN';
      case 'VODAFONE':
        return 'VDF';
      case 'TIGO':
      case 'AIRTEL':
        return 'ATL';
      default:
        return 'MTN';
    }
  }
  // Add more countries as needed
  return network;
}

export interface BankTransferParams {
  reference: string;
  amount: number; // in cents
  currency: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  narration: string;
}

export async function createBankTransfer(
  params: BankTransferParams
): Promise<{ status: string; message: string; data?: { id: number; status: string } }> {
  const response = await flutterwaveRequest<{
    status: string;
    message: string;
    data?: { id: number; status: string };
  }>('/transfers', {
    method: 'POST',
    body: JSON.stringify({
      account_bank: params.bankCode,
      account_number: params.accountNumber,
      amount: params.amount / 100,
      currency: params.currency,
      narration: params.narration,
      reference: params.reference,
      beneficiary_name: params.accountName,
    }),
  });

  return response;
}

// ============================================
// BANKS LIST
// ============================================

export interface Bank {
  id: number;
  code: string;
  name: string;
}

export async function getBanks(country: string): Promise<Bank[]> {
  const response = await flutterwaveRequest<{
    status: string;
    message: string;
    data: Bank[];
  }>(`/banks/${country}`);

  return response.data;
}

// ============================================
// WEBHOOK VERIFICATION
// ============================================

export function verifyWebhookSignature(
  signature: string,
  secretHash: string
): boolean {
  return signature === secretHash;
}

// ============================================
// FEE CALCULATION
// ============================================

export function calculateFees(
  grossAmount: number,
  paymentMethod: 'card' | 'momo' | 'bank'
): {
  platformFee: number;
  providerFee: number;
  netAmount: number;
} {
  // Flutterwave fees vary by country and method
  // These are approximate Ghana rates
  let providerFeePercent = 0;
  let providerFeeFlat = 0;

  switch (paymentMethod) {
    case 'card':
      providerFeePercent = 0.035; // 3.5%
      break;
    case 'momo':
      providerFeePercent = 0.015; // 1.5%
      break;
    case 'bank':
      providerFeeFlat = 1000; // GHS 10
      break;
  }

  const providerFee = Math.round(grossAmount * providerFeePercent + providerFeeFlat);
  const platformFee = Math.round(grossAmount * PLATFORM_FEE_PERCENT);
  const netAmount = grossAmount - platformFee - providerFee;

  return { platformFee, providerFee, netAmount };
}

// ============================================
// SUBACCOUNT (For formal businesses only)
// ============================================

export interface CreateSubaccountParams {
  businessName: string;
  email: string;
  country: string;
  accountBank: string;
  accountNumber: string;
  splitType: 'percentage' | 'flat';
  splitValue: number;
  photographerId: string;
}

export interface FlutterwaveSubaccount {
  id: number;
  subaccount_id: string;
  account_bank: string;
  account_number: string;
  business_name: string;
  country: string;
  split_type: string;
  split_value: number;
  created_at: string;
}

export async function createSubaccount(
  params: CreateSubaccountParams
): Promise<FlutterwaveSubaccount> {
  const response = await flutterwaveRequest<{
    status: string;
    message: string;
    data: FlutterwaveSubaccount;
  }>('/subaccounts', {
    method: 'POST',
    body: JSON.stringify({
      account_bank: params.accountBank,
      account_number: params.accountNumber,
      business_name: params.businessName,
      business_email: params.email,
      country: params.country,
      split_type: params.splitType,
      split_value: params.splitValue,
      business_mobile: '',
      meta: [{ photographer_id: params.photographerId }],
    }),
  });

  return response.data;
}

export async function getSubaccount(subaccountId: string): Promise<FlutterwaveSubaccount> {
  const response = await flutterwaveRequest<{
    status: string;
    data: FlutterwaveSubaccount;
  }>(`/subaccounts/${subaccountId}`);

  return response.data;
}

export async function deleteSubaccount(subaccountId: string): Promise<void> {
  await flutterwaveRequest(`/subaccounts/${subaccountId}`, {
    method: 'DELETE',
  });
}
