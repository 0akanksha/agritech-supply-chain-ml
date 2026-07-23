import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  createExpense,
  deleteExpense,
  fetchCropCycle,
  fetchCrops,
  fetchExpenses,
  fetchRegions,
  updateCropCycle,
} from '@/lib/api'
import { formatInr, formatShortDate } from '@/lib/format'
import type { Crop, CropCycle, Expense, ExpenseCategory, Region } from '@/types'
import CropCycleStatusBadge from '@/components/CropCycleStatusBadge'

const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'seeds', label: 'Seeds' },
  { value: 'fertilizer', label: 'Fertilizer' },
  { value: 'pesticide', label: 'Pesticide' },
  { value: 'labor', label: 'Labor' },
  { value: 'irrigation', label: 'Irrigation' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'transport', label: 'Transport' },
  { value: 'land_rent', label: 'Land rent' },
  { value: 'storage', label: 'Storage' },
  { value: 'other', label: 'Other' },
]

const CATEGORY_LABELS = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.value, c.label])) as Record<
  ExpenseCategory,
  string
>

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function CropCycleDetail() {
  const { id } = useParams<{ id: string }>()

  const [cycle, setCycle] = useState<CropCycle | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [crops, setCrops] = useState<Crop[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState(false)

  const [showAddExpenseForm, setShowAddExpenseForm] = useState(false)
  const [categoryInput, setCategoryInput] = useState<ExpenseCategory>('seeds')
  const [amountInput, setAmountInput] = useState('')
  const [expenseDateInput, setExpenseDateInput] = useState(todayIsoDate())
  const [noteInput, setNoteInput] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([fetchCropCycle(id), fetchExpenses(id), fetchRegions(), fetchCrops()])
      .then(([{ cropCycle: fetchedCycle }, { expenses: fetchedExpenses }, regionList, cropList]) => {
        setCycle(fetchedCycle)
        setExpenses(fetchedExpenses)
        setRegions(regionList)
        setCrops(cropList)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load this crop cycle'))
      .finally(() => setLoading(false))
  }, [id])

  const handleAddExpense = async () => {
    if (!id) return
    const amount = Number(amountInput)
    if (!amountInput.trim() || !Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid amount greater than 0.')
      return
    }
    if (!expenseDateInput) {
      setError('Pick a date for this expense.')
      return
    }
    setSubmitting(true)
    try {
      const { expense } = await createExpense({
        cropCycleId: id,
        category: categoryInput,
        amount,
        expenseDate: expenseDateInput,
        note: noteInput.trim() || undefined,
      })
      setExpenses((prev) => [expense, ...prev])
      setCycle((prev) => (prev ? { ...prev, totalSpent: prev.totalSpent + expense.amount } : prev))
      setShowAddExpenseForm(false)
      setAmountInput('')
      setNoteInput('')
      setExpenseDateInput(todayIsoDate())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add that expense')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteExpense = async (expenseId: string) => {
    setDeletingId(expenseId)
    try {
      await deleteExpense(expenseId)
      setExpenses((prev) => {
        const removed = prev.find((e) => e.id === expenseId)
        if (removed) {
          setCycle((c) => (c ? { ...c, totalSpent: c.totalSpent - removed.amount } : c))
        }
        return prev.filter((e) => e.id !== expenseId)
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove that expense')
    } finally {
      setDeletingId(null)
    }
  }

  const handleMarkHarvested = async () => {
    if (!id) return
    setUpdatingStatus(true)
    try {
      const { cropCycle: updated } = await updateCropCycle(id, {
        status: 'harvested',
        actualHarvestDate: todayIsoDate(),
      })
      setCycle(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update this crop cycle')
    } finally {
      setUpdatingStatus(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-[var(--color-paper-soft)]" />
          ))}
        </div>
      </div>
    )
  }

  if (!cycle) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10">
        {error && (
          <div className="rounded-lg border border-[var(--color-risk-high)]/30 bg-[var(--color-risk-high)]/10 px-4 py-3 text-sm text-[var(--color-risk-high)]">
            {error}
          </div>
        )}
        <Link to="/crop-cycles" className="mt-4 inline-block text-sm font-medium text-[var(--color-brand)]">
          ← Back to crop cycles
        </Link>
      </div>
    )
  }

  const region = regions.find((r) => r.id === cycle.regionId)
  const crop = crops.find((c) => c.id === cycle.cropId)

  const categoryTotals = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount
    return acc
  }, {})

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <Link to="/crop-cycles" className="text-sm font-medium text-[var(--color-brand)]">
        ← Back to crop cycles
      </Link>

      {error && (
        <div className="mt-4 rounded-lg border border-[var(--color-risk-high)]/30 bg-[var(--color-risk-high)]/10 px-4 py-3 text-sm text-[var(--color-risk-high)]">
          {error}
        </div>
      )}

      <div className="mt-4 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[var(--color-ink)]">
              {cycle.label ?? `${crop?.name ?? cycle.cropId} · ${region?.name ?? cycle.regionId}`}
            </h1>
            <CropCycleStatusBadge status={cycle.status} />
          </div>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            {crop?.name ?? cycle.cropId} in {region ? `${region.name}, ${region.state}` : cycle.regionId}
            {cycle.areaAcres !== null && ` · ${cycle.areaAcres} acres`}
          </p>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Sown {formatShortDate(cycle.sowingDate)}
            {cycle.expectedHarvestDate && ` · expected harvest ${formatShortDate(cycle.expectedHarvestDate)}`}
            {cycle.actualHarvestDate && ` · harvested ${formatShortDate(cycle.actualHarvestDate)}`}
          </p>
        </div>
        {cycle.status === 'active' && (
          <button
            onClick={handleMarkHarvested}
            disabled={updatingStatus}
            className="rounded-lg border border-[var(--color-brand)] px-4 py-2 text-sm font-medium text-[var(--color-brand)] hover:bg-[var(--color-brand-soft)] disabled:opacity-60"
          >
            {updatingStatus ? 'Saving…' : 'Mark as harvested'}
          </button>
        )}
      </div>

      <div className="mt-6 rounded-2xl border border-[var(--color-line)] bg-white p-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">Total spend</p>
        <p className="mt-1 text-3xl font-bold text-[var(--color-ink)]">{formatInr(cycle.totalSpent)}</p>
        {cycle.areaAcres !== null && (
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            {formatInr(cycle.totalSpent / cycle.areaAcres)}/acre
          </p>
        )}

        {Object.keys(categoryTotals).length > 0 && (
          <div className="mt-4 space-y-2 border-t border-[var(--color-line)] pt-4">
            {Object.entries(categoryTotals)
              .sort(([, a], [, b]) => b - a)
              .map(([category, total]) => (
                <div key={category} className="flex justify-between text-sm">
                  <span className="text-[var(--color-ink-soft)]">
                    {CATEGORY_LABELS[category as ExpenseCategory] ?? category}
                  </span>
                  <span className="font-medium text-[var(--color-ink)]">{formatInr(total)}</span>
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">Expenses</p>
        {!showAddExpenseForm && (
          <button onClick={() => setShowAddExpenseForm(true)} className="text-sm font-medium text-[var(--color-brand)]">
            + Add expense
          </button>
        )}
      </div>

      {showAddExpenseForm && (
        <div className="mt-3 rounded-2xl border border-[var(--color-line)] bg-white p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <select
              value={categoryInput}
              onChange={(e) => setCategoryInput(e.target.value as ExpenseCategory)}
              className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="₹ amount"
              className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={expenseDateInput}
              onChange={(e) => setExpenseDateInput(e.target.value)}
              className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-ink)]"
            />
            <input
              type="text"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Note (optional)"
              className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm"
            />
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleAddExpense}
              disabled={submitting}
              className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-brand-dark)] disabled:opacity-60"
            >
              {submitting ? 'Saving…' : 'Add'}
            </button>
            <button
              onClick={() => setShowAddExpenseForm(false)}
              className="rounded-lg border border-[var(--color-line)] px-4 py-2 text-sm font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-paper-soft)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {expenses.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-[var(--color-line)] bg-white p-6 text-sm text-[var(--color-ink-soft)]">
          No expenses logged for this crop cycle yet.
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {expenses.map((expense) => (
            <div
              key={expense.id}
              className="flex items-center justify-between rounded-2xl border border-[var(--color-line)] bg-white px-5 py-3"
            >
              <div>
                <p className="text-sm font-medium text-[var(--color-ink)]">
                  {CATEGORY_LABELS[expense.category]} · {formatInr(expense.amount)}
                </p>
                <p className="text-xs text-[var(--color-ink-soft)]">
                  {formatShortDate(expense.expenseDate)}
                  {expense.note && ` · ${expense.note}`}
                </p>
              </div>
              <button
                onClick={() => handleDeleteExpense(expense.id)}
                disabled={deletingId === expense.id}
                className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-sm font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-paper-soft)] disabled:opacity-60"
              >
                {deletingId === expense.id ? 'Removing…' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
