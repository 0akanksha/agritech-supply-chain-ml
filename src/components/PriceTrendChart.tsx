import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { PricePoint } from '@/types'
import { formatShortDate } from '@/lib/format'

interface Props {
  data: PricePoint[]
  loading: boolean
}

export default function PriceTrendChart({ data, loading }: Props) {
  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
        Mandi modal price (₹/quintal) — last 52 weeks
      </h2>
      {loading ? (
        <div className="mt-4 h-56 animate-pulse rounded-lg bg-[var(--color-paper-soft)]" />
      ) : (
        <div className="mt-2 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={8} tickFormatter={formatShortDate} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip labelFormatter={(v) => `Week of: ${v}`} />
              <Line
                type="monotone"
                dataKey="modalPriceRsPerQuintal"
                name="Modal price"
                stroke="#c9412e"
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
