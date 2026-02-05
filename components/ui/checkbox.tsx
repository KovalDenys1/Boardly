'use client'

import * as React from 'react'

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  onCheckedChange?: (checked: boolean) => void
  variant?: 'default' | 'success' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className = '', variant = 'default', size = 'md', checked, onCheckedChange, onChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(e)
      onCheckedChange?.(e.target.checked)
    }

    // Size classes
    const sizeClasses = {
      sm: 'h-4 w-4',
      md: 'h-5 w-5',
      lg: 'h-6 w-6',
    }

    // Variant classes
    const variantClasses = {
      default: 'border-gray-300 dark:border-gray-600 checked:bg-blue-600 checked:border-blue-600 hover:border-blue-500 dark:hover:border-blue-400',
      success: 'border-gray-300 dark:border-gray-600 checked:bg-green-600 checked:border-green-600 hover:border-green-500',
      danger: 'border-gray-300 dark:border-gray-600 checked:bg-red-600 checked:border-red-600 hover:border-red-500',
    }

    // Icon sizes
    const iconSizes = {
      sm: { width: '12px', height: '12px' },
      md: { width: '14px', height: '14px' },
      lg: { width: '18px', height: '18px' },
    }

    const baseClasses = 'peer relative shrink-0 rounded border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer appearance-none'

    return (
      <div className="relative inline-flex items-center justify-center">
        <input
          type="checkbox"
          ref={ref}
          checked={checked}
          onChange={handleChange}
          className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
          {...props}
        />
        {checked && (
          <svg
            className="pointer-events-none absolute text-white animate-scale-in"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={iconSizes[size]}
          >
            <path
              d="M13.3332 4L5.99984 11.3333L2.6665 8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    )
  }
)

Checkbox.displayName = 'Checkbox'

export { Checkbox }
