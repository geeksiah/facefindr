'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  name?: string;
  className?: string;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    {
      checked: controlledChecked,
      defaultChecked = false,
      onCheckedChange,
      disabled = false,
      id,
      name,
      className,
    },
    ref
  ) => {
    const [internalChecked, setInternalChecked] = React.useState(defaultChecked);
    
    // Support both controlled and uncontrolled modes
    const isControlled = controlledChecked !== undefined;
    const checked = isControlled ? controlledChecked : internalChecked;

    const handleClick = () => {
      if (disabled) return;
      
      const newValue = !checked;
      
      if (!isControlled) {
        setInternalChecked(newValue);
      }
      
      onCheckedChange?.(newValue);
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
            'peer inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'disabled:cursor-not-allowed disabled:opacity-50',
            // Background color based on state
            checked 
              ? 'bg-accent' // Accent blue when ON
              : 'bg-secondary', // Gray when OFF
            className
          )}
        >
          <span
            className={cn(
              'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out',
              checked ? 'translate-x-5' : 'translate-x-0.5'
            )}
          />
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
