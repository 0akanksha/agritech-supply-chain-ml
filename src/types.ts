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
  factors: RiskFactor[]
}
