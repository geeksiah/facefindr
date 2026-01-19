'use client';

import { ChevronDown } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, children, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          className={cn(
            'appearance-none w-full px-4 py-2.5 pr-10 rounded-xl',
            'bg-card border border-border text-foreground',
            'text-sm font-medium',
            'transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-0 focus:border-transparent',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted',
            'hover:border-accent/50',
            error && 'border-destructive focus:ring-destructive',
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        <div className="absolute right-0 top-0 bottom-0 flex items-center justify-center pointer-events-none pr-3">
          <ChevronDown 
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform duration-200',
              'group-hover:text-foreground'
            )}
            aria-hidden="true"
          />
        </div>
      </div>
    );
  }
);

Select.displayName = 'Select';

export { Select };
