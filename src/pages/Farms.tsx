import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteSavedFarm, fetchCrops, fetchPrediction, fetchRegions, fetchSavedFarms, updateFarmAlert } from '@/lib/api'
import type { AlertDirection, Crop, Prediction, Region, SavedFarm } from '@/types'
import RiskBadge from '@/components/RiskBadge'

function isAlertTriggered(farm: SavedFarm, prediction: Prediction | undefined): boolean {
  if (farm.alertPrice === null || farm.alertDirection === null || !prediction) return false
  const price = prediction.currentPriceRsPerQuintal
  return farm.alertDirection === 'above' ? price >= farm.alertPrice : price <= farm.alertPrice
}

export default function Farms() {
  const [farms, setFarms] = useState<SavedFarm[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [crops, setCrops] = useState<Crop[]>([])
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingAlertId, setEditingAlertId] = useState<string | null>(null)
  const [alertPriceInput, setAlertPriceInput] = useState('')
  const [alertDirectionInput, setAlertDirectionInput] = useState<AlertDirection>('above')
  const [savingAlertId, setSavingAlertId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchSavedFarms(), fetchRegions(), fetchCrops()])
      .then(async ([{ farms: savedFarms }, regionList, cropList]) => {
        setFarms(savedFarms)
        setRegions(regionList)
        setCrops(cropList)

        const entries = await Promise.all(
          savedFarms.map(async (farm) => [farm.id, await fetchPrediction(farm.regionId, farm.cropId)] as const),
        )
        setPredictions(Object.fromEntries(entries))
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load your farms'))
      .finally(() => setLoading(false))
  }, [])

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await deleteSavedFarm(id)
      setFarms((prev) => prev.filter((f) => f.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove that farm')
    } finally {
      setDeletingId(null)
    }
  }

  const startEditingAlert = (farm: SavedFarm) => {
    setEditingAlertId(farm.id)
    setAlertPriceInput(farm.alertPrice !== null ? String(farm.alertPrice) : '')
    setAlertDirectionInput(farm.alertDirection ?? 'above')
  }

  const handleSaveAlert = async (id: string) => {
    const price = Number(alertPriceInput)
    if (!alertPriceInput.trim() || !Number.isFinite(price) || price <= 0) {
      setError('Enter a valid alert price greater than 0.')
      return
    }
    setSavingAlertId(id)
    try {
      const { farm } = await updateFarmAlert(id, { alertPrice: price, alertDirection: alertDirectionInput })
      setFarms((prev) => prev.map((f) => (f.id === id ? farm : f)))
      setEditingAlertId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save that alert')
    } finally {
      setSavingAlertId(null)
    }
  }

  const handleClearAlert = async (id: string) => {
    setSavingAlertId(id)
    try {
      const { farm } = await updateFarmAlert(id, { alertPrice: null, alertDirection: null })
      setFarms((prev) => prev.map((f) => (f.id === id ? farm : f)))
      setEditingAlertId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to clear that alert')
    } finally {
      setSavingAlertId(null)
    }
  }

  const regionsById = Object.fromEntries(regions.map((r) => [r.id, r]))
  const cropsById = Object.fromEntries(crops.map((c) => [c.id, c]))

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-bold text-[var(--color-ink)]">My Farms</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Region/crop combinations you've saved from the dashboard, with their current bottleneck risk.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-[var(--color-risk-high)]/30 bg-[var(--color-risk-high)]/10 px-4 py-3 text-sm text-[var(--color-risk-high)]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-6 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-[var(--color-paper-soft)]" />
          ))}
        </div>
      ) : farms.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-[var(--color-line)] bg-white p-6 text-sm text-[var(--color-ink-soft)]">
          You haven't saved any farms yet.{' '}
          <Link to="/" className="font-medium text-[var(--color-brand)]">
            Go to the dashboard
          </Link>{' '}
          and click "Save this farm" for a region/crop you want to keep an eye on.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {farms.map((farm) => {
            const region = regionsById[farm.regionId]
            const crop = cropsById[farm.cropId]
            const prediction = predictions[farm.id]
            const triggered = isAlertTriggered(farm, prediction)
            const isEditingAlert = editingAlertId === farm.id
            return (
              <div key={farm.id} className="rounded-2xl border border-[var(--color-line)] bg-white p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-[var(--color-ink)]">
                      {farm.label ?? `${crop?.name ?? farm.cropId} · ${region?.name ?? farm.regionId}`}
                    </p>
                    <p className="text-sm text-[var(--color-ink-soft)]">
                      {crop?.name ?? farm.cropId} in {region ? `${region.name}, ${region.state}` : farm.regionId}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    {prediction ? (
                      <div className="flex items-center gap-2">
                        <RiskBadge level={prediction.riskLevel} />
                        <span className="text-sm text-[var(--color-ink-soft)]">{prediction.riskScore}/100</span>
                      </div>
                    ) : (
                      <div className="h-6 w-24 animate-pulse rounded-full bg-[var(--color-paper-soft)]" />
                    )}
                    <button
                      onClick={() => handleDelete(farm.id)}
                      disabled={deletingId === farm.id}
                      className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-sm font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-paper-soft)] disabled:opacity-60"
                    >
                      {deletingId === farm.id ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                </div>

                <div className="mt-3 border-t border-[var(--color-line)] pt-3">
                  {triggered && (
                    <p className="mb-2 inline-block rounded-full bg-[var(--color-risk-high)]/10 px-3 py-1 text-xs font-semibold text-[var(--color-risk-high)]">
                      Alert triggered — current price ₹{prediction?.currentPriceRsPerQuintal.toLocaleString('en-IN')}
                      /quintal is {farm.alertDirection} ₹{farm.alertPrice?.toLocaleString('en-IN')}
                    </p>
                  )}

                  {isEditingAlert ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={alertDirectionInput}
                        onChange={(e) => setAlertDirectionInput(e.target.value as AlertDirection)}
                        className="rounded-lg border border-[var(--color-line)] px-2 py-1.5 text-sm"
                      >
                        <option value="above">Alert when price goes above</option>
                        <option value="below">Alert when price goes below</option>
                      </select>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={alertPriceInput}
                        onChange={(e) => setAlertPriceInput(e.target.value)}
                        placeholder="₹ per quintal"
                        className="w-32 rounded-lg border border-[var(--color-line)] px-2 py-1.5 text-sm"
                      />
                      <button
                        onClick={() => handleSaveAlert(farm.id)}
                        disabled={savingAlertId === farm.id}
                        className="rounded-lg bg-[var(--color-brand)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                      >
                        {savingAlertId === farm.id ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditingAlertId(null)}
                        className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-sm font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-paper-soft)]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : farm.alertPrice !== null && farm.alertDirection !== null ? (
                    <div className="flex items-center gap-3 text-sm text-[var(--color-ink-soft)]">
                      <span>
                        Alert set: notify when price goes {farm.alertDirection} ₹
                        {farm.alertPrice.toLocaleString('en-IN')}/quintal
                      </span>
                      <button
                        onClick={() => startEditingAlert(farm)}
                        className="font-medium text-[var(--color-brand)]"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleClearAlert(farm.id)}
                        disabled={savingAlertId === farm.id}
                        className="font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-risk-high)] disabled:opacity-60"
                      >
                        Clear
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEditingAlert(farm)}
                      className="text-sm font-medium text-[var(--color-brand)]"
                    >
                      + Set a price alert
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
