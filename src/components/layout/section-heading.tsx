import { cn } from '@/lib/utils'

type SectionHeadingProps = {
  eyebrow: string
  title: string
  lead?: string
  action?: React.ReactNode
  className?: string
  headingId?: string
}

export function SectionHeading({
  eyebrow,
  title,
  lead,
  action,
  className,
  headingId,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-6 md:flex-row md:items-end md:justify-between',
        className,
      )}
    >
      <div className="flex max-w-2xl flex-col gap-3">
        <p className="flex items-center gap-3 font-mono text-xs tracking-[0.14em] text-vanadium-600 uppercase">
          <span aria-hidden="true" className="h-px w-6 bg-vanadium-400" />
          {eyebrow}
        </p>
        <h2
          id={headingId}
          className="text-3xl font-semibold text-foreground sm:text-4xl"
        >
          {title}
        </h2>
        {lead ? (
          <p className="text-base leading-relaxed text-vanadium-700 sm:text-lg">
            {lead}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
