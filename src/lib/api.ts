import type {
  AlertDirection,
  Crop,
  CropCycle,
  CropCycleStatus,
  CropHealthPoint,
  EtlRun,
  Expense,
  ExpenseCategory,
  Forecast,
  Prediction,
  PricePoint,
  Region,
  SavedFarm,
  Trade,
  TradeListing,
  TradeStatus,
  TrainingRun,
  User,
  WeatherPoint,
} from '@/types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (res.status === 204) return undefined as T

  const data = await res.json().catch(() => undefined)
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`)
  }
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

// --- ML dashboard data (proxied through Express to the Python ML service) ---

export function fetchRegions(): Promise<Region[]> {
  return api.get('/api/ml/regions')
}

export function fetchCrops(): Promise<Crop[]> {
  return api.get('/api/ml/crops')
}

export function fetchWeather(region: string): Promise<WeatherPoint[]> {
  return api.get(`/api/ml/weather?region=${encodeURIComponent(region)}`)
}

export function fetchForecast(region: string): Promise<Forecast> {
  return api.get(`/api/ml/forecast?region=${encodeURIComponent(region)}`)
}

export function fetchCropHealth(region: string, crop: string): Promise<CropHealthPoint[]> {
  return api.get(`/api/ml/satellite?region=${encodeURIComponent(region)}&crop=${encodeURIComponent(crop)}`)
}

export function fetchPrices(region: string, crop: string): Promise<PricePoint[]> {
  return api.get(`/api/ml/prices?region=${encodeURIComponent(region)}&crop=${encodeURIComponent(crop)}`)
}

export function fetchPrediction(region: string, crop: string): Promise<Prediction> {
  return api.get(`/api/ml/predict?region=${encodeURIComponent(region)}&crop=${encodeURIComponent(crop)}`)
}

// --- Auth ---

export function signup(input: { fullName: string; email: string; password: string }): Promise<{ user: User }> {
  return api.post('/api/auth/signup', input)
}

export function login(input: { email: string; password: string }): Promise<{ user: User }> {
  return api.post('/api/auth/login', input)
}

export function logout(): Promise<void> {
  return api.post('/api/auth/logout')
}

export function fetchCurrentUser(): Promise<{ user: User }> {
  return api.get('/api/auth/me')
}

// --- Saved farms ---

export function fetchSavedFarms(): Promise<{ farms: SavedFarm[] }> {
  return api.get('/api/farms')
}

export function saveFarm(input: { regionId: string; cropId: string; label?: string }): Promise<{ farm: SavedFarm }> {
  return api.post('/api/farms', input)
}

export function deleteSavedFarm(id: string): Promise<void> {
  return api.delete(`/api/farms/${id}`)
}

// In-app only (no SMS/email infra) — sets or clears the price threshold that highlights this
// saved farm on the My Farms page. Pass both null to clear an existing alert.
export function updateFarmAlert(
  id: string,
  alert: { alertPrice: number | null; alertDirection: AlertDirection | null },
): Promise<{ farm: SavedFarm }> {
  return api.patch(`/api/farms/${id}`, alert)
}

// --- Crop cycles & expenses ---

export function fetchCropCycles(): Promise<{ cropCycles: CropCycle[] }> {
  return api.get('/api/crop-cycles')
}

export function fetchCropCycle(id: string): Promise<{ cropCycle: CropCycle }> {
  return api.get(`/api/crop-cycles/${id}`)
}

export function createCropCycle(input: {
  regionId: string
  cropId: string
  label?: string
  areaAcres?: number
  sowingDate: string
  expectedHarvestDate?: string
}): Promise<{ cropCycle: CropCycle }> {
  return api.post('/api/crop-cycles', input)
}

export function updateCropCycle(
  id: string,
  input: Partial<{
    status: CropCycleStatus
    actualHarvestDate: string | null
    label: string | null
    notes: string | null
  }>,
): Promise<{ cropCycle: CropCycle }> {
  return api.patch(`/api/crop-cycles/${id}`, input)
}

export function deleteCropCycle(id: string): Promise<void> {
  return api.delete(`/api/crop-cycles/${id}`)
}

export function fetchExpenses(cropCycleId?: string): Promise<{ expenses: Expense[] }> {
  return api.get(cropCycleId ? `/api/expenses?cropCycleId=${encodeURIComponent(cropCycleId)}` : '/api/expenses')
}

export function createExpense(input: {
  cropCycleId: string
  category: ExpenseCategory
  amount: number
  expenseDate: string
  note?: string
}): Promise<{ expense: Expense }> {
  return api.post('/api/expenses', input)
}

export function deleteExpense(id: string): Promise<void> {
  return api.delete(`/api/expenses/${id}`)
}

// --- Trade marketplace ---

export function fetchTradeListings(scope: 'open' | 'mine' = 'open'): Promise<{ tradeListings: TradeListing[] }> {
  return api.get(`/api/trade-listings?scope=${scope}`)
}

export function fetchTradeListing(id: string): Promise<{ tradeListing: TradeListing }> {
  return api.get(`/api/trade-listings/${id}`)
}

export function createTradeListing(input: {
  regionId: string
  cropId: string
  cropCycleId?: string
  quantityQuintal: number
  askPriceRsPerQuintal: number
  notes?: string
}): Promise<{ tradeListing: TradeListing }> {
  return api.post('/api/trade-listings', input)
}

export function cancelTradeListing(id: string): Promise<{ tradeListing: TradeListing }> {
  return api.patch(`/api/trade-listings/${id}`, { status: 'cancelled' })
}

export function fetchTrades(listingId?: string): Promise<{ trades: Trade[] }> {
  return api.get(listingId ? `/api/trades?listingId=${encodeURIComponent(listingId)}` : '/api/trades')
}

export function createTrade(input: {
  listingId: string
  quantityQuintal: number
  pricePerQuintal: number
}): Promise<{ trade: Trade }> {
  return api.post('/api/trades', input)
}

export function updateTradeStatus(
  id: string,
  status: Exclude<TradeStatus, 'proposed'>,
): Promise<{ trade: Trade }> {
  return api.patch(`/api/trades/${id}`, { status })
}

// --- Admin: ETL + training triggers and status ---

export function fetchEtlStatus(): Promise<{ runs: EtlRun[] }> {
  return api.get('/api/admin/etl/status')
}

export function runEtl(): Promise<{ status: string }> {
  return api.post('/api/admin/etl/run')
}

export function runTraining(): Promise<{ status: string }> {
  return api.post('/api/admin/train/run')
}

export function fetchTrainingRuns(): Promise<{ runs: TrainingRun[] }> {
  return api.get('/api/admin/runs')
}
