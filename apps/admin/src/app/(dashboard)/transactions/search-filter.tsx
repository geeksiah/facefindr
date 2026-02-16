'use client';

import { Search, X, Download } from 'lucide-react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useState, useCallback } from 'react';

interface SearchFilterProps {
  searchParams: {
    search?: string;
    status?: string;
    provider?: string;
  };
  total: number;
}

export function SearchFilter({ searchParams, total }: SearchFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const safePathname = pathname ?? '';
  const params = useSearchParams();
  const [search, setSearch] = useState(searchParams.search || '');

  const updateParams = useCallback((key: string, value: string | null) => {
    const newParams = new URLSearchParams((params?.toString() ?? ''));
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    newParams.delete('page');
    router.push(`${pathname}?${newParams.toString()}`);
  }, [params, pathname, router]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateParams('search', search || null);
  };

  const clearFilters = () => {
    setSearch('');
    router.push(safePathname);
  };

  const handleExport = async () => {
    const response = await fetch(`/api/admin/transactions/export?${(params?.toString() ?? '')}`);
    if (response.ok) {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const hasFilters = searchParams.search || searchParams.status || searchParams.provider;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <form onSubmit={handleSearch} className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by transaction ID..."
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-muted border border-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </form>

        <select
          value={searchParams.status || ''}
          onChange={(e) => updateParams('status', e.target.value || null)}
          className="px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
        >
          <option value="">All Statuses</option>
          <option value="succeeded">Succeeded</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
        </select>

        <select
          value={searchParams.provider || ''}
          onChange={(e) => updateParams('provider', e.target.value || null)}
          className="px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
        >
          <option value="">All Providers</option>
          <option value="stripe">Stripe</option>
          <option value="flutterwave">Flutterwave</option>
          <option value="paypal">PayPal</option>
        </select>

        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
        >
          <Download className="h-4 w-4" />
          Export
        </button>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {total} transaction{total !== 1 ? 's' : ''} found
        </span>
        {hasFilters && (
          <button onClick={clearFilters} className="flex items-center gap-1 text-primary hover:underline">
            <X className="h-3 w-3" />
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}


