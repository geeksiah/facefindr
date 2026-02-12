export const dynamic = 'force-dynamic';

/**
 * Analytics API
 * 
 * Get dashboard stats and analytics data for photographers.
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  getDashboardStats,
  getTimeSeriesData,
  getTopEvents,
  getDeviceBreakdown,
  getTrafficSources,
  getRecentActivity,
  getRealtimeStats,
  TimeRange,
} from '@/lib/analytics';
import { createClient } from '@/lib/supabase/server';

// GET - Get analytics data
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is a photographer
    const { data: photographer } = await supabase
      .from('photographers')
      .select('id')
      .eq('id', user.id)
      .single();

    if (!photographer) {
      return NextResponse.json({ error: 'Not a photographer' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const timeRange = (searchParams.get('range') || '30d') as TimeRange;
    const eventId = searchParams.get('eventId') || undefined;
    const type = searchParams.get('type') || 'dashboard';

    switch (type) {
      case 'dashboard':
        const [stats, timeSeries, topEvents, devices, traffic] = await Promise.all([
          getDashboardStats(user.id, timeRange),
          getTimeSeriesData(user.id, timeRange, eventId),
          getTopEvents(user.id, 5),
          getDeviceBreakdown(user.id, timeRange),
          getTrafficSources(user.id, timeRange),
        ]);

        return NextResponse.json({
          stats,
          timeSeries,
          topEvents,
          devices,
          traffic,
        });

      case 'stats':
        const dashboardStats = await getDashboardStats(user.id, timeRange);
        return NextResponse.json({ stats: dashboardStats });

      case 'timeseries':
        const timeSeriesData = await getTimeSeriesData(user.id, timeRange, eventId);
        return NextResponse.json({ timeSeries: timeSeriesData });

      case 'events':
        const metric = (searchParams.get('metric') || 'views') as 'views' | 'revenue' | 'conversion';
        const limit = parseInt(searchParams.get('limit') || '5');
        const events = await getTopEvents(user.id, limit, metric);
        return NextResponse.json({ events });

      case 'devices':
        const deviceData = await getDeviceBreakdown(user.id, timeRange);
        return NextResponse.json({ devices: deviceData });

      case 'traffic':
        const trafficData = await getTrafficSources(user.id, timeRange);
        return NextResponse.json({ traffic: trafficData });

      case 'activity':
        const activityLimit = parseInt(searchParams.get('limit') || '10');
        const activity = await getRecentActivity(user.id, activityLimit);
        return NextResponse.json({ activity });

      case 'realtime':
        const realtime = await getRealtimeStats(user.id);
        return NextResponse.json({ realtime });

      default:
        return NextResponse.json(
          { error: 'Invalid type' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Analytics GET error:', error);
    return NextResponse.json(
      { error: 'Failed to get analytics' },
      { status: 500 }
    );
  }
}

