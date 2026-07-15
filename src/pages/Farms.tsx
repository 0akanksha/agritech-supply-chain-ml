import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteSavedFarm, fetchCrops, fetchPrediction, fetchRegions, fetchSavedFarms } from '@/lib/api'
import type { Crop, Prediction, Region, SavedFarm } from '@/types'
import RiskBadge from '@/components/RiskBadge'

export default function Farms() {
  const [farms, setFarms] = useState<SavedFarm[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [crops, setCrops] = useState<Crop[]>([])
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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
            return (
              <div
                key={farm.id}
                className="flex items-center justify-between rounded-2xl border border-[var(--color-line)] bg-white p-5"
              >
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
            )
          })}
        </div>
      )}
    </div>
  )
}
