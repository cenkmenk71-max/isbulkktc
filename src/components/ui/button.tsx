import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[background-color,border-color,box-shadow,transform,color] duration-220 ease-premium outline-none select-none focus-visible:ring-3 focus-visible:ring-shade-green-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'border-shade-green-950/20 bg-primary text-primary-foreground shadow-green hover:-translate-y-px hover:bg-action-primary-hover hover:shadow-green-hover active:translate-y-0 active:bg-action-primary-active',
        outline:
          'border-border bg-card text-foreground shadow-xs hover:border-vanadium-300 hover:bg-vanadium-100 aria-expanded:bg-vanadium-100',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-crayon-200 aria-expanded:bg-crayon-200',
        soft: 'bg-accent text-accent-foreground hover:bg-shade-green-200',
        ghost:
          'text-vanadium-700 hover:bg-vanadium-100 hover:text-foreground aria-expanded:bg-vanadium-100 aria-expanded:text-foreground',
        inverse:
          'border-crayon-highlight/15 bg-crayon-highlight text-vanadium-950 shadow-sm hover:-translate-y-px hover:bg-crayon-50 active:translate-y-0',
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:ring-destructive/30',
        link: 'text-action-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 gap-1.5 px-3.5',
        xs: "h-6 gap-1 rounded-md px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 text-[0.8125rem] [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-11 gap-2 rounded-xl px-5 text-[0.9375rem]',
        xl: 'h-12 gap-2 rounded-xl px-6 text-base',
        icon: 'size-9',
        'icon-xs': "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8 rounded-md',
        'icon-lg': 'size-11 rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
