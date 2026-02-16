'use client';

import { Search, X } from 'lucide-react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useState, useCallback } from 'react';

interface SearchFilterProps {
  searchParams: {
    search?: string;
    status?: string;
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

  const hasFilters = searchParams.search || searchParams.status;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <form onSubmit={handleSearch} className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, or FaceTag..."
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-muted border border-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </form>

        {/* Status Filter */}
        <select
          value={searchParams.status || ''}
          onChange={(e) => updateParams('status', e.target.value || null)}
          className="px-4 py-2 rounded-lg bg-muted border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="pending_verification">Pending Verification</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {/* Results Count and Clear */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {total} attendee{total !== 1 ? 's' : ''} found
        </span>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-primary hover:underline"
          >
            <X className="h-3 w-3" />
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}


