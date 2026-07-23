export function formatShortDate(isoDate: string): string {
  const d = new Date(isoDate)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatWeekday(isoDate: string): string {
  const d = new Date(isoDate)
  return d.toLocaleDateString('en-US', { weekday: 'short' })
}

export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}
