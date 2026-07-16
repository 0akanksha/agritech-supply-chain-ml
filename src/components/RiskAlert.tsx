import type { Prediction } from '@/types'
import RiskBadge from '@/components/RiskBadge'

interface Props {
  prediction: Prediction | null
  loading: boolean
  error?: string | null
}

export default function RiskAlert({ prediction, loading, error }: Props) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5">
        <div className="h-40 animate-pulse rounded-lg bg-[var(--color-paper-soft)]" />
      </div>
    )
  }

  if (error || !prediction) {
    return (
      <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
          Bottleneck risk
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-soft)]">
          {error ?? 'No prediction available for this region/crop yet.'}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
          Bottleneck risk
        </h2>
        <RiskBadge level={prediction.riskLevel} />
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-4xl font-bold text-[var(--color-ink)]">{prediction.riskScore}</span>
        <span className="text-sm text-[var(--color-ink-soft)]">/ 100</span>
      </div>

      {prediction.daysToBottleneck !== null && (
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Estimated {prediction.daysToBottleneck} days until the predicted bottleneck window.
        </p>
      )}

      <p className="mt-3 rounded-lg bg-[var(--color-brand-soft)] px-3 py-2.5 text-sm font-medium leading-relaxed text-[var(--color-brand-dark)]">
        {prediction.plainSummary}
      </p>

      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">Details</p>
      <p className="mt-1 text-sm leading-relaxed text-[var(--color-ink)]">{prediction.explanation}</p>

      <div className="mt-4 space-y-2">
        {prediction.factors.map((f) => (
          <div key={f.label}>
            <div className="flex justify-between text-xs text-[var(--color-ink-soft)]">
              <span>{f.label}</span>
              <span>{Math.round(f.contribution * 100)}%</span>
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-[var(--color-paper-soft)]">
              <div
                className="h-1.5 rounded-full bg-[var(--color-brand)]"
                style={{ width: `${Math.min(100, Math.round(f.contribution * 100))}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 border-t border-[var(--color-line)] pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Pest &amp; disease risk
          </h3>
          <RiskBadge level={prediction.pestDiseaseRisk.level} />
        </div>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink)]">{prediction.pestDiseaseRisk.message}</p>
      </div>
    </div>
  )
}
