import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { CropHealthPoint } from '@/types'
import { formatShortDate } from '@/lib/format'

interface Props {
  data: CropHealthPoint[]
  loading: boolean
}

export default function CropHealthPanel({ data, loading }: Props) {
  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
        Crop health (satellite NDVI) — last 12 months
      </h2>
      {loading ? (
        <div className="mt-4 h-56 animate-pulse rounded-lg bg-[var(--color-paper-soft)]" />
      ) : (
        <div className="mt-2 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={4} tickFormatter={formatShortDate} />
              <YAxis domain={[0, 1]} tick={{ fontSize: 10 }} />
              <Tooltip labelFormatter={(v) => `Date: ${v}`} />
              <Area type="monotone" dataKey="ndvi" name="NDVI" stroke="#2f6b3c" fill="#2f6b3c33" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
