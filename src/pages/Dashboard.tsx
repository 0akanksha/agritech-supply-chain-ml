import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, fetchCropHealth, fetchCrops, fetchPrediction, fetchPrices, fetchRegions, fetchWeather, saveFarm } from '@/lib/api'
import type { Crop, CropHealthPoint, Prediction, PricePoint, Region, WeatherPoint } from '@/types'
import { useAuth } from '@/context/AuthContext'
import WeatherPanel from '@/components/WeatherPanel'
import CropHealthPanel from '@/components/CropHealthPanel'
import PriceTrendChart from '@/components/PriceTrendChart'
import RiskAlert from '@/components/RiskAlert'

export default function Dashboard() {
  const { currentUser } = useAuth()
  const navigate = useNavigate()

  const [regions, setRegions] = useState<Region[]>([])
  const [crops, setCrops] = useState<Crop[]>([])
  const [regionId, setRegionId] = useState<string>('')
  const [cropId, setCropId] = useState<string>('')

  const [weather, setWeather] = useState<WeatherPoint[]>([])
  const [cropHealth, setCropHealth] = useState<CropHealthPoint[]>([])
  const [prices, setPrices] = useState<PricePoint[]>([])
  const [prediction, setPrediction] = useState<Prediction | null>(null)

  const [loadingOptions, setLoadingOptions] = useState(true)
  const [loadingData, setLoadingData] = useState(false)
  const [loadingPrediction, setLoadingPrediction] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [predictionError, setPredictionError] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchRegions(), fetchCrops()])
      .then(([regionList, cropList]) => {
        setRegions(regionList)
        setCrops(cropList)
        setRegionId(regionList[0]?.id ?? '')
        setCropId(cropList[0]?.id ?? '')
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load options'))
      .finally(() => setLoadingOptions(false))
  }, [])

  useEffect(() => {
    if (!regionId || !cropId) return
    setLoadingData(true)
    setError(null)
    setSaveMessage(null)
    Promise.all([fetchWeather(regionId), fetchCropHealth(regionId, cropId), fetchPrices(regionId, cropId)])
      .then(([weatherData, healthData, priceData]) => {
        setWeather(weatherData)
        setCropHealth(healthData)
        setPrices(priceData)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load chart data'))
      .finally(() => setLoadingData(false))

    // Fetched separately: a region/crop with no trained model yet (503) is an expected,
    // recoverable state — it shouldn't blank out the charts above, which load independently.
    setLoadingPrediction(true)
    setPrediction(null)
    setPredictionError(null)
    fetchPrediction(regionId, cropId)
      .then(setPrediction)
      .catch((e: unknown) =>
        setPredictionError(e instanceof ApiError ? e.message : 'Failed to load the risk prediction'),
      )
      .finally(() => setLoadingPrediction(false))
  }, [regionId, cropId])

  const handleSaveFarm = async () => {
    if (!currentUser) {
      navigate('/login', { state: { from: '/' } })
      return
    }
    setSaving(true)
    setSaveMessage(null)
    try {
      await saveFarm({ regionId, cropId })
      setSaveMessage('Saved to My Farms.')
    } catch (e) {
      setSaveMessage(e instanceof ApiError ? e.message : 'Failed to save this farm.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--color-line)] bg-white">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-brand)]">
            Predictive AgriTech Supply Chains
          </p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--color-ink)]">Regional bottleneck dashboard</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Weather (Open-Meteo) and crop health (NASA MODIS satellite NDVI) are real. Mandi prices
            are placeholder demo data until a data.gov.in API key is connected (real Agmarknet data
            will automatically replace it) — see the README roadmap.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col text-sm">
            <span className="mb-1 font-medium text-[var(--color-ink-soft)]">Region</span>
            <select
              className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2"
              value={regionId}
              disabled={loadingOptions}
              onChange={(e) => setRegionId(e.target.value)}
            >
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}, {r.state}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col text-sm">
            <span className="mb-1 font-medium text-[var(--color-ink-soft)]">Crop</span>
            <select
              className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2"
              value={cropId}
              disabled={loadingOptions}
              onChange={(e) => setCropId(e.target.value)}
            >
              {crops.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col justify-end">
            <button
              onClick={handleSaveFarm}
              disabled={saving || loadingOptions || !regionId || !cropId}
              className="rounded-lg border border-[var(--color-brand)] px-4 py-2 text-sm font-medium text-[var(--color-brand)] hover:bg-[var(--color-brand-soft)] disabled:opacity-60"
            >
              {saving ? 'Saving…' : currentUser ? 'Save this farm' : 'Log in to save this farm'}
            </button>
          </div>
        </div>

        {saveMessage && <p className="mt-2 text-sm text-[var(--color-ink-soft)]">{saveMessage}</p>}

        {error && (
          <div className="mt-4 rounded-lg border border-[var(--color-risk-high)]/30 bg-[var(--color-risk-high)]/10 px-4 py-3 text-sm text-[var(--color-risk-high)]">
            {error}
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <WeatherPanel data={weather} loading={loadingData} />
            <CropHealthPanel data={cropHealth} loading={loadingData} />
            <div className="sm:col-span-2">
              <PriceTrendChart data={prices} loading={loadingData} />
            </div>
          </div>
          <div>
            <RiskAlert prediction={prediction} loading={loadingPrediction} error={predictionError} />
          </div>
        </div>
      </main>
    </div>
  )
}
