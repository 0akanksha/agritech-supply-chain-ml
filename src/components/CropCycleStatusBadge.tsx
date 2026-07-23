import type { CropCycleStatus } from '@/types'

const STATUS_STYLES: Record<CropCycleStatus, { bg: string; text: string; label: string }> = {
  active: { bg: 'bg-[var(--color-brand)]/10', text: 'text-[var(--color-brand)]', label: 'Active' },
  harvested: { bg: 'bg-[var(--color-risk-low)]/10', text: 'text-[var(--color-risk-low)]', label: 'Harvested' },
  abandoned: { bg: 'bg-[var(--color-risk-high)]/10', text: 'text-[var(--color-risk-high)]', label: 'Abandoned' },
}

export default function CropCycleStatusBadge({ status }: { status: CropCycleStatus }) {
  const style = STATUS_STYLES[status]
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${style.bg} ${style.text}`}>{style.label}</span>
  )
}
