export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { getAllPlans } from '@/lib/subscription';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const planType = searchParams.get('type');
    const normalizedPlanType =
      planType === 'drop_in' || planType === 'creator' || planType === 'payg'
        ? planType
        : planType === 'photographer'
        ? 'creator'
        : undefined;

    const plans = await getAllPlans(normalizedPlanType);

    if (!plans || plans.length === 0) {
      return NextResponse.json(
        {
          error: 'No active plans are configured. Configure plans in admin pricing before using checkout.',
          failClosed: true,
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      plans: plans.map((plan) => ({
        id: plan.id,
        code: plan.code,
        name: plan.name,
        description: plan.description,
        planType: plan.planType,
        isActive: plan.isActive,
        prices: plan.prices,
        features: plan.featureValues,
      })),
      version: Date.now().toString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Runtime plans error:', error);
    return NextResponse.json(
      { error: 'Failed to load runtime plans', failClosed: true },
      { status: 500 }
    );
  }
}
