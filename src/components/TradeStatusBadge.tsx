import type { TradeStatus } from '@/types'

const STATUS_STYLES: Record<TradeStatus, { bg: string; text: string; label: string }> = {
  proposed: { bg: 'bg-[var(--color-accent)]/10', text: 'text-[var(--color-accent)]', label: 'Proposed' },
  accepted: { bg: 'bg-[var(--color-brand)]/10', text: 'text-[var(--color-brand)]', label: 'Accepted' },
  rejected: { bg: 'bg-[var(--color-risk-high)]/10', text: 'text-[var(--color-risk-high)]', label: 'Rejected' },
  cancelled: { bg: 'bg-[var(--color-ink-soft)]/10', text: 'text-[var(--color-ink-soft)]', label: 'Cancelled' },
  completed: { bg: 'bg-[var(--color-risk-low)]/10', text: 'text-[var(--color-risk-low)]', label: 'Completed' },
}

export default function TradeStatusBadge({ status }: { status: TradeStatus }) {
  const style = STATUS_STYLES[status]
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${style.bg} ${style.text}`}>{style.label}</span>
  )
}
