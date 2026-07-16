import type { Forecast } from '@/types'
import { formatWeekday } from '@/lib/format'

interface Props {
  forecast: Forecast | null
  loading: boolean
  error?: string | null
}

export default function ForecastPanel({ forecast, loading, error }: Props) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5">
        <div className="h-40 animate-pulse rounded-lg bg-[var(--color-paper-soft)]" />
      </div>
    )
  }

  if (error || !forecast) {
    return (
      <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
          7-day forecast
        </h2>
        <p className="mt-3 text-sm text-[var(--color-ink-soft)]">{error ?? 'Forecast unavailable.'}</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
        7-day forecast
      </h2>

      <p className="mt-3 rounded-lg bg-[var(--color-brand-soft)] px-3 py-2.5 text-sm font-medium leading-relaxed text-[var(--color-brand-dark)]">
        {forecast.farmingTip}
      </p>

      <div className="mt-4 grid grid-cols-7 gap-2">
        {forecast.days.map((day) => (
          <div key={day.date} className="flex flex-col items-center rounded-xl bg-[var(--color-paper-soft)] p-2 text-center">
            <span className="text-xs font-semibold text-[var(--color-ink-soft)]">{formatWeekday(day.date)}</span>
            <span className="mt-1 text-2xl" title={day.conditionText}>
              {day.conditionEmoji}
            </span>
            <span className="mt-1 text-xs text-[var(--color-ink)]">
              {Math.round(day.tempMaxC)}° / {Math.round(day.tempMinC)}°
            </span>
            <span className="mt-0.5 text-xs text-[var(--color-accent)]">{Math.round(day.rainChancePct)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
