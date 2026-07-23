import type { TradeListingStatus } from '@/types'

const STATUS_STYLES: Record<TradeListingStatus, { bg: string; text: string; label: string }> = {
  open: { bg: 'bg-[var(--color-brand)]/10', text: 'text-[var(--color-brand)]', label: 'Open' },
  closed: { bg: 'bg-[var(--color-risk-low)]/10', text: 'text-[var(--color-risk-low)]', label: 'Closed' },
  cancelled: { bg: 'bg-[var(--color-risk-high)]/10', text: 'text-[var(--color-risk-high)]', label: 'Cancelled' },
}

export default function TradeListingStatusBadge({ status }: { status: TradeListingStatus }) {
  const style = STATUS_STYLES[status]
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${style.bg} ${style.text}`}>{style.label}</span>
  )
}
