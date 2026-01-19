'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onChange?: (checked: boolean) => void; // Alias for onCheckedChange
  disabled?: boolean;
  id?: string;
  name?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    {
      checked: controlledChecked,
      defaultChecked = false,
      onCheckedChange,
      onChange,
      disabled = false,
      id,
      name,
      className,
      size = 'md',
    },
    ref
  ) => {
    const [internalChecked, setInternalChecked] = React.useState(defaultChecked);
    
    // Support both controlled and uncontrolled modes
    const isControlled = controlledChecked !== undefined;
    const checked = isControlled ? controlledChecked : internalChecked;

    // Callback can be either onCheckedChange or onChange
    const callback = onCheckedChange || onChange;

    const handleClick = () => {
      if (disabled) return;
      
      const newValue = !checked;
      
      if (!isControlled) {
        setInternalChecked(newValue);
      }
      
      callback?.(newValue);
    };

    // Size variants
    const sizeClasses = {
      sm: 'h-5 w-9',
      md: 'h-7 w-12',
      lg: 'h-8 w-14',
    };

    const thumbSizes = {
      sm: 'h-3.5 w-3.5',
      md: 'h-5 w-5',
      lg: 'h-6 w-6',
    };

    const translateX = {
      sm: checked ? 'translate-x-4' : 'translate-x-0.5',
      md: checked ? 'translate-x-5' : 'translate-x-0.5',
      lg: checked ? 'translate-x-6' : 'translate-x-0.5',
    };

    return (
      <>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-disabled={disabled}
          id={id}
          ref={ref}
          onClick={handleClick}
          disabled={disabled}
          className={cn(
            // Base styles
            'switch-track peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent',
            // Focus states
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            // Disabled state
            'disabled:cursor-not-allowed disabled:opacity-50',
            // Size
            sizeClasses[size],
            // Background color based on state with smooth transition
            checked 
              ? 'bg-accent' // Accent blue when ON
              : 'bg-secondary/60', // Gray when OFF
            className
          )}
        >
          <span
            className={cn(
              // Base thumb styles
              'switch-thumb pointer-events-none block rounded-full bg-white shadow-lg ring-0',
              // Size
              thumbSizes[size],
              // Position with spring-like animation
              translateX[size]
            )}
          >
            {/* Optional checkmark icon for larger sizes */}
            {size === 'lg' && checked && (
              <svg 
                className="w-full h-full p-1 text-accent animate-check-draw"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </span>
        </button>
        {name && (
          <input
            type="checkbox"
            name={name}
            checked={checked}
            onChange={() => {}}
            className="sr-only"
            tabIndex={-1}
          />
        )}
      </>
    );
  }
);

Switch.displayName = 'Switch';

export { Switch };
