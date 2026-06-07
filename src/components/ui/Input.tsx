import { cn } from '../../lib/utils'
import type { InputHTMLAttributes } from 'react'
import { forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label className="text-sm font-medium text-gray-700">{label}</label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            {...props}
            className={cn(
              'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400',
              'focus:outline-none focus:ring-2 focus:ring-celeste-300 focus:border-celeste-500',
              'disabled:bg-gray-50 disabled:text-gray-500',
              icon ? 'pl-9' : '',
              error ? 'border-coral-500 focus:ring-coral-300' : '',
              className,
            )}
          />
        </div>
        {error && <p className="text-xs text-coral-700">{error}</p>}
      </div>
    )
  },
)
Input.displayName = 'Input'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, className, children, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label className="text-sm font-medium text-gray-700">{label}</label>
        )}
        <select
          ref={ref}
          {...props}
          className={cn(
            'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800',
            'focus:outline-none focus:ring-2 focus:ring-celeste-300 focus:border-celeste-500',
            'disabled:bg-gray-50 disabled:text-gray-500',
            error ? 'border-coral-500 focus:ring-coral-300' : '',
            className,
          )}
        >
          {children}
        </select>
        {error && <p className="text-xs text-coral-700">{error}</p>}
      </div>
    )
  },
)
Select.displayName = 'Select'

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label className="text-sm font-medium text-gray-700">{label}</label>
        )}
        <textarea
          ref={ref}
          {...props}
          className={cn(
            'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400',
            'focus:outline-none focus:ring-2 focus:ring-celeste-300 focus:border-celeste-500',
            'disabled:bg-gray-50 disabled:text-gray-500 resize-none',
            error ? 'border-coral-500 focus:ring-coral-300' : '',
            className,
          )}
        />
        {error && <p className="text-xs text-coral-700">{error}</p>}
      </div>
    )
  },
)
Textarea.displayName = 'Textarea'
