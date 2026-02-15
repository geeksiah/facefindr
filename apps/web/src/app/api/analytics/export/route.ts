export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

function parseDateForDisplay(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  }
  return new Date(value);
}

function formatDateDisplay(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parseDateForDisplay(value));
}

/**
 * Export Analytics Data
 * Supports PDF and CSV export
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { format, timeRange, stats, timeSeries, topEvents, devices, traffic } = body;

    if (format === 'csv') {
      // CSV export
      const csvRows: string[][] = [
        ['Analytics Export', `Time Range: ${timeRange}`, `Generated: ${new Date().toISOString()}`],
        [],
        ['Summary Statistics', 'Value'],
        ['Total Views', stats.totalViews.toString()],
        ['Unique Views', stats.uniqueViews.toString()],
        ['Total Revenue', `$${(stats.totalRevenue / 100).toFixed(2)}`],
        ['Total Sales', stats.totalSales.toString()],
        ['Total Downloads', stats.totalDownloads.toString()],
        ['Conversion Rate', `${stats.conversionRate.toFixed(1)}%`],
        [],
        ['Time Series Data'],
        ['Date', 'Views', 'Revenue', 'Sales', 'Downloads'],
        ...timeSeries.map((d: any) => [
          formatDateDisplay(d.date),
          d.views.toString(),
          `$${(d.revenue / 100).toFixed(2)}`,
          d.sales.toString(),
          d.downloads.toString(),
        ]),
        [],
        ['Top Events'],
        ['Event Name', 'Event Date', 'Views', 'Revenue', 'Conversion Rate'],
        ...(topEvents || []).map((e: any) => [
          e.eventName,
          formatDateDisplay(e.eventDate),
          e.totalViews.toString(),
          `$${(e.totalRevenue / 100).toFixed(2)}`,
          `${e.conversionRate.toFixed(1)}%`,
        ]),
        [],
        ['Device Breakdown'],
        ['Device Type', 'Count', 'Percentage'],
        ['Mobile', devices.mobile.toString(), `${((devices.mobile / (devices.mobile + devices.desktop + devices.tablet)) * 100).toFixed(1)}%`],
        ['Desktop', devices.desktop.toString(), `${((devices.desktop / (devices.mobile + devices.desktop + devices.tablet)) * 100).toFixed(1)}%`],
        ['Tablet', devices.tablet.toString(), `${((devices.tablet / (devices.mobile + devices.desktop + devices.tablet)) * 100).toFixed(1)}%`],
      ];

      const csvContent = csvRows
        .map((row: string[]) => row.map((cell: string) => `"${cell}"`).join(','))
        .join('\n');
      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv;charset=utf-8',
          'Content-Disposition': `attachment; filename="analytics-${timeRange}-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    if (format === 'pdf') {
      // For PDF, we'll return a simple HTML that can be printed to PDF
      // In production, use a library like puppeteer or @react-pdf/renderer
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Analytics Report - ${timeRange}</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; }
              h1 { color: #333; }
              table { width: 100%; border-collapse: collapse; margin: 20px 0; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f2f2f2; }
            </style>
          </head>
          <body>
            <h1>Analytics Report</h1>
            <p><strong>Time Range:</strong> ${timeRange}</p>
            <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
            
            <h2>Summary Statistics</h2>
            <table>
              <tr><th>Metric</th><th>Value</th></tr>
              <tr><td>Total Views</td><td>${stats.totalViews}</td></tr>
              <tr><td>Unique Views</td><td>${stats.uniqueViews}</td></tr>
              <tr><td>Total Revenue</td><td>$${(stats.totalRevenue / 100).toFixed(2)}</td></tr>
              <tr><td>Total Sales</td><td>${stats.totalSales}</td></tr>
              <tr><td>Total Downloads</td><td>${stats.totalDownloads}</td></tr>
              <tr><td>Conversion Rate</td><td>${stats.conversionRate.toFixed(1)}%</td></tr>
            </table>
            
            <h2>Time Series Data</h2>
            <table>
              <tr><th>Date</th><th>Views</th><th>Revenue</th><th>Sales</th><th>Downloads</th></tr>
              ${timeSeries.map((d: any) => `
                <tr>
                  <td>${formatDateDisplay(d.date)}</td>
                  <td>${d.views}</td>
                  <td>$${(d.revenue / 100).toFixed(2)}</td>
                  <td>${d.sales}</td>
                  <td>${d.downloads}</td>
                </tr>
              `).join('')}
            </table>
          </body>
        </html>
      `;

      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html',
          'Content-Disposition': `attachment; filename="analytics-${timeRange}-${new Date().toISOString().split('T')[0]}.html"`,
        },
      });
    }

    return NextResponse.json({ error: 'Invalid format' }, { status: 400 });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Failed to export analytics' },
      { status: 500 }
    );
  }
}

