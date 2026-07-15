import { useEffect, useState } from 'react'
import { ApiError, fetchEtlStatus, fetchTrainingRuns, runEtl, runTraining } from '@/lib/api'
import type { EtlRun, TrainingRun } from '@/types'

const STATUS_COLOR: Record<string, string> = {
  running: 'text-[var(--color-accent)]',
  success: 'text-[var(--color-risk-low)]',
  partial: 'text-[var(--color-risk-medium)]',
  error: 'text-[var(--color-risk-high)]',
  skipped: 'text-[var(--color-ink-soft)]',
}

export default function Admin() {
  const [etlRuns, setEtlRuns] = useState<EtlRun[]>([])
  const [trainingRuns, setTrainingRuns] = useState<TrainingRun[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const [etl, training] = await Promise.all([fetchEtlStatus(), fetchTrainingRuns()])
      setEtlRuns(etl.runs)
      setTrainingRuns(training.runs)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load admin status')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const handleRunEtl = async () => {
    setMessage(null)
    try {
      const { status } = await runEtl()
      setMessage(
        status === 'already_running'
          ? 'An ETL run is already in progress.'
          : 'ETL backfill started in the background — this can take several minutes (satellite data is the slowest). Click Refresh to check progress.',
      )
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'Failed to start the ETL run.')
    }
  }

  const handleRunTraining = async () => {
    setMessage(null)
    try {
      await runTraining()
      setMessage('Retraining started in the background. Click Refresh to see new runs once it finishes.')
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'Failed to start training.')
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-ink)]">Admin</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Trigger real-data ETL refreshes and model retraining, and see recent run history.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-paper-soft)] disabled:opacity-60"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="mt-4 flex gap-3">
        <button
          onClick={handleRunEtl}
          className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-brand-dark)]"
        >
          Run ETL now
        </button>
        <button
          onClick={handleRunTraining}
          className="rounded-lg border border-[var(--color-brand)] px-4 py-2 text-sm font-medium text-[var(--color-brand)] hover:bg-[var(--color-brand-soft)]"
        >
          Retrain models
        </button>
      </div>

      {message && <p className="mt-3 text-sm text-[var(--color-ink-soft)]">{message}</p>}
      {error && (
        <div className="mt-3 rounded-lg border border-[var(--color-risk-high)]/30 bg-[var(--color-risk-high)]/10 px-4 py-3 text-sm text-[var(--color-risk-high)]">
          {error}
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
          ETL sources
        </h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-[var(--color-line)] bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-xs uppercase text-[var(--color-ink-soft)]">
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Rows</th>
                <th className="px-4 py-2">Finished</th>
                <th className="px-4 py-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {etlRuns.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-[var(--color-ink-soft)]">
                    No ETL runs yet.
                  </td>
                </tr>
              )}
              {etlRuns.map((run) => (
                <tr key={run.source} className="border-b border-[var(--color-line)] last:border-0">
                  <td className="px-4 py-2 font-medium capitalize">{run.source}</td>
                  <td className={`px-4 py-2 font-medium ${STATUS_COLOR[run.status] ?? ''}`}>{run.status}</td>
                  <td className="px-4 py-2">{run.rows_written ?? '—'}</td>
                  <td className="px-4 py-2 text-[var(--color-ink-soft)]">
                    {run.finished_at ? new Date(run.finished_at).toLocaleString() : '—'}
                  </td>
                  <td className="max-w-xs truncate px-4 py-2 text-[var(--color-risk-high)]" title={run.error ?? ''}>
                    {run.error ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
          Recent training runs (MLflow)
        </h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-[var(--color-line)] bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-xs uppercase text-[var(--color-ink-soft)]">
                <th className="px-4 py-2">Crop</th>
                <th className="px-4 py-2">Started</th>
                <th className="px-4 py-2">R² (test)</th>
                <th className="px-4 py-2">MAE (test)</th>
                <th className="px-4 py-2">Train / test rows</th>
              </tr>
            </thead>
            <tbody>
              {trainingRuns.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-[var(--color-ink-soft)]">
                    No training runs yet — crops need enough real price history before a model can train.
                  </td>
                </tr>
              )}
              {trainingRuns.map((run) => (
                <tr key={run.runId} className="border-b border-[var(--color-line)] last:border-0">
                  <td className="px-4 py-2 font-medium capitalize">{run.cropId ?? '—'}</td>
                  <td className="px-4 py-2 text-[var(--color-ink-soft)]">
                    {run.startTime ? new Date(run.startTime).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-2">{run.r2Test !== null ? run.r2Test.toFixed(3) : '—'}</td>
                  <td className="px-4 py-2">{run.maeTest !== null ? run.maeTest.toFixed(2) : '—'}</td>
                  <td className="px-4 py-2">
                    {run.nTrain ?? '—'} / {run.nTest ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
