import { useEffect, useState } from 'react'
import { createTrade, createTradeListing, fetchCropCycles, fetchCrops, fetchRegions, fetchTradeListings } from '@/lib/api'
import { formatInr, formatShortDate } from '@/lib/format'
import { useAuth } from '@/context/AuthContext'
import type { Crop, CropCycle, Region, TradeListing } from '@/types'
import TradeListingStatusBadge from '@/components/TradeListingStatusBadge'

export default function Marketplace() {
  const { currentUser } = useAuth()

  const [listings, setListings] = useState<TradeListing[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [crops, setCrops] = useState<Crop[]>([])
  const [myCropCycles, setMyCropCycles] = useState<CropCycle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [regionIdInput, setRegionIdInput] = useState('')
  const [cropIdInput, setCropIdInput] = useState('')
  const [cropCycleIdInput, setCropCycleIdInput] = useState('')
  const [quantityInput, setQuantityInput] = useState('')
  const [priceInput, setPriceInput] = useState('')
  const [notesInput, setNotesInput] = useState('')
  const [creating, setCreating] = useState(false)

  const [offeringListingId, setOfferingListingId] = useState<string | null>(null)
  const [offerQuantityInput, setOfferQuantityInput] = useState('')
  const [offerPriceInput, setOfferPriceInput] = useState('')
  const [submittingOffer, setSubmittingOffer] = useState(false)
  const [sentOfferIds, setSentOfferIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    Promise.all([fetchTradeListings('open'), fetchRegions(), fetchCrops(), fetchCropCycles()])
      .then(([{ tradeListings: openListings }, regionList, cropList, { cropCycles: cycles }]) => {
        setListings(openListings)
        setRegions(regionList)
        setCrops(cropList)
        setMyCropCycles(cycles)
        if (regionList.length > 0) setRegionIdInput(regionList[0].id)
        if (cropList.length > 0) setCropIdInput(cropList[0].id)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load the marketplace'))
      .finally(() => setLoading(false))
  }, [])

  const handleCreateListing = async () => {
    const quantity = Number(quantityInput)
    const price = Number(priceInput)
    if (!regionIdInput || !cropIdInput || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0) {
      setError('Region, crop, a valid quantity, and a valid price are required.')
      return
    }
    setCreating(true)
    try {
      const { tradeListing } = await createTradeListing({
        regionId: regionIdInput,
        cropId: cropIdInput,
        cropCycleId: cropCycleIdInput || undefined,
        quantityQuintal: quantity,
        askPriceRsPerQuintal: price,
        notes: notesInput.trim() || undefined,
      })
      setListings((prev) => [tradeListing, ...prev])
      setShowCreateForm(false)
      setCropCycleIdInput('')
      setQuantityInput('')
      setPriceInput('')
      setNotesInput('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create that listing')
    } finally {
      setCreating(false)
    }
  }

  const startOffer = (listing: TradeListing) => {
    setOfferingListingId(listing.id)
    setOfferQuantityInput('')
    setOfferPriceInput(String(listing.askPriceRsPerQuintal))
  }

  const handleSubmitOffer = async (listingId: string) => {
    const quantity = Number(offerQuantityInput)
    const price = Number(offerPriceInput)
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0) {
      setError('Enter a valid quantity and price for your offer.')
      return
    }
    setSubmittingOffer(true)
    try {
      await createTrade({ listingId, quantityQuintal: quantity, pricePerQuintal: price })
      setSentOfferIds((prev) => new Set(prev).add(listingId))
      setOfferingListingId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send that offer')
    } finally {
      setSubmittingOffer(false)
    }
  }

  const regionsById = Object.fromEntries(regions.map((r) => [r.id, r]))
  const cropsById = Object.fromEntries(crops.map((c) => [c.id, c]))
  const cropCyclesById = Object.fromEntries(myCropCycles.map((c) => [c.id, c]))

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-ink)]">Marketplace</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Browse open sell listings from other farmers, or list your own crop for sale.
          </p>
        </div>
        {!loading && !showCreateForm && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-brand-dark)]"
          >
            + New listing
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
            List your crop for sale
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
            <select
              value={cropCycleIdInput}
              onChange={(e) => setCropCycleIdInput(e.target.value)}
              className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm sm:col-span-2"
            >
              <option value="">Not linked to a crop cycle (optional)</option>
              {myCropCycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label ?? `${cropsById[c.cropId]?.name ?? c.cropId} · ${regionsById[c.regionId]?.name ?? c.regionId}`}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              step="0.1"
              value={quantityInput}
              onChange={(e) => setQuantityInput(e.target.value)}
              placeholder="Quantity (quintal)"
              className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              placeholder="Asking price (₹/quintal)"
              className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm"
            />
            <input
              type="text"
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              placeholder="Notes (optional)"
              className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm sm:col-span-2"
            />
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleCreateListing}
              disabled={creating}
              className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-brand-dark)] disabled:opacity-60"
            >
              {creating ? 'Saving…' : 'Post listing'}
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
      ) : listings.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-[var(--color-line)] bg-white p-6 text-sm text-[var(--color-ink-soft)]">
          No open listings right now.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {listings.map((listing) => {
            const region = regionsById[listing.regionId]
            const crop = cropsById[listing.cropId]
            const cycle = listing.cropCycleId ? cropCyclesById[listing.cropCycleId] : undefined
            const isOwnListing = currentUser?.id === listing.sellerId
            const isOffering = offeringListingId === listing.id
            const alreadySent = sentOfferIds.has(listing.id)
            return (
              <div key={listing.id} className="rounded-2xl border border-[var(--color-line)] bg-white p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-[var(--color-ink)]">
                        {crop?.name ?? listing.cropId} · {region?.name ?? listing.regionId}
                      </p>
                      <TradeListingStatusBadge status={listing.status} />
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                      Sold by {listing.sellerName ?? 'a farmer'}
                      {isOwnListing && ' (you)'}
                      {cycle && ` · from cycle "${cycle.label ?? crop?.name}"`}
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                      Listed {formatShortDate(listing.createdAt)}
                      {listing.notes && ` · ${listing.notes}`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-right">
                    <p className="text-lg font-semibold text-[var(--color-ink)]">
                      {formatInr(listing.askPriceRsPerQuintal)}/quintal
                    </p>
                    <span className="text-xs text-[var(--color-ink-soft)]">
                      {listing.remainingQuantity} of {listing.quantityQuintal} quintal available
                    </span>
                  </div>
                </div>

                {!isOwnListing && (
                  <div className="mt-3 border-t border-[var(--color-line)] pt-3">
                    {alreadySent ? (
                      <p className="text-sm font-medium text-[var(--color-brand)]">
                        Offer sent — check My Trades for status.
                      </p>
                    ) : isOffering ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          max={listing.remainingQuantity}
                          value={offerQuantityInput}
                          onChange={(e) => setOfferQuantityInput(e.target.value)}
                          placeholder="Quantity (quintal)"
                          className="w-40 rounded-lg border border-[var(--color-line)] px-2 py-1.5 text-sm"
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={offerPriceInput}
                          onChange={(e) => setOfferPriceInput(e.target.value)}
                          placeholder="₹ per quintal"
                          className="w-36 rounded-lg border border-[var(--color-line)] px-2 py-1.5 text-sm"
                        />
                        <button
                          onClick={() => handleSubmitOffer(listing.id)}
                          disabled={submittingOffer}
                          className="rounded-lg bg-[var(--color-brand)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                        >
                          {submittingOffer ? 'Sending…' : 'Send offer'}
                        </button>
                        <button
                          onClick={() => setOfferingListingId(null)}
                          className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-sm font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-paper-soft)]"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startOffer(listing)}
                        className="text-sm font-medium text-[var(--color-brand)]"
                      >
                        Make an offer
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
