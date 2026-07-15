import type { Crop, CropHealthPoint, Prediction, PricePoint, Region, WeatherPoint } from '@/types'

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`${url} failed: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export function fetchRegions(): Promise<Region[]> {
  return getJSON('/api/regions')
}

export function fetchCrops(): Promise<Crop[]> {
  return getJSON('/api/crops')
}

export function fetchWeather(region: string): Promise<WeatherPoint[]> {
  return getJSON(`/api/weather?region=${encodeURIComponent(region)}`)
}

export function fetchCropHealth(region: string, crop: string): Promise<CropHealthPoint[]> {
  return getJSON(`/api/satellite?region=${encodeURIComponent(region)}&crop=${encodeURIComponent(crop)}`)
}

export function fetchPrices(region: string, crop: string): Promise<PricePoint[]> {
  return getJSON(`/api/prices?region=${encodeURIComponent(region)}&crop=${encodeURIComponent(crop)}`)
}

export function fetchPrediction(region: string, crop: string): Promise<Prediction> {
  return getJSON(`/api/predict?region=${encodeURIComponent(region)}&crop=${encodeURIComponent(crop)}`)
}
