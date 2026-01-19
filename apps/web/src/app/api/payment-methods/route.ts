/**
 * Payment Methods API
 * 
 * Manage user payment methods for subscriptions and purchases.
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  getUserPaymentMethods,
  addCard,
  addMobileMoney,
  addPayPal,
  setDefaultPaymentMethod,
  deletePaymentMethod,
  getSubscriptionSettings,
  updateSubscriptionSettings,
  getMobileMoneyProviders,
} from '@/lib/payments/payment-methods';
import { createClient } from '@/lib/supabase/server';

// GET - Get user's payment methods and settings
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all';

    if (type === 'providers') {
      const countryCode = searchParams.get('country') || 'GH';
      const providers = await getMobileMoneyProviders(countryCode);
      return NextResponse.json({ providers });
    }

    if (type === 'settings') {
      const settings = await getSubscriptionSettings(user.id);
      return NextResponse.json({ settings });
    }

    const [paymentMethods, subscriptionSettings] = await Promise.all([
      getUserPaymentMethods(user.id),
      getSubscriptionSettings(user.id),
    ]);

    return NextResponse.json({
      paymentMethods,
      subscriptionSettings,
    });

  } catch (error) {
    console.error('Payment methods GET error:', error);
    return NextResponse.json(
      { error: 'Failed to get payment methods' },
      { status: 500 }
    );
  }
}

// POST - Add new payment method
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type, setAsDefault } = body;

    switch (type) {
      case 'card': {
        const { stripePaymentMethodId } = body;
        if (!stripePaymentMethodId) {
          return NextResponse.json(
            { error: 'Stripe payment method ID required' },
            { status: 400 }
          );
        }

        const paymentMethod = await addCard(user.id, {
          stripePaymentMethodId,
          setAsDefault,
        });

        if (!paymentMethod) {
          return NextResponse.json(
            { error: 'Failed to add card' },
            { status: 400 }
          );
        }

        return NextResponse.json({ paymentMethod });
      }

      case 'mobile_money': {
        const { providerCode, phoneNumber } = body;
        if (!providerCode || !phoneNumber) {
          return NextResponse.json(
            { error: 'Provider and phone number required' },
            { status: 400 }
          );
        }

        const result = await addMobileMoney(user.id, {
          providerCode,
          phoneNumber,
          setAsDefault,
        });

        if (!result.success) {
          return NextResponse.json(
            { error: result.error },
            { status: 400 }
          );
        }

        return NextResponse.json({
          paymentMethod: result.paymentMethod,
          requiresVerification: result.requiresVerification,
        });
      }

      case 'paypal': {
        const { email, payerId } = body;
        if (!email) {
          return NextResponse.json(
            { error: 'PayPal email required' },
            { status: 400 }
          );
        }

        const paymentMethod = await addPayPal(user.id, {
          email,
          payerId,
          setAsDefault,
        });

        if (!paymentMethod) {
          return NextResponse.json(
            { error: 'Failed to add PayPal' },
            { status: 400 }
          );
        }

        return NextResponse.json({ paymentMethod });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid payment method type' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Payment methods POST error:', error);
    return NextResponse.json(
      { error: 'Failed to add payment method' },
      { status: 500 }
    );
  }
}

// PATCH - Update payment method or settings
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, methodId, settings } = body;

    if (action === 'setDefault') {
      if (!methodId) {
        return NextResponse.json(
          { error: 'Method ID required' },
          { status: 400 }
        );
      }

      const success = await setDefaultPaymentMethod(user.id, methodId);

      if (!success) {
        return NextResponse.json(
          { error: 'Failed to set default' },
          { status: 400 }
        );
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'updateSettings') {
      const success = await updateSubscriptionSettings(user.id, settings);

      if (!success) {
        return NextResponse.json(
          { error: 'Failed to update settings' },
          { status: 400 }
        );
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Payment methods PATCH error:', error);
    return NextResponse.json(
      { error: 'Failed to update' },
      { status: 500 }
    );
  }
}

// DELETE - Remove payment method
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const methodId = searchParams.get('id');

    if (!methodId) {
      return NextResponse.json(
        { error: 'Payment method ID required' },
        { status: 400 }
      );
    }

    const success = await deletePaymentMethod(user.id, methodId);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to delete payment method' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Payment methods DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to delete payment method' },
      { status: 500 }
    );
  }
}
