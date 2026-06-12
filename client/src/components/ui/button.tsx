import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 duration-200',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] text-primary-foreground hover:brightness-110 active:scale-98',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-98',
        outline:
          'border border-border bg-transparent text-[#0037b0] hover:bg-[#0037b0]/5 hover:text-[#0037b0] active:scale-98',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 active:scale-98',
        ghost: 'hover:bg-accent hover:text-accent-foreground active:scale-98',
        link: 'text-[#0037b0] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-6 text-sm font-semibold',
        sm: 'h-9 rounded-lg px-4 text-xs font-semibold',
        lg: 'h-12 rounded-xl px-8 text-base font-semibold',
        icon: 'h-11 w-11 rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <svg
            className="mr-2 h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : null}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
