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

export interface PestDiseaseRisk {
  level: RiskLevel
  message: string
}

export interface CropHealthAnomaly {
  level: RiskLevel
  message: string
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
  currentPriceRsPerQuintal: number
  pestDiseaseRisk: PestDiseaseRisk
  cropHealthAnomaly: CropHealthAnomaly
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

export type AlertDirection = 'above' | 'below'

export interface SavedFarm {
  id: string
  userId: string
  regionId: string
  cropId: string
  label: string | null
  alertPrice: number | null
  alertDirection: AlertDirection | null
  createdAt: string
}

export type CropCycleStatus = 'active' | 'harvested' | 'abandoned'

export interface CropCycle {
  id: string
  userId: string
  regionId: string
  cropId: string
  label: string | null
  areaAcres: number | null
  sowingDate: string
  expectedHarvestDate: string | null
  actualHarvestDate: string | null
  status: CropCycleStatus
  notes: string | null
  createdAt: string
  totalSpent: number
}

export type ExpenseCategory =
  | 'seeds'
  | 'fertilizer'
  | 'pesticide'
  | 'labor'
  | 'irrigation'
  | 'equipment'
  | 'transport'
  | 'land_rent'
  | 'storage'
  | 'other'

export interface Expense {
  id: string
  userId: string
  cropCycleId: string
  category: ExpenseCategory
  amount: number
  expenseDate: string
  note: string | null
  createdAt: string
}

export type TradeListingStatus = 'open' | 'closed' | 'cancelled'

export interface TradeListing {
  id: string
  sellerId: string
  sellerName: string | null
  regionId: string
  cropId: string
  cropCycleId: string | null
  quantityQuintal: number
  askPriceRsPerQuintal: number
  status: TradeListingStatus
  notes: string | null
  createdAt: string
  remainingQuantity: number
}

export type TradeStatus = 'proposed' | 'accepted' | 'rejected' | 'cancelled' | 'completed'

export interface Trade {
  id: string
  listingId: string
  sellerId: string
  buyerId: string
  quantityQuintal: number
  pricePerQuintal: number
  status: TradeStatus
  createdAt: string
}
