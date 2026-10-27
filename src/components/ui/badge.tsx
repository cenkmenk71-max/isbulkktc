import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        neutral: 'border-border bg-vanadium-50 text-vanadium-700',
        outline: 'border-border bg-transparent text-vanadium-700',
        accent: 'border-shade-green-200 bg-accent text-accent-foreground',
        success: 'border-transparent bg-status-success-bg text-status-success',
        warning: 'border-transparent bg-status-warning-bg text-status-warning',
        error: 'border-transparent bg-status-error-bg text-status-error',
        info: 'border-transparent bg-status-info-bg text-status-info',
        inverse: 'border-crayon-highlight/15 bg-crayon-highlight/10 text-crayon-highlight',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
