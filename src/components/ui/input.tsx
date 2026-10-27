import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-11 w-full min-w-0 rounded-xl border border-input bg-card px-3.5 text-[0.9375rem] text-foreground shadow-xs transition-[border-color,box-shadow] duration-220 ease-premium outline-none placeholder:text-vanadium-600 focus-visible:border-shade-green-700 focus-visible:ring-3 focus-visible:ring-shade-green-400/40 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
