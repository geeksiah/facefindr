import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; action: string } }
) {
  try {
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
      'delete-face': 'users.delete',
      'export-data': 'users.view',
      'assign-vault-subscription': 'settings.update',
      'assign-credits': 'settings.update',
    };

    const requiredPermission = permissionMap[action];
    if (requiredPermission && !(await hasPermission(requiredPermission))) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    switch (action) {
      case 'assign-vault-subscription': {
        const body = await request.json().catch(() => ({}));
        const rawPlanId = String(body?.planId || '').trim();
        const rawPlanSlug = String(body?.planSlug || '').trim().toLowerCase();
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
          .from('storage_plans')
          .select('id, slug, name, currency, price_monthly, price_yearly, is_active')
          .eq('is_active', true)
          .limit(1);

        if (rawPlanId) {
          planQuery = planQuery.eq('id', rawPlanId);
        } else if (rawPlanSlug) {
          planQuery = planQuery.eq('slug', rawPlanSlug);
        } else {
          return NextResponse.json({ error: 'planId or planSlug is required' }, { status: 400 });
        }

        const { data: plan, error: planError } = await planQuery.maybeSingle();
        if (planError || !plan) {
          return NextResponse.json({ error: 'Storage plan not found' }, { status: 404 });
        }

        const now = new Date();
        const periodEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
        const nowIso = now.toISOString();
        const periodEndIso = periodEnd.toISOString();
        const pricePaid = Number(
          billingCycle === 'annual' ? plan.price_yearly ?? plan.price_monthly ?? 0 : plan.price_monthly ?? 0
        );
        const safePricePaid = Number.isFinite(pricePaid) ? pricePaid : 0;
        const currency = String(plan.currency || 'USD').toUpperCase();

        await supabaseAdmin
          .from('storage_subscriptions')
          .update({
            status: 'cancelled',
            cancelled_at: nowIso,
            updated_at: nowIso,
          })
          .eq('user_id', id)
          .eq('status', 'active');

        const { error: insertError } = await supabaseAdmin
          .from('storage_subscriptions')
          .insert({
            user_id: id,
            plan_id: plan.id,
            billing_cycle: billingCycle,
            price_paid: safePricePaid,
            currency,
            status: 'active',
            started_at: nowIso,
            current_period_start: nowIso,
            current_period_end: periodEndIso,
            payment_provider: 'admin_manual',
            amount_cents: Math.max(0, Math.round(safePricePaid * 100)),
            metadata: {
              source: 'admin_manual',
              assigned_by_admin_id: session.adminId,
              assigned_duration_days: durationDays,
            },
          });

        if (insertError) {
          return NextResponse.json({ error: insertError.message }, { status: 500 });
        }

        const { error: syncLimitsError } = await supabaseAdmin.rpc('sync_subscription_limits', {
          p_user_id: id,
        });
        if (syncLimitsError) {
          console.warn('sync_subscription_limits failed after admin vault assignment', syncLimitsError);
        }

        await logAction('vault_subscription_assign', 'attendee', id, {
          plan_id: plan.id,
          plan_slug: plan.slug,
          billing_cycle: billingCycle,
          duration_days: durationDays,
          currency,
        });

        return NextResponse.json({
          success: true,
          plan: { id: plan.id, slug: plan.slug, name: plan.name },
          currentPeriodEnd: periodEndIso,
        });
      }

      case 'assign-credits': {
        const body = await request.json().catch(() => ({}));
        const credits = Number.parseInt(String(body?.credits ?? body?.creditsDelta ?? ''), 10);
        const reason = String(body?.reason || '').trim() || null;
        const currency = String(body?.currency || 'USD').trim().toUpperCase();

        if (!Number.isFinite(credits) || credits <= 0) {
          return NextResponse.json({ error: 'credits must be a positive integer' }, { status: 400 });
        }

        const { data: newBalance, error: creditsError } = await supabaseAdmin.rpc(
          'increment_attendee_drop_in_credits',
          {
            p_attendee_id: id,
            p_credits_delta: credits,
          }
        );

        if (creditsError) {
          return NextResponse.json({ error: creditsError.message }, { status: 500 });
        }

        const { error: auditPurchaseError } = await supabaseAdmin
          .from('drop_in_credit_purchases')
          .insert({
            attendee_id: id,
            pack_id: null,
            credits_purchased: credits,
            credits_remaining: credits,
            amount_paid: 0,
            currency,
            status: 'active',
            payment_intent_id: `admin_manual_${Date.now()}`,
          });

        if (auditPurchaseError) {
          console.warn('Failed to insert admin manual credit purchase audit row', auditPurchaseError);
        }

        await logAction('attendee_credit_assign', 'attendee', id, {
          credits,
          reason,
          new_balance: newBalance ?? null,
        });

        return NextResponse.json({
          success: true,
          creditsAssigned: credits,
          newBalance: newBalance ?? null,
        });
      }

      case 'suspend': {
        await supabaseAdmin
          .from('attendees')
          .update({ status: 'suspended' })
          .eq('id', id);

        await logAction('user_suspend', 'attendee', id, { action: 'suspend' });
        return NextResponse.json({ success: true });
      }

      case 'unsuspend': {
        await supabaseAdmin
          .from('attendees')
          .update({ status: 'active' })
          .eq('id', id);

        await logAction('user_unsuspend', 'attendee', id, { action: 'unsuspend' });
        return NextResponse.json({ success: true });
      }

      case 'delete-face': {
        // Delete face embeddings
        await supabaseAdmin
          .from('user_face_embeddings')
          .delete()
          .eq('user_id', id);

        // Delete face matches
        await supabaseAdmin
          .from('face_matches')
          .delete()
          .eq('attendee_id', id);

        // Update attendee to mark face as deleted
        await supabaseAdmin
          .from('attendees')
          .update({ last_face_refresh: null })
          .eq('id', id);

        await logAction('user_delete', 'attendee', id, { action: 'delete-face' });
        return NextResponse.json({ success: true });
      }

      case 'export-data': {
        // GDPR data export - gather all user data
        const [
          { data: attendee },
          { data: transactions },
          { data: entitlements },
          { data: consents },
          { data: faceMatches },
        ] = await Promise.all([
          supabaseAdmin.from('attendees').select('*').eq('id', id).single(),
          supabaseAdmin.from('transactions').select('*').eq('attendee_id', id),
          supabaseAdmin.from('entitlements').select('*').eq('attendee_id', id),
          supabaseAdmin.from('consents').select('*').eq('user_id', id),
          supabaseAdmin.from('face_matches').select('id, event_id, confidence, created_at').eq('attendee_id', id),
        ]);

        const exportData = {
          exportDate: new Date().toISOString(),
          profile: attendee,
          transactions: transactions || [],
          entitlements: entitlements || [],
          consents: consents || [],
          faceMatches: faceMatches || [],
        };

        await logAction('user_verify', 'attendee', id, { action: 'export-data' });

        return new NextResponse(JSON.stringify(exportData, null, 2), {
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="attendee-data-${id}.json"`,
          },
        });
      }

      case 'delete': {
        // Delete user from Supabase Auth (cascade will handle the rest)
        const { error } = await supabaseAdmin.auth.admin.deleteUser(id);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        await logAction('user_delete', 'attendee', id);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Attendee action error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
