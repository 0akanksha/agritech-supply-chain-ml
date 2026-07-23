import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { createCropCycle, deleteCropCycle, fetchCropCycles, fetchCrops, fetchRegions } from '@/lib/api'
import { formatInr, formatShortDate } from '@/lib/format'
import type { Crop, CropCycle, Region } from '@/types'
import CropCycleStatusBadge from '@/components/CropCycleStatusBadge'

export default function CropCycles() {
  const [cropCycles, setCropCycles] = useState<CropCycle[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [crops, setCrops] = useState<Crop[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [regionIdInput, setRegionIdInput] = useState('')
  const [cropIdInput, setCropIdInput] = useState('')
  const [labelInput, setLabelInput] = useState('')
  const [areaInput, setAreaInput] = useState('')
  const [sowingDateInput, setSowingDateInput] = useState('')
  const [expectedHarvestDateInput, setExpectedHarvestDateInput] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    Promise.all([fetchCropCycles(), fetchRegions(), fetchCrops()])
      .then(([{ cropCycles: cycles }, regionList, cropList]) => {
        setCropCycles(cycles)
        setRegions(regionList)
        setCrops(cropList)
        if (regionList.length > 0) setRegionIdInput(regionList[0].id)
        if (cropList.length > 0) setCropIdInput(cropList[0].id)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load your crop cycles'))
      .finally(() => setLoading(false))
  }, [])

  const handleCreate = async () => {
    if (!regionIdInput || !cropIdInput || !sowingDateInput) {
      setError('Region, crop, and sowing date are required.')
      return
    }
    const area = areaInput.trim() ? Number(areaInput) : undefined
    if (area !== undefined && (!Number.isFinite(area) || area <= 0)) {
      setError('Enter a valid area greater than 0.')
      return
    }
    setCreating(true)
    try {
      const { cropCycle } = await createCropCycle({
        regionId: regionIdInput,
        cropId: cropIdInput,
        label: labelInput.trim() || undefined,
        areaAcres: area,
        sowingDate: sowingDateInput,
        expectedHarvestDate: expectedHarvestDateInput || undefined,
      })
      setCropCycles((prev) => [cropCycle, ...prev])
      setShowCreateForm(false)
      setLabelInput('')
      setAreaInput('')
      setSowingDateInput('')
      setExpectedHarvestDateInput('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create that crop cycle')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await deleteCropCycle(id)
      setCropCycles((prev) => prev.filter((c) => c.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove that crop cycle')
    } finally {
      setDeletingId(null)
    }
  }

  const regionsById = Object.fromEntries(regions.map((r) => [r.id, r]))
  const cropsById = Object.fromEntries(crops.map((c) => [c.id, c]))

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-ink)]">Crop Cycles</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Track each planting-to-harvest run and what it costs you.
          </p>
        </div>
        {!loading && cropCycles.length > 0 && !showCreateForm && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-brand-dark)]"
          >
            + New crop cycle
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-[var(--color-risk-high)]/30 bg-[var(--color-risk-high)]/10 px-4 py-3 text-sm text-[var(--color-risk-high)]">
          {error}
        </div>
      )}

      {showCreateForm && (
        <div className="mt-6 rounded-2xl border border-[var(--color-line)] bg-white p-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Start a crop cycle
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <select
              value={regionIdInput}
              onChange={(e) => setRegionIdInput(e.target.value)}
              className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm"
            >
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}, {r.state}
                </option>
              ))}
            </select>
            <select
              value={cropIdInput}
              onChange={(e) => setCropIdInput(e.target.value)}
              className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm"
            >
              {crops.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              placeholder="Label (optional)"
              className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm"
            />
            <input
              type="number"
              min="0"
              step="0.1"
              value={areaInput}
              onChange={(e) => setAreaInput(e.target.value)}
              placeholder="Area in acres (optional)"
              className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm"
            />
            <label className="flex flex-col gap-1 text-xs text-[var(--color-ink-soft)]">
              Sowing date
              <input
                type="date"
                value={sowingDateInput}
                onChange={(e) => setSowingDateInput(e.target.value)}
                className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-ink)]"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--color-ink-soft)]">
              Expected harvest date (optional)
              <input
                type="date"
                value={expectedHarvestDateInput}
                onChange={(e) => setExpectedHarvestDateInput(e.target.value)}
                className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-ink)]"
              />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-brand-dark)] disabled:opacity-60"
            >
              {creating ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => setShowCreateForm(false)}
              className="rounded-lg border border-[var(--color-line)] px-4 py-2 text-sm font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-paper-soft)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="mt-6 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-[var(--color-paper-soft)]" />
          ))}
        </div>
      ) : cropCycles.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-[var(--color-line)] bg-white p-6 text-sm text-[var(--color-ink-soft)]">
          You haven't started tracking any crop cycles yet.{' '}
          {!showCreateForm && (
            <button onClick={() => setShowCreateForm(true)} className="font-medium text-[var(--color-brand)]">
              Start one now
            </button>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {cropCycles.map((cycle) => {
            const region = regionsById[cycle.regionId]
            const crop = cropsById[cycle.cropId]
            return (
              <div key={cycle.id} className="rounded-2xl border border-[var(--color-line)] bg-white p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-[var(--color-ink)]">
                        {cycle.label ?? `${crop?.name ?? cycle.cropId} · ${region?.name ?? cycle.regionId}`}
                      </p>
                      <CropCycleStatusBadge status={cycle.status} />
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                      {crop?.name ?? cycle.cropId} in {region ? `${region.name}, ${region.state}` : cycle.regionId}
                      {cycle.areaAcres !== null && ` · ${cycle.areaAcres} acres`}
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                      Sown {formatShortDate(cycle.sowingDate)}
                      {cycle.expectedHarvestDate && ` · expected harvest ${formatShortDate(cycle.expectedHarvestDate)}`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <p className="text-lg font-semibold text-[var(--color-ink)]">{formatInr(cycle.totalSpent)}</p>
                    <span className="text-xs text-[var(--color-ink-soft)]">spent so far</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-[var(--color-line)] pt-3">
                  <Link to={`/crop-cycles/${cycle.id}`} className="text-sm font-medium text-[var(--color-brand)]">
                    View expenses →
                  </Link>
                  <button
                    onClick={() => handleDelete(cycle.id)}
                    disabled={deletingId === cycle.id}
                    className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-sm font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-paper-soft)] disabled:opacity-60"
                  >
                    {deletingId === cycle.id ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
