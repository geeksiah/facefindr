import { supabaseAdmin } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';
import Link from 'next/link';
import { Package, DollarSign, Globe, Truck } from 'lucide-react';

async function getPrintStats() {
  const [ordersResult, productsResult, regionsResult] = await Promise.all([
    supabaseAdmin
      .from('print_orders')
      .select('total_amount, status, currency'),
    supabaseAdmin
      .from('print_products')
      .select('id, name, is_active'),
    supabaseAdmin
      .from('print_regions')
      .select('id, name, is_active'),
  ]);

  const orders = ordersResult.data || [];
  const totalRevenue = orders
    .filter(o => o.status !== 'cancelled' && o.status !== 'refunded')
    .reduce((sum, o) => sum + (o.total_amount || 0), 0);
  
  const pendingOrders = orders.filter(o => 
    ['pending', 'processing', 'production'].includes(o.status)
  ).length;

  return {
    totalRevenue,
    totalOrders: orders.length,
    pendingOrders,
    activeProducts: productsResult.data?.filter(p => p.is_active).length || 0,
    totalProducts: productsResult.data?.length || 0,
    activeRegions: regionsResult.data?.filter(r => r.is_active).length || 0,
  };
}

async function getRecentOrders() {
  const { data } = await supabaseAdmin
    .from('print_orders')
    .select(`
      *,
      print_order_items (
        product_name,
        quantity
      )
    `)
    .order('created_at', { ascending: false })
    .limit(10);

  return data || [];
}

export default async function PrintProductsPage() {
  const [stats, recentOrders] = await Promise.all([
    getPrintStats(),
    getRecentOrders(),
  ]);

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-500/10 text-yellow-500',
    processing: 'bg-blue-500/10 text-blue-500',
    production: 'bg-purple-500/10 text-purple-500',
    shipped: 'bg-cyan-500/10 text-cyan-500',
    delivered: 'bg-green-500/10 text-green-500',
    cancelled: 'bg-red-500/10 text-red-500',
    refunded: 'bg-gray-500/10 text-gray-500',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Print Products</h1>
        <p className="text-muted-foreground mt-1">
          Manage print products, pricing, and fulfillment
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-500/10 p-2.5">
              <DollarSign className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Revenue</p>
              <p className="text-xl font-bold text-foreground">{formatCurrency(stats.totalRevenue)}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-500/10 p-2.5">
              <Package className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Orders</p>
              <p className="text-xl font-bold text-foreground">{stats.totalOrders}</p>
              <p className="text-xs text-muted-foreground">{stats.pendingOrders} pending</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-500/10 p-2.5">
              <Truck className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Products</p>
              <p className="text-xl font-bold text-foreground">{stats.activeProducts}</p>
              <p className="text-xs text-muted-foreground">of {stats.totalProducts} total</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-orange-500/10 p-2.5">
              <Globe className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active Regions</p>
              <p className="text-xl font-bold text-foreground">{stats.activeRegions}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Recent Orders</h2>
        </div>
        
        {recentOrders.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-muted-foreground">No orders yet</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Order #</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Items</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Total</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Status</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentOrders.map((order: any) => (
                <tr key={order.id} className="hover:bg-muted/30">
                  <td className="px-6 py-4">
                    <span className="font-mono text-foreground">{order.order_number}</span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-foreground">
                      {order.print_order_items?.reduce((sum: number, i: any) => sum + i.quantity, 0) || 0} items
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {order.print_order_items?.map((i: any) => i.product_name).join(', ')}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-foreground">
                    {formatCurrency(order.total_amount, order.currency)}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${statusColors[order.status]}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {formatDate(order.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
