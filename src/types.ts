export interface Region {
  id: string
  name: string
  state: string
}

export interface Crop {
  id: string
  name: string
}

export interface WeatherPoint {
  date: string
  tempC: number
  rainfallMm: number
  humidityPct: number
}

export interface CropHealthPoint {
  date: string
  ndvi: number
}

export interface PricePoint {
  date: string
  modalPriceRsPerQuintal: number
}

export interface ForecastDay {
  date: string
  tempMaxC: number
  tempMinC: number
  rainfallMm: number
  rainChancePct: number
  conditionText: string
  conditionEmoji: string
}

export interface Forecast {
  region: string
  days: ForecastDay[]
  farmingTip: string
}

export type RiskLevel = 'low' | 'medium' | 'high'

export interface RiskFactor {
  label: string
  contribution: number
}

export interface Prediction {
  region: string
  crop: string
  riskLevel: RiskLevel
  riskScore: number
  daysToBottleneck: number | null
  explanation: string
  plainSummary: string
  factors: RiskFactor[]
}

export type UserRole = 'farmer' | 'admin'

export interface User {
  id: string
  fullName: string
  email: string
  role: UserRole
}

export interface EtlRun {
  source: string
  status: 'running' | 'success' | 'partial' | 'error' | 'skipped'
  started_at: string
  finished_at: string | null
  rows_written: number | null
  error: string | null
}

export interface TrainingRun {
  runId: string
  cropId: string | null
  startTime: string
  r2Test: number | null
  maeTest: number | null
  nTrain: string | null
  nTest: string | null
}

export interface SavedFarm {
  id: string
  userId: string
  regionId: string
  cropId: string
  label: string | null
  createdAt: string
}
