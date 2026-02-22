import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getWebAppUrl } from '@/lib/urls';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; action: string } }
) {
  try {
    const webAppUrl = getWebAppUrl();

    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, action } = params;

    // Check permissions
    const permissionMap: Record<string, string> = {
      suspend: 'users.suspend',
      unsuspend: 'users.suspend',
      delete: 'users.delete',
      verify: 'users.verify',
      'reset-password': 'users.verify',
      'send-verification': 'users.verify',
      'assign-subscription': 'settings.update',
    };

    const requiredPermission = permissionMap[action];
    if (requiredPermission && !(await hasPermission(requiredPermission))) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    switch (action) {
      case 'assign-subscription': {
        const body = await request.json().catch(() => ({}));
        const rawPlanId = String(body?.planId || '').trim();
        const rawPlanCode = String(body?.planCode || '').trim();
        const rawBillingCycle = String(body?.billingCycle || 'monthly').trim().toLowerCase();
        const billingCycle = rawBillingCycle === 'annual' || rawBillingCycle === 'yearly' ? 'annual' : 'monthly';
        const requestedDurationDays = Number(body?.durationDays);
        const durationDays =
          Number.isFinite(requestedDurationDays) && requestedDurationDays >= 1 && requestedDurationDays <= 3650
            ? Math.round(requestedDurationDays)
            : billingCycle === 'annual'
            ? 365
            : 30;

        let planQuery = supabaseAdmin
          .from('subscription_plans')
          .select('id, code, name, plan_type, base_price_usd, prices, is_active')
          .eq('is_active', true)
          .limit(1);

        if (rawPlanId) {
          planQuery = planQuery.eq('id', rawPlanId);
        } else if (rawPlanCode) {
          planQuery = planQuery.eq('code', rawPlanCode);
        } else {
          return NextResponse.json({ error: 'planId or planCode is required' }, { status: 400 });
        }

        const { data: plan, error: planError } = await planQuery.maybeSingle();
        if (planError || !plan) {
          return NextResponse.json({ error: 'Creator plan not found' }, { status: 404 });
        }

        const normalizedPlanType = String(plan.plan_type || '').toLowerCase();
        if (normalizedPlanType === 'drop_in' || normalizedPlanType === 'payg') {
          return NextResponse.json({ error: 'Selected plan is not a creator subscription plan' }, { status: 400 });
        }

        const prices = (plan.prices as Record<string, number> | null) || {};
        const currency = String(body?.currency || 'USD').trim().toUpperCase();
        const fallbackAmount =
          currency === 'USD'
            ? Number(plan.base_price_usd || 0)
            : Number(prices[currency] ?? prices.USD ?? plan.base_price_usd ?? 0);
        const requestedAmountCents = Number(body?.amountCents);
        const amountCents = Number.isFinite(requestedAmountCents)
          ? Math.max(0, Math.round(requestedAmountCents))
          : Math.max(0, Math.round(fallbackAmount));

        const now = new Date();
        const periodEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
        const nowIso = now.toISOString();
        const periodEndIso = periodEnd.toISOString();

        const { data: existingSub, error: existingSubError } = await supabaseAdmin
          .from('subscriptions')
          .select('id')
          .eq('photographer_id', id)
          .maybeSingle();

        if (existingSubError && existingSubError.code !== 'PGRST116') {
          return NextResponse.json({ error: existingSubError.message }, { status: 500 });
        }

        const subscriptionPayload = {
          plan_code: plan.code,
          plan_id: plan.id,
          status: 'active',
          current_period_start: nowIso,
          current_period_end: periodEndIso,
          cancel_at_period_end: false,
          canceled_at: null,
          billing_cycle: billingCycle,
          currency,
          amount_cents: amountCents,
          payment_provider: 'admin_manual',
          external_subscription_id: null,
          external_plan_id: null,
          metadata: {
            source: 'admin_manual',
            assigned_by_admin_id: session.adminId,
            assigned_duration_days: durationDays,
          },
          updated_at: nowIso,
        };

        let writeError: any = null;
        if (existingSub?.id) {
          const { error: updateError } = await supabaseAdmin
            .from('subscriptions')
            .update(subscriptionPayload)
            .eq('id', existingSub.id);
          writeError = updateError;
        } else {
          const { error: insertError } = await supabaseAdmin
            .from('subscriptions')
            .insert({
              photographer_id: id,
              ...subscriptionPayload,
            });
          writeError = insertError;
        }

        if (writeError) {
          return NextResponse.json({ error: writeError.message }, { status: 500 });
        }

        await logAction('creator_subscription_assign', 'photographer', id, {
          plan_id: plan.id,
          plan_code: plan.code,
          billing_cycle: billingCycle,
          duration_days: durationDays,
          amount_cents: amountCents,
          currency,
        });

        return NextResponse.json({
          success: true,
          subscription: {
            planCode: plan.code,
            currentPeriodEnd: periodEndIso,
            billingCycle,
            amountCents,
            currency,
          },
        });
      }

      case 'suspend': {
        await supabaseAdmin
          .from('photographers')
          .update({ status: 'suspended' })
          .eq('id', id);

        await logAction('user_suspend', 'photographer', id, { action: 'suspend' });
        return NextResponse.json({ success: true });
      }

      case 'unsuspend': {
        await supabaseAdmin
          .from('photographers')
          .update({ status: 'active' })
          .eq('id', id);

        await logAction('user_unsuspend', 'photographer', id, { action: 'unsuspend' });
        return NextResponse.json({ success: true });
      }

      case 'verify': {
        await supabaseAdmin
          .from('photographers')
          .update({ 
            email_verified: true,
            status: 'active',
          })
          .eq('id', id);

        await logAction('user_verify', 'photographer', id);
        return NextResponse.json({ success: true });
      }

      case 'reset-password': {
        // Get photographer email
        const { data: photographer } = await supabaseAdmin
          .from('photographers')
          .select('email')
          .eq('id', id)
          .single();

        if (!photographer) {
          return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
        }

        // Generate password reset via Supabase Auth
        const { error } = await supabaseAdmin.auth.admin.generateLink({
          type: 'recovery',
          email: photographer.email,
          options: {
            redirectTo: `${webAppUrl}/reset-password?from=admin`,
          },
        });

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        await logAction('user_verify', 'photographer', id, { action: 'reset-password' });
        return NextResponse.json({ success: true });
      }

      case 'send-verification': {
        // Get photographer email
        const { data: photographer } = await supabaseAdmin
          .from('photographers')
          .select('email')
          .eq('id', id)
          .single();

        if (!photographer) {
          return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
        }

        // Send verification email via Supabase Auth
        const { error } = await supabaseAdmin.auth.admin.generateLink({
          type: 'magiclink',
          email: photographer.email,
          options: {
            redirectTo: `${webAppUrl}/auth/callback`,
          },
        });

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        await logAction('user_verify', 'photographer', id, { action: 'send-verification' });
        return NextResponse.json({ success: true });
      }

      case 'delete': {
        // Delete user from Supabase Auth (cascade will handle the rest)
        const { error } = await supabaseAdmin.auth.admin.deleteUser(id);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        await logAction('user_delete', 'photographer', id);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Creator action error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
