import type {
  Crop,
  CropHealthPoint,
  EtlRun,
  Prediction,
  PricePoint,
  Region,
  SavedFarm,
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
