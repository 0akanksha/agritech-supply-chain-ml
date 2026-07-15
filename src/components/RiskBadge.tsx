import type { RiskLevel } from '@/types'

const RISK_STYLES: Record<RiskLevel, { bg: string; text: string; label: string }> = {
  low: { bg: 'bg-[var(--color-risk-low)]/10', text: 'text-[var(--color-risk-low)]', label: 'Low risk' },
  medium: { bg: 'bg-[var(--color-risk-medium)]/10', text: 'text-[var(--color-risk-medium)]', label: 'Medium risk' },
  high: { bg: 'bg-[var(--color-risk-high)]/10', text: 'text-[var(--color-risk-high)]', label: 'High risk' },
}

export default function RiskBadge({ level }: { level: RiskLevel }) {
  const style = RISK_STYLES[level]
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${style.bg} ${style.text}`}>{style.label}</span>
  )
}
