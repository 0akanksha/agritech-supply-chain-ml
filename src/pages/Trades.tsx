import { useEffect, useState } from 'react'
import {
  cancelTradeListing,
  fetchCrops,
  fetchRegions,
  fetchTradeListing,
  fetchTradeListings,
  fetchTrades,
  updateTradeStatus,
} from '@/lib/api'
import { formatInr, formatShortDate } from '@/lib/format'
import { useAuth } from '@/context/AuthContext'
import type { Crop, Region, Trade, TradeListing } from '@/types'
import TradeListingStatusBadge from '@/components/TradeListingStatusBadge'
import TradeStatusBadge from '@/components/TradeStatusBadge'

export default function Trades() {
  const { currentUser } = useAuth()

  const [myListings, setMyListings] = useState<TradeListing[]>([])
  const [allMyTrades, setAllMyTrades] = useState<Trade[]>([])
  const [offerListings, setOfferListings] = useState<Record<string, TradeListing>>({})
  const [regions, setRegions] = useState<Region[]>([])
  const [crops, setCrops] = useState<Crop[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actingTradeId, setActingTradeId] = useState<string | null>(null)
  const [cancelingListingId, setCancelingListingId] = useState<string | null>(null)

  useEffect(() => {
    if (!currentUser) return
    Promise.all([fetchTradeListings('mine'), fetchTrades(), fetchRegions(), fetchCrops()])
      .then(async ([{ tradeListings: listings }, { trades: myTrades }, regionList, cropList]) => {
        setMyListings(listings)
        setAllMyTrades(myTrades)
        setRegions(regionList)
        setCrops(cropList)

        const offerListingIds = [...new Set(myTrades.filter((t) => t.buyerId === currentUser.id).map((t) => t.listingId))]
        const entries = await Promise.all(
          offerListingIds.map(async (id) => [id, (await fetchTradeListing(id)).tradeListing] as const),
        )
        setOfferListings(Object.fromEntries(entries))
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load your trades'))
      .finally(() => setLoading(false))
  }, [currentUser])

  const refreshListing = async (listingId: string) => {
    try {
      const { tradeListing } = await fetchTradeListing(listingId)
      setMyListings((prev) => prev.map((l) => (l.id === listingId ? tradeListing : l)))
    } catch {
      // best-effort refresh; the trade status update itself already succeeded
    }
  }

  const handleTradeAction = async (trade: Trade, status: 'accepted' | 'rejected' | 'cancelled' | 'completed') => {
    setActingTradeId(trade.id)
    try {
      const { trade: updated } = await updateTradeStatus(trade.id, status)
      setAllMyTrades((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      if (status === 'accepted') await refreshListing(trade.listingId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update that trade')
    } finally {
      setActingTradeId(null)
    }
  }

  const handleCancelListing = async (id: string) => {
    setCancelingListingId(id)
    try {
      const { tradeListing } = await cancelTradeListing(id)
      setMyListings((prev) => prev.map((l) => (l.id === id ? tradeListing : l)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to cancel that listing')
    } finally {
      setCancelingListingId(null)
    }
  }

  if (!currentUser) return null

  const regionsById = Object.fromEntries(regions.map((r) => [r.id, r]))
  const cropsById = Object.fromEntries(crops.map((c) => [c.id, c]))

  const proposalsByListing = allMyTrades
    .filter((t) => t.sellerId === currentUser.id)
    .reduce<Record<string, Trade[]>>((acc, t) => {
      ;(acc[t.listingId] ??= []).push(t)
      return acc
    }, {})

  const myOffers = allMyTrades.filter((t) => t.buyerId === currentUser.id)

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-bold text-[var(--color-ink)]">My Trades</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Manage the listings you've posted and the offers you've made.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-[var(--color-risk-high)]/30 bg-[var(--color-risk-high)]/10 px-4 py-3 text-sm text-[var(--color-risk-high)]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-6 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-[var(--color-paper-soft)]" />
          ))}
        </div>
      ) : (
        <>
          <section className="mt-6">
            <p className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">My listings</p>
            {myListings.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-[var(--color-line)] bg-white p-6 text-sm text-[var(--color-ink-soft)]">
                You haven't posted any listings yet.
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {myListings.map((listing) => {
                  const region = regionsById[listing.regionId]
                  const crop = cropsById[listing.cropId]
                  const proposals = proposalsByListing[listing.id] ?? []
                  const hasAcceptedTrade = proposals.some((t) => t.status === 'accepted' || t.status === 'completed')
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
                            {formatInr(listing.askPriceRsPerQuintal)}/quintal · {listing.remainingQuantity} of{' '}
                            {listing.quantityQuintal} quintal remaining
                          </p>
                        </div>
                        {listing.status === 'open' && !hasAcceptedTrade && (
                          <button
                            onClick={() => handleCancelListing(listing.id)}
                            disabled={cancelingListingId === listing.id}
                            className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-sm font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-paper-soft)] disabled:opacity-60"
                          >
                            {cancelingListingId === listing.id ? 'Cancelling…' : 'Cancel listing'}
                          </button>
                        )}
                      </div>

                      {proposals.length > 0 && (
                        <div className="mt-3 space-y-2 border-t border-[var(--color-line)] pt-3">
                          {proposals.map((trade) => (
                            <div
                              key={trade.id}
                              className="flex items-center justify-between rounded-lg bg-[var(--color-paper-soft)] px-3 py-2"
                            >
                              <div className="flex items-center gap-2 text-sm">
                                <TradeStatusBadge status={trade.status} />
                                <span className="text-[var(--color-ink)]">
                                  {trade.quantityQuintal} quintal @ {formatInr(trade.pricePerQuintal)}
                                </span>
                                <span className="text-xs text-[var(--color-ink-soft)]">
                                  {formatShortDate(trade.createdAt)}
                                </span>
                              </div>
                              <div className="flex gap-2">
                                {trade.status === 'proposed' && (
                                  <>
                                    <button
                                      onClick={() => handleTradeAction(trade, 'accepted')}
                                      disabled={actingTradeId === trade.id}
                                      className="rounded-lg bg-[var(--color-brand)] px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
                                    >
                                      Accept
                                    </button>
                                    <button
                                      onClick={() => handleTradeAction(trade, 'rejected')}
                                      disabled={actingTradeId === trade.id}
                                      className="rounded-lg border border-[var(--color-line)] px-3 py-1 text-xs font-medium text-[var(--color-ink-soft)] hover:bg-white disabled:opacity-60"
                                    >
                                      Reject
                                    </button>
                                  </>
                                )}
                                {trade.status === 'accepted' && (
                                  <button
                                    onClick={() => handleTradeAction(trade, 'completed')}
                                    disabled={actingTradeId === trade.id}
                                    className="rounded-lg bg-[var(--color-brand)] px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
                                  >
                                    Mark as completed
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section className="mt-8">
            <p className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">My offers</p>
            {myOffers.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-[var(--color-line)] bg-white p-6 text-sm text-[var(--color-ink-soft)]">
                You haven't made any offers yet.
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {myOffers.map((trade) => {
                  const listing = offerListings[trade.listingId]
                  const region = listing ? regionsById[listing.regionId] : undefined
                  const crop = listing ? cropsById[listing.cropId] : undefined
                  return (
                    <div
                      key={trade.id}
                      className="flex items-center justify-between rounded-2xl border border-[var(--color-line)] bg-white p-5"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-[var(--color-ink)]">
                            {crop?.name ?? listing?.cropId ?? 'Listing'} · {region?.name ?? listing?.regionId ?? ''}
                          </p>
                          <TradeStatusBadge status={trade.status} />
                        </div>
                        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                          Offered {trade.quantityQuintal} quintal @ {formatInr(trade.pricePerQuintal)}
                          {listing?.sellerName && ` to ${listing.sellerName}`}
                        </p>
                      </div>
                      {trade.status === 'proposed' && (
                        <button
                          onClick={() => handleTradeAction(trade, 'cancelled')}
                          disabled={actingTradeId === trade.id}
                          className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-sm font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-paper-soft)] disabled:opacity-60"
                        >
                          {actingTradeId === trade.id ? 'Withdrawing…' : 'Withdraw offer'}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
